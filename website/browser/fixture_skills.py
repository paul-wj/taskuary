"""Synthetic Skill review data; loaded only by the isolated browser fixture server."""
from pathlib import Path


def install(app, store):
    @app.get('/api/fixture/skill-library')
    def seed():
        from taskuary import config, firstrun, skillstate as state, skillpackages as packages, skillauthoring, skilldiscovery
        firstrun.set_dismissed(store, True, 'fixture')
        skilldiscovery.BACKGROUND = False
        home = config.home()
        packages.native_roots = lambda: {'codex': home / 'fixture-native' / 'skills'}
        source = store.create_task({'Title': 'Compare fictional monthly reports', 'Source': 'manual', 'Status': 'done'}, 'owner')
        candidate = state.create(store, 'candidate', {'state': 'suggested', 'action': 'create', 'slug': 'taskuary-report-check',
            'title': 'Reusable report comparison', 'description': 'Compare report fields and list differences',
            'rationale': 'AI identified the same verified comparison procedure in completed work.', 'varies': 'file locations',
            'target_digest': None, 'evidence': [{'task_id': source, 'ref': f'TQ-{source:04d}',
                'title': 'Compare fictional monthly reports', 'reason': 'Verified comparison method'}]}, key='browser-suggestion')
        task = store.create_task({'Title': 'Create Skill: Synthetic review fixture', 'Source': 'manual', 'Kind': 'general', 'Status': 'open'}, 'owner')
        generation = state.create(store, 'generation', {'slug': 'taskuary-review-example', 'title': 'Synthetic review fixture',
            'action': 'create', 'state': 'generating', 'base_digest': None, 'task_id': task, 'origin_task_ids': [source]})
        store.update_task(task, {'SourceRef': f'assistant:skillgen:{generation["id"]}', 'Status': 'done'}, 'owner')
        root = packages.draft_dir(generation['id'])
        (root / 'scripts').mkdir(parents=True)
        (root / 'examples').mkdir()
        (root / 'references').mkdir()
        (root / 'assets').mkdir()
        (root / 'SKILL.md').write_text('---\nname: taskuary-review-example\ndescription: Check synthetic reports\n---\n\nUse [script](scripts/check.py) and [input](examples/input.json).\n', encoding='utf-8')
        (root / 'scripts' / 'check.py').write_text('print("synthetic fixture only")\n', encoding='utf-8')
        (root / 'examples' / 'input.json').write_text('{"amount": 3}\n', encoding='utf-8')
        (root / 'references' / 'source.md').write_text('Fictional task evidence only.\n', encoding='utf-8')
        (root / 'assets' / 'template.bin').write_bytes(b'\x00synthetic-template')
        collected = skillauthoring.collect(store, task)
        current = state.by_key(store, 'analysis', 'current')
        if current: state.update(store, 'analysis', current['id'], {'state': 'ready', 'error': None})
        else: state.create(store, 'analysis', {'state': 'ready', 'error': None}, key='current')
        return {'candidate_id': candidate['id'], 'generation_id': generation['id'], 'task_id': task,
                'review_id': collected['review_id'], 'draft_digest': collected['draft_digest']}

    @app.post('/api/fixture/skill-analysis/{status}')
    def analysis_status(status: str):
        from fastapi import HTTPException
        from taskuary import firstrun, skillstate as state, skilldiscovery
        if status not in ('no_evidence', 'empty', 'running', 'failed'): raise HTTPException(400, 'Unknown fixture analysis state')
        firstrun.set_dismissed(store, True, 'fixture')
        skilldiscovery.BACKGROUND = False
        values = {'state':status, 'error':None, 'auto_enabled':True, 'evidence_count':0 if status == 'no_evidence' else 3,
                  'analyzed_at':None if status == 'no_evidence' else '2026-11-12T10:00:00'}
        current = state.by_key(store, 'analysis', 'current')
        if current: state.update(store, 'analysis', current['id'], values)
        else: state.create(store, 'analysis', values, key='current')
        state.notify(store)
        return values
