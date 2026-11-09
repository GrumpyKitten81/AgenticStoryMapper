require 'yaml'
require 'json'
require 'pathname'
require 'digest'
require 'open3'

root = Pathname.new(__dir__).join('../../../..').realpath
Dir.chdir(root)
forms = Dir.glob('.github/ISSUE_TEMPLATE/0*.yml').sort
expected_names = %w[Feature Bug Epic Story Task Spike Theme]
raise 'Unexpected form inventory' unless forms.length == expected_names.length
form_results = forms.map.with_index do |file, index|
  form = YAML.safe_load(File.read(file))
  raise "Invalid name/description/title: #{file}" unless form['name'] == expected_names[index] && form['description'].is_a?(String) && !form['description'].empty? && form['title'] == "[#{form['name']}]: "
  raise "Unexpected top-level properties: #{file}" unless form.keys.sort == %w[body description name title]
  body = form['body']
  raise "Invalid body: #{file}" unless body.is_a?(Array) && body.length > 1
  notice = body.first
  raise "Invalid security notice: #{file}" unless notice.keys.sort == %w[attributes type] && notice['type'] == 'markdown' && notice['attributes'].keys == ['value'] && notice['attributes']['value'].include?('read SECURITY.md in the repository root') && notice['attributes']['value'].include?('do not submit vulnerability details here')
  ids = []
  labels = []
  fields = body.drop(1)
  fields.each do |field|
    raise "Invalid editable field: #{file}" unless field.keys.sort == %w[attributes id type validations] && field['type'] == 'textarea' && field['id'].match?(/\A[a-z0-9-]+\z/)
    attributes = field['attributes']
    raise "Invalid field attributes: #{file}" unless attributes.keys.sort == %w[description label] && attributes.values.all? { |value| value.is_a?(String) && !value.strip.empty? }
    raise "Invalid required flag: #{file}" unless field['validations'].keys == ['required'] && [true, false].include?(field['validations']['required'])
    ids << field['id']
    labels << attributes['label']
  end
  raise "Duplicate field ID/label: #{file}" unless ids.uniq == ids && labels.uniq == labels
  raise "No required editable fields: #{file}" unless fields.any? { |field| field['validations']['required'] }
  raise "References must be last: #{file}" unless ids.last == 'references'
  %w[acceptance-criteria success-criteria].each do |id|
    next unless ids.include?(id)
    expected_position = form['name'] == 'Bug' ? 2 : 1
    raise "Core/criteria order: #{file}" unless ids.index(id) == expected_position
  end
  raise "BDD order: #{file}" if ids.include?('bdd') && ids.index('bdd') != ids.index('acceptance-criteria') + 1
  { file: file, name: form['name'], fields: ids, required: fields.select { |field| field['validations']['required'] }.map { |field| field['id'] } }
end
raise 'Unexpected issue config or routing' unless YAML.safe_load(File.read('.github/ISSUE_TEMPLATE/config.yml')) == { 'blank_issues_enabled' => false }

markdown = %w[CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md .github/PULL_REQUEST_TEMPLATE.md]
local_links = (markdown + forms).flat_map do |file|
  source = File.read(file)
  if markdown.include?(file)
    raise "Missing metadata: #{file}" unless source.include?('2026-10-20') && source.match?(/Version: \d+/) && source.include?('Reproducing statement:') && source.include?('## Changelog')
  end
  source.scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.map do |target|
    next if target.match?(/\A[a-z]+:/i) || target.start_with?('#')
    path = Pathname.new(file).dirname.join(target.split('#', 2).first).cleanpath
    raise "Missing local link #{file} -> #{target}" unless path.exist?
    { file: file, target: target }
  end.compact
end
surfaces = ['LICENSE'] + markdown + forms + ['.github/ISSUE_TEMPLATE/config.yml']
markers = surfaces.flat_map do |file|
  File.read(file).scan(/\[(COPYRIGHT_HOLDER|PRIVATE_SECURITY_CONTACT|CONDUCT_CONTACT)\]/).flatten.map { |marker| { file: file, marker: marker } }
end
%w[COPYRIGHT_HOLDER PRIVATE_SECURITY_CONTACT CONDUCT_CONTACT].zip(%w[LICENSE SECURITY.md CODE_OF_CONDUCT.md]).each do |marker, file|
  raise "Missing declaration #{marker}" unless File.read(file).include?("[#{marker}]")
