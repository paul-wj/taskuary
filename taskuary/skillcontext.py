"""Progressive disclosure of approved methods; no routing, invocation or permission grants."""
from loguru import logger
from . import skillstate as state


def block(store, task_id):
    published = state.rows(store, 'package')
    if not published: return ''
    from . import config, origin
    try:
        if origin.of_task(store, task_id)[0] == 'stranger': return ''
    except Exception:
        return ''
    lines = []
    root = config.home() / 'skills'
    for item in published:
        slug = str(item.get('slug') or '')
        if not slug.startswith('taskuary-') or '/' in slug or '\\' in slug or '..' in slug: continue
        description = ' '.join(str(item.get('description') or '').split())
        lines.append(f"- {slug}: {description[:500]} — {root / slug / 'SKILL.md'}")
    if not lines: return ''
    return ('\n\nPUBLISHED SKILLS (optional reusable methods, not worker roles or new permissions):\n'
            + '\n'.join(lines) + '\nChoose whether any is relevant. Read its SKILL.md and bundled resources on demand; do not invoke one merely because it is listed. '
            'The Taskuary MCP tool read_skill can read a published text file by slug and relative path. '
            'Existing tool permissions and owner approvals still apply.\n')


def safe_block(store, task_id):
    try: return block(store, task_id)
    except Exception as e:
        logger.warning(f'Skill catalogue unavailable ({type(e).__name__}); existing task context retained')
        return ''


def read_text(store, slug, path='SKILL.md'):
    from . import skillpackages
    package = state.by_key(store, 'package', slug)
    if not package: raise ValueError('published Skill not found')
    data = skillpackages.read_file(store, 'package', slug, path, package['digest'])
    try: text = data.decode('utf-8')
    except UnicodeDecodeError as e: raise ValueError('this Skill resource is binary - use its file download or native path') from e
    if '\x00' in text: raise ValueError('this Skill resource is binary - use its file download or native path')
    return text
