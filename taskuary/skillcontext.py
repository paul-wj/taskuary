"""Progressive disclosure of approved methods; no routing, invocation or permission grants."""
from loguru import logger
from . import skillstate as state


def block(store, task_id):
    from . import config, origin, skills
    try:
        if origin.of_task(store, task_id)[0] == 'stranger': return ''
    except Exception:
        return ''
    task = store.get_task(int(task_id)) or {}
    books = skills.offered(store, profile=skills.profile_of(store, task))
    if not books: return ''
    root = config.home() / 'skills'
    lines = [f"- {b['slug']}: {' '.join(str(b['description']).split())[:500]} — {root / b['slug'] / 'SKILL.md'}" for b in books]
    return ('\n\nOWNER SKILLS (optional reusable methods, not worker roles or new permissions):\n'
            + '\n'.join(lines) + '\nChoose whether any is relevant. Read a listed SKILL.md on demand with the Taskuary `skills` tool; '
            'for a published Taskuary Skill, that tool can also read a bundled resource by relative path. Neither tool invokes a Skill. '
            'Existing tool permissions and owner approvals still apply.\n')

def safe_block(store, task_id):
    try: return block(store, task_id)
    except Exception as e:
        logger.warning(f'Skill catalogue unavailable ({type(e).__name__}); existing task context retained')
        return ''

def read_text(store, task_id, slug, path='SKILL.md'):
    from . import origin, skills
    if origin.of_task(store, task_id)[0] == 'stranger': raise ValueError('published Skill not found')
    task = store.get_task(int(task_id)) or {}
    available = skills.offered(store, profile=skills.profile_of(store, task))
    if not any(item.get('slug') == slug for item in available): raise ValueError('published Skill not found')
    from . import skillpackages
    package = state.by_key(store, 'package', slug)
    if not package: raise ValueError('published Skill not found')
    data = skillpackages.read_file(store, 'package', slug, path, package['digest'])
    try: text = data.decode('utf-8')
    except UnicodeDecodeError as e: raise ValueError('this Skill resource is binary - use its file download or native path') from e
    if '\x00' in text: raise ValueError('this Skill resource is binary - use its file download or native path')
    return text