end
%w[SECURITY.md CODE_OF_CONDUCT.md].each do |file|
  raise "Inactive reporting contact not explicit: #{file}" unless File.read(file).include?('inactive placeholder') && File.read(file).include?('Publication is blocked')
end
contributing = File.read('CONTRIBUTING.md')
raise 'Missing tracked-input guidance' unless contributing.include?('stage intended new files') && contributing.include?('git diff --cached') && contributing.include?('prohibited inputs')
raise 'Missing Corepack provisioning' unless contributing.include?('npm install --global corepack@0.35.0') && contributing.include?('active Node 24 environment') && contributing.include?('Hosted Corepack provisioning remains unverified')
raise 'Missing commit guidance' unless contributing.include?('<type>[optional scope]: <short description>') && contributing.include?('docs: clarify contributor setup')
raise 'Internal scope decision in public guide' if contributing.include?('waived employer approval') || contributing.include?('name searches')
pull_request = File.read('.github/PULL_REQUEST_TEMPLATE.md')
visible_pull_request = pull_request.gsub(/<!--.*?-->/m, '')
raise 'Missing public security guidance' unless visible_pull_request.include?('read SECURITY.md in the repository root')
raise 'Visible template maintenance metadata' if visible_pull_request.match?(/Date:|Version:|Reproducing statement:|Changelog/)
raise 'Hosted template has a file-relative security link' if (forms + ['.github/PULL_REQUEST_TEMPLATE.md']).any? { |file| File.read(file).match?(/\]\([^)]*SECURITY\.md\)/) }
%w[test typecheck build check check-licenses].each do |command|
  raise "Undeclared command #{command}" unless JSON.parse(File.read('package.json'))['scripts'].key?(command) && contributing.include?("corepack pnpm #{command}")
end
%w[setup start].each { |command| raise "Missing launcher #{command}" unless File.file?("scripts/#{command}.mjs") && contributing.include?("node scripts/#{command}.mjs") }
%w[ubuntu-latest macos-latest windows-latest].each do |os|
  raise "Missing OS check #{os}" unless contributing.include?("Quality (#{os})") && File.read('.github/workflows/ci.yml').include?(os)
end
raise 'Wrong runtime guidance' unless contributing.include?('>=24 <25') && contributing.include?('9.15.4') && JSON.parse(File.read('package.json'))['packageManager'] == 'pnpm@9.15.4'
raise 'Manual contribution requirement missing' unless contributing.include?('No AI subscription')
raise 'Authority missing' unless contributing.include?('Only authorized repository maintainers merge changes and create releases.')
raise 'Upstream conditions missing' unless contributing.include?('root MIT license does not replace upstream licenses')
raise 'MIT notice missing' unless File.read('LICENSE').start_with?("MIT License\n\nCopyright (c) 2026 [COPYRIGHT_HOLDER]\n")

sprint = '_bmad-output/implementation-artifacts/sprint-status.yaml'
baseline = JSON.parse(File.read(File.join(__dir__, 'implementation-verification.json'))).fetch('protected_sprint')
index, status = Open3.capture2('git', 'show', ":#{sprint}")
raise 'Cannot read sprint index' unless status.success?
protected_result = { worktree: Digest::SHA256.file(sprint).hexdigest, index: Digest::SHA256.hexdigest(index) }.map do |key, value|
  [key, { sha256: value, entry_sha256: baseline.fetch(key.to_s), matches_entry: baseline.fetch(key.to_s) == value }]
end.to_h
puts JSON.pretty_generate({ result: 'pass', parser: "Ruby #{RUBY_VERSION} / Psych #{Psych::VERSION}", forms: form_results, config: 'pass', local_links: local_links, markers: markers, protected_sprint: protected_result, surfaces: surfaces.map { |file| { file: file, sha256: Digest::SHA256.file(file).hexdigest } }, limits: ['Local link and schema inspection do not certify hosted GitHub rendering.', 'English and reporting semantics are also manually inspected.', 'Canonical MIT text compared manually with choosealicense.com/licenses/mit/ on 2026-10-20.', 'Missing private details and prior publication/native/hosted prerequisites remain open.'] })
