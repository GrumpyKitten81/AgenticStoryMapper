import argparse
import hashlib
import json
import pathlib
import tarfile
import tempfile

EXPECTED_ARCHIVE_SHA256 = 'b2a2de190a1c8ab06363ff4431541cfbd8f22d44176aff3aff69f0e7de206445'


def require(condition, evidence):
    if not condition:
        raise AssertionError(evidence)


def extract_and_verify(archive_path):
    archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    require(archive_hash == EXPECTED_ARCHIVE_SHA256, 'archive hash')
    root = pathlib.Path(tempfile.mkdtemp(prefix='story413-independent-', dir='/tmp'))
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        for member in members:
            require(not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts and member.isfile(), member.name)
        archive.extractall(root, filter='data')
    manifest_counts = {}
    for name, base in [('bundle-manifest.json', root), ('observations/evidence-manifest.json', root / 'observations'), ('observations/screenshot-manifest.json', root / 'observations')]:
        manifest = json.loads((root / name).read_text())
        for filename, expected in manifest.items():
            require(hashlib.sha256((base / filename).read_bytes()).hexdigest() == expected, filename)
        manifest_counts[name] = len(manifest)
    verify_manifest_coverage(root, members)
    return root, archive_hash, members, manifest_counts


def verify_manifest_coverage(root, members):
    bundle = json.loads((root / 'bundle-manifest.json').read_text())
    observations = json.loads((root / 'observations/evidence-manifest.json').read_text())
    screenshots = json.loads((root / 'observations/screenshot-manifest.json').read_text())
    names = {member.name for member in members}
    require(len(names) == len(members) == 232, 'archive member count/duplicates')
    require(set(bundle) == names - {'bundle-manifest.json'} and len(bundle) == 231, 'exact bundle coverage')
    observation_names = {name.removeprefix('observations/') for name in names if name.startswith('observations/')}
    require(set(observations) == observation_names - {'evidence-manifest.json'} and len(observations) == 70, 'exact observation coverage')
    require(set(screenshots) == {name for name in observation_names if name.endswith('.jpg')} and len(screenshots) == 19, 'exact screenshot coverage')


def verified_results(change_set):
    operations = change_set['operations']
    operation_ids = [operation['operationId'] for operation in operations]
    require(len(operation_ids) == len(set(operation_ids)), 'unique operation IDs')
    execution = change_set['execution']
    selected = execution['selectedOperationIds']
    results = execution['operationResults']
    result_ids = [result['operationId'] for result in results]
    require(len(selected) == len(set(selected)) and set(selected) <= set(operation_ids), 'unique selected operation IDs')
    require(len(result_ids) == len(set(result_ids)) and set(result_ids) == set(selected), 'exact selected/executed IDs')
    for result in results:
        require(0 <= result['index'] < len(operations), ['execution index', result])
        require(operations[result['index']]['operationId'] == result['operationId'], ['execution index correspondence', result])
    return {result['operationId']: result for result in results}


def read(observations, name):
    return json.loads((observations / name).read_text())


def capture(observations, index):
    names = sorted(observations.glob(f's{index}-capture-*'))
    require(len(names) == 1, names)
    return json.loads(names[0].read_text())


def entities(snapshot):
    return {item['id']: item for key in ['cards', 'releases', 'externalRefs', 'sourceLinks'] for item in snapshot[key]}


def resolve_aliases(all_sets):
    aliases = {}
    for current in all_sets:
        for result in (current.get('execution') or {}).get('operationResults', []):
            operation = current['operations'][result['index']]
            if result['entityIds'] and operation['op'] == 'upsert' and operation['entity'] in ['card', 'release']:
                alias, identity = operation['entityId'], result['entityIds'][0]
                require(alias not in aliases or aliases[alias] == identity, ['inconsistent alias', alias])
                aliases[alias] = identity
    return aliases


