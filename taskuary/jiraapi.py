"""Jira deployment-aware wire. Data Center API-token connections are read-only."""
import json
from urllib.parse import urlsplit
import requests


def _config(c):
    try: cfg = json.loads(c.get('ConfigJson') or '{}')
    except (ValueError, TypeError): raise RuntimeError('Jira configuration is not valid JSON')
    if not isinstance(cfg, dict): raise RuntimeError('Jira configuration must be an object')
    return cfg


def deployment(c):
    kind = _config(c).get('deployment', 'cloud')
    if kind not in ('cloud', 'data_center'): raise RuntimeError('Unknown Jira deployment; choose Cloud or Data Center')
    return kind


def base_url(c):
    base = str(_config(c).get('base_url') or '').strip().rstrip('/')
    if not base: raise RuntimeError('No Jira site URL saved')
    if '://' not in base: base = 'https://' + base
    if base.endswith('/rest/api/2'): base = base[:-11].rstrip('/')
    u = urlsplit(base)
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.query or u.fragment:
        raise RuntimeError('Enter a Jira site URL without credentials, query or fragment')
    if '/rest/api/' in u.path: raise RuntimeError('Enter the Jira site URL, not an incompatible API URL')
    return base


def require_write(c):
    if deployment(c) == 'data_center': raise RuntimeError('This Data Center Jira connection is read-only')


def request(c, method, path, body=None, *, params=None, api_version=2):
    kind = deployment(c)
    method = method.upper()
    if kind == 'data_center' and (method != 'GET' or api_version != 2):
        raise RuntimeError('This Data Center Jira connection permits only REST v2 reads')
    if not path.startswith('/') or path.startswith('//') or '://' in path or '..' in path.split('/'):
        raise RuntimeError('Invalid Jira API path')
    cfg = _config(c)
    if not cfg.get('email') or not c.get('Secret'): raise RuntimeError('Jira requires the account username and API token')
    headers = {'Accept': 'application/json'}
    if kind == 'data_center': headers['User-Agent'] = 'curl/8.17.0'
    try:
        r = requests.request(method, f'{base_url(c)}/rest/api/{api_version}{path}', params=params,
                             json=body, auth=(cfg['email'], c['Secret']), headers=headers, timeout=30, allow_redirects=False)
    except requests.RequestException as e:
        raise RuntimeError('Jira request failed; check network access and TLS certificates') from e
    if r.status_code == 401: raise RuntimeError('Jira rejected the account username or API token (401)')
    if r.status_code == 403: raise RuntimeError('Jira denied this resource (403); check project permissions or the WAF')
    if r.status_code >= 300: raise RuntimeError(f'Jira request failed (HTTP {r.status_code})')
    if not r.content: return {}
    try: result = r.json()
    except ValueError as e: raise RuntimeError('Jira returned a non-JSON response') from e
    if not isinstance(result, (dict, list)): raise RuntimeError('Jira returned an invalid JSON response')
    return result


def issue_state(fields):
    """Workflow category and resolution are independent; names never decide whether an issue is over."""
    status, resolution = fields.get('status') or {}, fields.get('resolution')
    category = (status.get('statusCategory') or {}).get('key') or ''
    return {'status': status.get('name') or '', 'category': category,
            'resolution': (resolution.get('name') or resolution.get('id')) if resolution else None,
            'closed': category == 'done' or bool(resolution), 'changed_at': fields.get('updated') or ''}


def message_state(row):
    if row.get('Channel') != 'jira': return None
    try: meta = json.loads(row.get('MailMetaJson') or '{}')
    except (ValueError, TypeError): return None
    state = meta.get('jira') if isinstance(meta, dict) else None
    return state if isinstance(state, dict) else None


def reference_closed(row):
    return bool(not row.get('TaskId') and row.get('ReviewStatus') != 'pending' and (row.get('Jira') or {}).get('closed'))


def same_user(author, owner, deployment):
    if deployment == 'cloud': return bool(owner.get('accountId')) and author.get('accountId') == owner['accountId']
    if author.get('key') and owner.get('key'): return author['key'] == owner['key']
    return bool(owner.get('name')) and author.get('name') == owner['name']


def owner(store, c, *, refresh=False):
    cfg = _config(c)
    basis = {'site': base_url(c), 'deployment': deployment(c), 'username': cfg.get('email')}
    cached = cfg.get('jira_identity') or {}
    if not refresh and isinstance(cached, dict) and cached.get('basis') == basis: return cached['user']
    me = request(c, 'GET', '/myself')
    keys = ('accountId',) if basis['deployment'] == 'cloud' else ('key', 'name')
    if not isinstance(me, dict) or not any(me.get(k) for k in keys):
        raise RuntimeError('Jira did not return a usable owner identity')
    user = {k: me[k] for k in (*keys, 'displayName', 'emailAddress') if me.get(k)}
    store.set_connector_config(c['ConnectorId'], {**cfg, 'jira_identity': {'basis': basis, 'user': user}})
    return user
