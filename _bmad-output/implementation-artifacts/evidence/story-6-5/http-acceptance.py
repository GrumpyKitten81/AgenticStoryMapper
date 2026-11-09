import json
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://127.0.0.1:44365'
OUT = Path('/tmp/storymapper-6-5-fixture-path').read_text()
records = []


def request(path, body=None, method=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


original = request('/api/story-maps')[1]['storyMaps'][0]
map_id = original['id']
project_id = original['projectId']


def snapshot():
    return request('/api/story-maps/' + map_id)[1]


def create(level, title, parent=None, release=None):
    code, card = request('/api/cards', {'storyMapId': map_id, 'level': level, 'title': title, 'parentId': parent, 'releaseId': release})
    assert code == 201, (code, card)
    return card


before = snapshot()
assert request('/api/story-maps/' + map_id, {'cardKeyPrefix': ' ', 'baseVersion': original['version']}, 'PATCH')[0] == 400
code, saved = request('/api/story-maps/' + map_id, {'cardKeyPrefix': ' HTTP ', 'baseVersion': original['version']}, 'PATCH')
assert code == 200 and saved['storyMap']['cardKeyPrefix'] == 'HTTP', (code, saved)
after = snapshot()
for field in ['cards', 'sourceLinks', 'githubLinks', 'remoteWorkItemLinks', 'externalRefs']:
    assert before.get(field) == after.get(field), field
code, stale = request('/api/story-maps/' + map_id, {'cardKeyPrefix': 'STALE', 'baseVersion': original['version']}, 'PATCH')
assert code == 409 and stale['conflicts'][0]['currentVersion'] == saved['storyMap']['version'], (code, stale)
assert snapshot()['storyMap']['cardKeyPrefix'] == 'HTTP'
records.append({'case': 'blank rejected; versioned trimmed prefix; unchanged keys/bindings; stale refusal', 'conflictStatus': code})
activity = next(card for card in after['cards'] if card['level'] == 'activity')
step = next(card for card in after['cards'] if card['level'] == 'step')
release = after['releases'][0]['id']
notes = [create('note', 'Native root Note'), create('note', 'Native Activity Note', activity['id']), create('note', 'Native Step Note', step['id'], release)]
for note in notes:
    code, updated = request('/api/cards/' + note['id'], {'estimate': 99, 'status': 'done', 'baseVersion': note['version']}, 'PATCH')
    assert code == 200, (code, updated)
story = create('story', 'Native zero Story', step['id'], release)
assert story['key'].startswith('HTTP-')
code, zero = request('/api/cards/' + story['id'], {'estimate': 0, 'baseVersion': story['version']}, 'PATCH')
assert code == 200
all_cards = snapshot()['cards']
for scope in ['', '&releaseId=' + release, '&releaseId=unscheduled']:
    code, report = request('/api/reports/release-summary?storyMapId=' + map_id + scope)
    eligible = [card for card in all_cards if card['level'] == 'story' and (not scope or card.get('releaseId') == (None if scope.endswith('unscheduled') else release))]
    assert code == 200 and report['totalCards'] == report['totalStories'] == len(eligible), (code, report)
    assert report['estimateTotal'] == sum(card.get('estimate') or 0 for card in eligible), report
    assert report['unestimatedCards'] == sum(card.get('estimate') is None for card in eligible), report
    counts = {}
    for card in eligible:
        counts[card['status']] = counts.get(card['status'], 0) + 1
    assert report['statusCounts'] == counts, report
records.append({'case': 'actual HTTP all/release/unscheduled Story-only count/estimate/status/unestimated with estimated Notes and zero Story'})
code, connection = request('/api/connectors/connections', {'projectId': project_id, 'provider': 'github', 'authMode': 'token', 'name': 'Local planning fixture', 'owner': 'fixture', 'repository': 'repo', 'readOnly': False})
assert code == 201, (code, connection)
assert request('/api/settings/safety?projectId=' + project_id, {'github': True}, 'PATCH')[0] == 200
ids = [story['id'], *[note['id'] for note in notes]]
code, plan = request('/api/sync/work-items/plan', {'storyMapId': map_id, 'connectionId': connection['connection']['id'], 'mode': 'push', 'cardIds': ids})
assert code == 200 and [item['cardId'] for item in plan['plan']['items']] == [story['id']], (code, plan)
code, legacy = request('/api/github/issue-dry-run', {'storyMapId': map_id, 'repo': 'fixture/repo', 'cardIds': ids})
assert code == 200 and [item['cardId'] for item in legacy['dryRuns']] == [story['id']], (code, legacy)
assert request('/api/settings/safety?projectId=' + project_id, {'github': False}, 'PATCH')[0] == 200
records.append({'case': 'both actual HTTP local push planners exclude root/Activity/Step Notes; no remote request or push'})
final = snapshot()
Path(OUT, 'before-restart.json').write_text(json.dumps(final, indent=2) + '\n')
evidence = {'surface': 'actual TCP HTTP', 'base': BASE, 'fixture': OUT, 'records': records, 'mapId': map_id, 'projectId': project_id, 'url': BASE + '/projects/' + project_id + '/story-maps/' + map_id + '/discovery'}
Path(OUT, 'http-acceptance.json').write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps(evidence))