def verify_operations(change_set, snapshot, details, all_sets, selected=None):
    stored = entities(snapshot)
    documents = {detail['document']['id']: detail for detail in details}
    aliases = resolve_aliases(all_sets)
    results = verified_results(change_set)
    require(selected is None or selected <= set(results), 'audited effects must be executed')
    checked = []
    for operation in change_set['operations']:
        identifier = operation['operationId']
        if identifier not in results or (selected is not None and identifier not in selected):
            continue
        result = results[identifier]
        after = operation.get('after', {})
        ids = result['entityIds']
        kind = operation['op']
        if kind == 'import':
            document = documents[ids[0]]['document']
            for key in ['projectId', 'title', 'type', 'fileHash']:
                require(document[key] == after[key], [identifier, key])
            require(hashlib.sha256(after['inlineContent'].encode()).hexdigest() == document['fileHash'], [identifier, 'content hash'])
        elif kind == 'upsert':
            actual = stored[ids[0]]
            for key, value in after.items():
                expected = aliases.get(value, value) if isinstance(value, str) else value
                require(actual.get(key) == expected, [identifier, key, actual.get(key), expected])
        elif kind == 'unlink':
            require(operation['entityId'] not in stored, [identifier, 'old link absent'])
        elif kind == 'archive':
            require(stored[operation['entityId']]['status'] == 'archived', [identifier, 'status'])
        elif kind == 'link':
            link = next(stored[identity] for identity in ids if identity in stored and stored[identity].get('kind') == 'chunk')
            require(link['cardId'] == aliases[after['cardId']], [identifier, 'cardId'])
            imported = results[after['chunk']['operationId']]['entityIds'][0]
            chunk = next(chunk for chunk in documents[imported]['chunks'] if chunk['id'] == link['chunkId'])
            require(chunk['locator'] == after['chunk']['locator'], [identifier, 'locator'])
        else:
            raise AssertionError(kind)
        checked.append({'operationId': identifier, 'classification': f"{operation['entity']}:{kind}", 'passed': True})
    return checked


def dependent_exclusion(preview):
    excluded = {'publish-epic-1'}
    while True:
        expanded = excluded | {operation['operationId'] for operation in preview['operations'] if set(operation['dependencies']) & excluded}
        if expanded == excluded:
            return excluded
        excluded = expanded


def audit_initial(observations):
    initial_results = []
    for index, expected in [(1, 134), (2, 134), (3, 115), (4, 134), (5, 134), (6, 134)]:
        if index in [1, 4, 5]:
            initial = capture(observations, index)
            snapshot = initial['snapshot']
            sets = initial['changesets']['data']['changeSets']
            details = read(observations, 's1-retention-proof.json' if index == 1 else f's{index}-durable-proof.json')['details']
        else:
            initial = read(observations, f's{index}-durable-proof.json')
            snapshot, sets, details = initial['snapshot'], initial['changesets']['changeSets'], initial['details']
        current = next(current for current in sets if current.get('execution'))
        expected_ids = set(read(observations, 's3-reduced-preview.json')['selectedOperationIds']) if index == 3 else {operation['operationId'] for operation in current['operations']}
        require(set(current['execution']['selectedOperationIds']) == expected_ids, ['expected selection', index])
        if index == 3:
            excluded = {operation['operationId'] for operation in current['operations']} - expected_ids
            require(excluded == dependent_exclusion(read(observations, 's3-reduced-preview.json')), 'dependent deselection closure')
        checks = verify_operations(current, snapshot, details, sets)
        require(len(checks) == expected, ['initial count', index])
        initial_results.append({'evidenceScenarioIndex': index, 'verifiedOperations': len(checks), 'checks': checks})
    return initial_results


def audit_refresh(observations):
    final = read(observations, 's4-durable-proof.json')
    sets = final['changesets']['changeSets']
    refresh = next(current for current in sets if current['id'] == 'c8df812f-c56a-4605-b6f4-d39f9379324a')
    changed = {operation['operationId'] for operation in read(observations, 's4-edited-preview.json')['operations'] if operation['status'] == 'changed'}
    refresh_checks = verify_operations(refresh, final['snapshot'], final['details'], sets, changed)
    require(len(refresh_checks) == 19, 'refresh count')
    initial = capture(observations, 4)
    current = initial['changesets']['data']['changeSets'][0]
    initial_results = verified_results(current)
    require(set(initial_results) == {operation['operationId'] for operation in current['operations']}, 'S4 initial full execution')
    require(set(verified_results(refresh)) == set(read(observations, 's4-edited-preview.json')['selectedOperationIds']), 'refresh selected execution')
    superseded = retained_initial_effects(current, initial['snapshot'], final)
    initial_applied = len(initial_results)
    initial_kept = initial_applied - len(superseded)
    refresh_kept = len(refresh_checks)
    retention = {'kept': initial_kept + refresh_kept, 'applied': initial_applied + len(changed), 'initialApplied': initial_applied, 'initialKept': initial_kept, 'refreshAppliedChanged': len(changed), 'refreshKept': refresh_kept, 'refreshUnchangedExcluded': len(verified_results(refresh)) - len(changed), 'supersededOperationIds': superseded}
    return refresh_checks, retention


