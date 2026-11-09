import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from urllib.parse import unquote, urlsplit


OWNED = {'README.md', 'docs/RUNBOOK.md', 'CONTRIBUTING.md', 'docs/usability-report.md'}
AUTHORING_PLACEHOLDERS = {'URL'}
INLINE_LINK = re.compile(r'\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)')
REFERENCE = re.compile(r'^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)')


def prose_lines(text):
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if marker:
            value = marker[1]
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield number, line


def heading_anchors(text):
    anchors, counts = set(), collections.Counter()
    previous = ''
    for _, line in prose_lines(text):
        heading = re.match(r'^\s{0,3}#{1,6}\s+(.+?)\s*#*$', line)
        title = heading[1] if heading else previous if re.fullmatch(r'\s{0,3}(?:=+|-+)\s*', line) else None
        anchors.update(re.findall(r'<(?:a|h[1-6])\b[^>]*(?:id|name)=["\']([^"\']+)', line))
        previous = line.strip()
        if not title:
            continue
        title = re.sub(r'<[^>]*>', '', title)
        title = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', title)
        slug = ''.join(c for c in title.lower() if c in ' -_' or unicodedata.category(c)[0] in 'LN')
        slug = slug.replace(' ', '-')
        count = counts[slug]
        counts[slug] += 1
        anchors.add(f'{slug}-{count}' if count else slug)
    return anchors


def local_links(path):
    for number, line in prose_lines(path.read_text(encoding='utf-8')):
        values = [match[1].strip('<>') for match in INLINE_LINK.finditer(line)]
        reference = REFERENCE.match(line)
        if reference:
            values.append(reference[1].strip('<>'))
        for value in values:
            yield number, value


def inspect_link(root, tracked, path, number, raw, anchors):
    row = {'file': path.as_posix(), 'line': number, 'target': raw}
    if raw in AUTHORING_PLACEHOLDERS:
        row['reason'] = 'recognized URL authoring placeholder'
        return 'intentional', row
    if raw.startswith('/') or re.match(r'^[A-Za-z]:[\\/]', raw) or any(c in raw for c in '{}'):
        row['reason'] = 'unexpected absolute/root-relative or malformed template target; not read'
        return 'invalid_targets', row
    try:
        parsed = urlsplit(raw)
    except ValueError:
        row['reason'] = 'malformed link target; not read'
        return 'invalid_targets', row
    if parsed.scheme or raw.startswith('//'):
        return 'external', None
    target = (root / path.parent / unquote(parsed.path)).resolve() if parsed.path else root / path
    if not target.is_relative_to(root):
        row['reason'] = 'context outside repository; not read'
        return 'invalid_targets', row
    relative = target.relative_to(root).as_posix()
    prefix = '' if relative == '.' else relative.rstrip('/') + '/'
    if relative not in tracked and not any(p.startswith(prefix) for p in tracked):
        row['reason'] = 'target is not a tracked file or directory with tracked descendants; not read'
        return 'missing_files', row
    if not target.exists() or target.is_file() and relative not in tracked:
        row['reason'] = 'tracked target absent from worktree or not a tracked file; not read'
        return 'missing_files', row
    if parsed.fragment and target.suffix.lower() == '.md':
        if relative not in anchors:
            anchors[relative] = heading_anchors(target.read_text(encoding='utf-8'))
        if unquote(parsed.fragment) not in anchors[relative]:
            row['scope'] = 'changed_public_document' if path.as_posix() in OWNED else 'preexisting_other_document'
            return 'missing_anchors', row
    return 'resolved', None


def check(root):
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0'))
    files = sorted(p for p in tracked if p.endswith('.md') and (root / p).is_file())
    rows = {'missing_files': [], 'missing_anchors': [], 'invalid_targets': [], 'intentional': []}
    counts, anchors = collections.Counter(), {}
    for name in files:
        for number, raw in local_links(root / name):
            category, row = inspect_link(root, tracked, Path(name), number, raw, anchors)
            counts[category] += 1
            if row:
                rows[category].append(row)
    return {
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'scope': 'Tracked Markdown inline and reference-definition local targets and Markdown heading anchors; fenced examples excluded. External links are not fetched. This is not a full Markdown renderer.',
        'markdownFiles': len(files), 'counts': dict(counts), **rows,
        'ownedSha256': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in sorted(OWNED)},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()).resolve()
    report = check(root)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'markdownFiles': report['markdownFiles'], 'counts': report['counts']}))
    raise SystemExit(bool(report['missing_files'] or report['invalid_targets'] or any(r['scope'] == 'changed_public_document' for r in report['missing_anchors'])))


if __name__ == '__main__':
    main()
