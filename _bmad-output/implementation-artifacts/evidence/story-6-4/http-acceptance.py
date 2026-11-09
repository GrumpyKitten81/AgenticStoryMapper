import json
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://127.0.0.1:44364'
OUT = Path('/tmp/storymapper-6-4-T6soUn')


def request(path, body=None, method=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


map_id = request('/api/story-maps')[1]['storyMaps'][0]['id']


def snapshot():
    return request('/api/story-maps/' + map_id)[1]


def create(level, title, parent=None):
    code, card = request('/api/cards', {'storyMapId': map_id, 'level': level, 'title': title, 'parentId': parent})
    assert code == 201, (code, card)
    return card


def roots(cards):
    return [{'id': card['id'], 'baseVersion': card['version']} for card in cards]


records = []
a = create('story', 'Bulk selected visible')
b = create('story', 'Bulk selected hidden')
c = create('note', 'Bulk selected note')
captured = roots([a, b, c])
for card in [a, b]:
    code, saved = request('/api/cards/' + card['id'], {'baseVersion': card['version'], 'description': 'Concurrent edit'}, 'PATCH')
    assert code == 200, (code, saved)
before = snapshot()
code, conflict = request('/api/cards/bulk', {'storyMapId': map_id, 'cards': captured, 'patch': {'color': '#e5484d'}}, 'PATCH')
assert code == 409 and {entry['id'] for entry in conflict['conflicts']} == {a['id'], b['id']}, (code, conflict)
assert {k: v for k, v in snapshot().items() if k != 'productContext'} == {k: v for k, v in before.items() if k != 'productContext'}
records.append({'case': 'bulk patch two stale roots aborts complete target set', 'status': code, 'conflicts': conflict['conflicts']})
current = [card for card in snapshot()['cards'] if card['id'] in {a['id'], b['id'], c['id']}]
code, saved = request('/api/cards/bulk', {'storyMapId': map_id, 'cards': roots(current), 'patch': {'color': '#e5484d', 'estimate': 0}}, 'PATCH')
assert code == 200 and len(saved['cards']) == 3, (code, saved)
assert all(card['color'] == '#e5484d' and card['estimate'] == 0 for card in saved['cards'])
records.append({'case': 'complete selected patch with hidden representative and Note', 'status': code, 'cards': roots(saved['cards'])})
code, archived = request('/api/cards/bulk', {'storyMapId': map_id, 'cards': roots(saved['cards']), 'patch': {'status': 'archived'}}, 'PATCH')
assert code == 200 and all(card['status'] == 'archived' for card in archived['cards'])
assert all(any(card['id'] == item['id'] for card in snapshot()['cards']) for item in current)
records.append({'case': 'Archive retains Cards distinct from permanent Delete', 'status': code, 'ids': [card['id'] for card in archived['cards']]})
parent = create('activity', 'Delete overlap parent')
step = create('step', 'Delete overlap selected child', parent['id'])
survivor = create('note', 'Delete overlap surviving descendant', step['id'])
opening = snapshot()
selected = [next(card for card in opening['cards'] if card['id'] == item['id']) for item in [parent, step]]
command = {'storyMapId': map_id, 'cards': roots(selected), 'affectedCards': roots(opening['cards']), 'strategy': 'unassign'}
for card in selected:
    code, saved = request('/api/cards/' + card['id'], {'baseVersion': card['version'], 'description': 'Concurrent edit'}, 'PATCH')
    assert code == 200
before = snapshot()
code, conflict = request('/api/cards/delete-set', command)
assert code == 409 and {parent['id'], step['id']}.issubset({entry['id'] for entry in conflict['conflicts']}), (code, conflict)
assert {k: v for k, v in snapshot().items() if k != 'productContext'} == {k: v for k, v in before.items() if k != 'productContext'}
records.append({'case': 'atomic Delete two stale selected overlapping roots', 'status': code, 'conflicts': conflict['conflicts']})
command['cards'] = roots([card for card in before['cards'] if card['id'] in {parent['id'], step['id']}])
command['affectedCards'] = roots(before['cards'])
code, deleted = request('/api/cards/delete-set', command)
assert code == 200 and set(deleted['cardIds']) == {parent['id'], step['id']}, (code, deleted)
after = snapshot()
remaining = next(card for card in after['cards'] if card['id'] == survivor['id'])
assert remaining['parentId'] is None and remaining['version'] > survivor['version']
assert not any(card['id'] in {parent['id'], step['id']} for card in after['cards'])
records.append({'case': 'overlap Delete removes explicit set once and retains unselected descendant', 'status': code, 'deleted': deleted['cardIds'], 'survivor': remaining})
evidence = {'surface': 'actual TCP HTTP', 'storage': 'disposable external temporary fixture', 'mapId': map_id, 'projectId': after['storyMap']['projectId'], 'records': records}
(OUT / 'http-acceptance.json').write_text(json.dumps(evidence, indent=2) + '\n')
(OUT / 'restart-expected.json').write_text(json.dumps(after, indent=2) + '\n')
print(json.dumps({'cases': len(records), 'mapId': map_id, 'projectId': after['storyMap']['projectId']}))