def comparable_entity(entity):
    return {key: value for key, value in entity.items() if key not in ['version', 'createdAt', 'updatedAt']}


def retained_initial_effects(current, initial_snapshot, final):
    before = entities(initial_snapshot)
    after = entities(final['snapshot'])
    documents = {item['id']: item for detail in final['details'] for item in [detail['document'], *detail['chunks']]}
    initial_chunks = {chunk['id']: chunk for chunk in initial_snapshot['sourceChunks']}
    superseded = []
    for result in verified_results(current).values():
        operation = current['operations'][result['index']]
        if operation['entity'] == 'sourceDocument':
            document = documents[result['entityIds'][0]]
            intended = operation['after']
            require(all(document[key] == intended[key] for key in ['projectId', 'title', 'type', 'fileHash']), [operation['operationId'], 'retained import fields'])
            require(hashlib.sha256(intended['inlineContent'].encode()).hexdigest() == document['fileHash'], 'retained content hash')
            kept = all(identity in documents for identity in result['entityIds'])
            require(all(documents[identity] == initial_chunks[identity] for identity in result['entityIds'][1:] if identity in initial_chunks), [operation['operationId'], 'retained captured chunk fields'])
        else:
            effect_ids = [identity for identity in result['entityIds'] if operation['entity'] != 'sourceLink' or before[identity].get('kind') == 'chunk']
            require(effect_ids, ['effect identities', operation['operationId']])
            kept = all(identity in after and comparable_entity(before[identity]) == comparable_entity(after[identity]) for identity in effect_ids)
        if not kept:
            superseded.append(result['operationId'])
    return superseded


def compare_snapshots(before, after):
    require(before.keys() == after.keys(), 'snapshot keys')
    differences = {key: {'before': before[key], 'after': after[key]} for key in before if before[key] != after[key]}
    require(set(differences) <= {'productContext'}, ['unexpected snapshot changes', differences])
    if differences:
        context_before = before['productContext']
        context_after = after['productContext']
        require(context_before.keys() == context_after.keys(), 'productContext keys')
        changed = [key for key in context_before if context_before[key] != context_after[key]]
        require(set(changed) <= {'id', 'updatedAt'}, ['productContext changes', changed])
    return {'rawSnapshotsIdentical': before == after, 'identicalKeys': [key for key in before if before[key] == after[key]], 'differences': differences, 'domainContentExcludingProductContextIdentityAndTimestampIdentical': True}


def audit_scenario5(observations):
    initial = capture(observations, 5)['snapshot']
    restored = read(observations, 's5-post-restore-durable-proof.json')['snapshot']
    before = read(observations, 's5-pre-conflict-state.json')
    after = read(observations, 's5-post-conflict-state.json')
    return {'status': 'checked historical captured snapshots', 'conflict': compare_snapshots(before, after), 'restore': compare_snapshots(initial, restored), 'limitation': 'Empty productContext IDs and updatedAt differ; full raw-snapshot identity is false. No browser run or independently observed Restore action is claimed.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    root, archive_hash, members, manifest_counts = extract_and_verify(args.archive)
    observations = root / 'observations'
    initial_results = audit_initial(observations)
    refresh_checks, retention = audit_refresh(observations)
    output = {
        'boundary': 'Independent offline historical capture audit; no browser run, application mutation or fresh UI acceptance',
        'archiveSha256': archive_hash,
        'auditScriptSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'archiveBytes': args.archive.stat().st_size,
        'extractionDirectory': str(root),
        'archiveMembers': len(members),
        'verifiedManifestCounts': manifest_counts,
        'initialOperationAudits': initial_results,
        'refreshEffectAudit': refresh_checks,
        'scenario4Retention': retention,
        'scenario5PrePostRestoreAudit': audit_scenario5(observations),
        'limitations': ['Import checks verify metadata and intended inline-content SHA256 against stored fileHash; parser chunk text is not rederived. Initial snapshot-exposed chunks are compared exactly at S4 retention; unexposed chunks have identity retention only.', 'Screenshot timestamps and browser-action chronology are not independently instrumented.', 'Supplemental commit provenance is a separate git-history check, not a claim that its commit is merged.'],
    }
    args.output.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'result': 'PASS', 'output': str(args.output), 'archiveMembers': len(members), 'manifestCounts': manifest_counts, 'initialOperationCounts': [item['verifiedOperations'] for item in initial_results], 'refreshEffects': len(refresh_checks), 'scenario4Retention': retention, 'scenario5PrePostRestore': 'checked; productContext identity/timestamp differences recorded'}))


if __name__ == '__main__':
    main()
