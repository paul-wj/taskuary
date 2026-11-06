"""The Skill library's additive API; publication still uses the existing review verdict."""
from pathlib import Path
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from . import skillstate as state

router = APIRouter(prefix='/api/skill-library')


def _store():
    from . import server
    return server.store


def _actor():
    from . import server
    return server.ACTOR


def _call(fn, *args, **kwargs):
    try: return fn(*args, **kwargs)
    except ValueError as e: raise HTTPException(409, str(e)) from e
    except RuntimeError as e: raise HTTPException(422, str(e)) from e


def _generation(id):
    generation = state.get(_store(), 'generation', id)
    if not generation: raise HTTPException(404, 'Skill generation not found')
    return generation


@router.get('')
def library():
    store = _store()
    from . import skillpackages
    return {'analysis': state.by_key(store, 'analysis', 'current') or {'state': 'idle'},
            'suggestions': [c for c in state.rows(store, 'candidate') if c.get('state') == 'suggested'],
            'skills': [{**p, 'bindings': _call(skillpackages.bindings, store, p['slug'])} for p in state.rows(store, 'package')], 'generations': state.rows(store, 'generation')}


@router.post('/analyze')
def analyze():
    from . import skilldiscovery
    return {'analysis': _call(skilldiscovery.schedule, _store(), manual=True)}


@router.post('/pause')
def pause_analysis():
    from . import skilldiscovery
    return {'analysis': _call(skilldiscovery.pause, _store())}


@router.post('/suggestions/{id}/accept')
def accept(id: int):
    from . import skillauthoring
    if not state.get(_store(), 'candidate', id): raise HTTPException(404, 'Skill suggestion not found')
    return _call(skillauthoring.accept, _store(), id, actor=_actor())


@router.post('/suggestions/{id}/dismiss')
def dismiss(id: int):
    store = _store()
    candidate = state.get(store, 'candidate', id)
    if not candidate: raise HTTPException(404, 'Skill suggestion not found')
    if candidate.get('state') == 'dismissed': return candidate
    result = _call(state.update, store, 'candidate', id, {'state': 'dismissed'}, expected={'state': 'suggested'})
    store.audit('skill_candidate', id, 'dismiss', _actor())
    state.notify(store)
    return result


class ImproveBody(BaseModel):
    feedback: str = ''
    base_digest: str


@router.post('/skills/{slug}/improve')
def improve(slug: str, body: ImproveBody):
    from . import skillauthoring
    if not state.by_key(_store(), 'package', slug): raise HTTPException(404, 'Skill not found')
    return _call(skillauthoring.improve, _store(), slug, body.feedback, body.base_digest, actor=_actor())


@router.get('/generations/{id}')
def generation(id: int):
    value = _generation(id)
    from . import skillpackages
    package = _call(skillpackages.diff, _store(), id) if value.get('draft_digest') else None
    if package:
        package['validation'] += value.get('validation') or []
        package['missing_checks'] += [v.get('detail') or v.get('check') for v in value.get('validation', []) if v.get('state') == 'missing']
    review = _store().get_review(value['review_id']) if value.get('review_id') else None
    return {**value, 'package': package, 'review_state': (review or {}).get('Status')}


class RevisionBody(BaseModel):
    draft_digest: str = ''
    feedback: str = ''


@router.post('/generations/{id}/return')
def return_to_agent(id: int, body: RevisionBody):
    from . import skillauthoring
    _generation(id)
    if not body.feedback.strip(): raise HTTPException(422, 'Tell the Agent what needs to change')
    return _call(skillauthoring.return_to_agent, _store(), id, body.feedback, body.draft_digest, actor=_actor())


@router.post('/generations/{id}/discard')
def discard(id: int, body: RevisionBody):
    from . import skillauthoring
    _generation(id)
    return _call(skillauthoring.discard, _store(), id, body.draft_digest, actor=_actor())


@router.get('/skills/{slug}')
def skill(slug: str):
    from . import skillpackages
    value = state.by_key(_store(), 'package', slug)
    if not value: raise HTTPException(404, 'Skill not found')
    from .config import home
    package = _call(skillpackages.inspect, home() / 'skills' / value['slug'])
    if package['digest'] != value['digest']: raise HTTPException(409, 'the published Skill changed on disk')
    return {**value, 'package': package, 'bindings': _call(skillpackages.bindings, _store(), slug)}


def _file(kind, key, path, digest):
    from . import skillpackages
    data = _call(skillpackages.read_file, _store(), kind, key, path, digest)
    filename = quote(Path(path).name, safe='')
    return Response(data, media_type='application/octet-stream', headers={
        'Content-Disposition': f"attachment; filename*=UTF-8''{filename}",
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store'})


@router.get('/generations/{id}/file')
def generation_file(id: int, path: str, digest: str):
    _generation(id)
    return _file('generation', id, path, digest)


@router.get('/skills/{slug}/file')
def skill_file(slug: str, path: str, digest: str):
    if not state.by_key(_store(), 'package', slug): raise HTTPException(404, 'Skill not found')
    return _file('package', slug, path, digest)
