import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import api from './api';
import { onLive } from './live.js';
import { openAppLink } from './appLinks.js';
import { t } from './i18n.js';
import { useLocale } from './LocaleProvider.jsx';
import { BORDER, DIM, FAINT, INK, PANEL, ROLES } from './theme.jsx';
import SkillPackageReview, { SkillPackageFiles } from './SkillPackageReview.jsx';
import { skillError, skillState } from './skillLibrary.js';

const cardSx = { border: `1px solid ${BORDER}`, borderRadius: '10px', bgcolor: PANEL, p: 1.75, minWidth: 0 };
const lineSx = { fontSize: 12.5, color: DIM, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

function PublishedSkill({ slug, onChanged, onOpenTask, onGenerated }) {
  useLocale();
  const [skill, setSkill] = useState(null), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api.get(`/api/skill-library/skills/${encodeURIComponent(slug)}`).then(({ data }) => { if (live) setSkill(data); }).catch(e => { if (live) setError(skillError(e)); });
    return () => { live = false; };
  }, [slug]);
  const improve = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post(`/api/skill-library/skills/${encodeURIComponent(slug)}/improve`, { feedback, base_digest: skill.digest });
      onChanged?.(); onGenerated(data.generation_id); }
    catch (e) { setError(skillError(e)); }
    setBusy(false);
  };
  return <Box data-tq-skill-library-detail={slug}>
    {error && <Alert severity="error">{error}</Alert>}
    {!skill && !error && <CircularProgress size={18} />}
    {skill && <>
      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{skill.name || skill.slug}</Typography>
      <Typography sx={lineSx}>{skill.description}</Typography>
      <Typography sx={{ fontSize: 11.5, color: FAINT, my: 1, overflowWrap: 'anywhere' }}>SHA-256: {skill.digest}</Typography>
      {(skill.bindings || []).map(binding => <Typography key={binding.cli} sx={lineSx}>{binding.cli} · {t(({ linked: 'Linked', unavailable: 'Unavailable', unsupported: 'Unsupported', conflict: 'Conflict', failed: 'Failed' })[binding.state] || 'Unavailable')} · {binding.path}{binding.error ? ` · ${binding.error}` : ''}</Typography>)}
      <SkillPackageFiles pack={skill.package} kind="skills" source={slug} digest={skill.digest} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(skill.origin_task_ids || []).map(id => <Button key={id} size="small" onClick={() => onOpenTask ? onOpenTask(id) : openAppLink(`task=${id}`)}>TQ-{String(id).padStart(4, '0')}</Button>)}</Box>
      <TextField fullWidth multiline minRows={2} size="small" value={feedback} onChange={e => setFeedback(e.target.value)} label={t('Optional improvement request')} sx={{ mt: 1.5 }} />
      <Button size="small" variant="contained" disabled={busy} onClick={improve} sx={{ mt: 1 }}>{t('Ask Agent to improve this Skill')}</Button>
    </>}
  </Box>;
}

export default function SkillsView({ browse, browseState = {}, onBrowseState, onOpenTask }) {
  useLocale();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { const response = await api.get('/api/skill-library'); setData(response.data); setError(''); }
    catch (e) { setError(skillError(e)); }
  }, []);
  useEffect(() => { load(); return onLive(['feed-changed', 'task-changed'], load, { wait: 300, max: 1500 }); }, [load]);
  const section = ['suggestions', 'library', 'generations'].includes(browseState.section) ? browseState.section : 'suggestions';
  const open = String(browseState.open || '');
  const go = (next, key = null) => onBrowseState?.({ section: next, open: key });
  const generated = id => go('generations', `generation:${id}`);
  const action = async (path, key, after) => {
    setBusy(key); setError('');
    try { const response = await api.post(path, {}); await load(); after?.(response.data); }
    catch (e) { setError(skillError(e)); }
    setBusy('');
  };
  const suggestions = data?.suggestions || [], skills = data?.skills || [], generations = data?.generations || [];
  const suggestion = c => <Box sx={cardSx} data-tq-skill-suggestion={c.id}>
    <Typography sx={{ fontSize: 11, color: ROLES.info.ink }}>{t(c.action === 'update' ? 'Existing Skill improvement' : 'New Skill suggestion')}</Typography>
    <Typography sx={{ color: INK, fontWeight: 600, fontSize: 14, mt: 0.5 }}>{c.title}</Typography>
    <Typography sx={lineSx}>{c.description}</Typography>
    <Typography sx={{ ...lineSx, mt: 1 }}>{c.rationale}</Typography>
    {!!c.varies && <Typography sx={lineSx}>{t('Changing inputs')}: {c.varies}</Typography>}
    {c.action === 'update' && <Typography sx={{ ...lineSx, mt: 0.5 }}>{t('Update target')}: {c.slug}</Typography>}
    <Box component="details" data-tq-skill-evidence="" sx={{ my: 1, fontSize: 12, color: DIM }}>
      <Box component="summary" sx={{ cursor: 'pointer' }}>{t('AI reasoning and source tasks')}</Box>
      {(c.evidence || []).map(e => <Box key={e.task_id} sx={{ mt: 0.75 }}><Button size="small" onClick={() => onOpenTask ? onOpenTask(e.task_id) : openAppLink(`task=${e.task_id}`)}>{e.ref || `TQ-${e.task_id}`}</Button>{e.title}<Typography sx={lineSx}>{e.reason}</Typography></Box>)}
    </Box>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
      <Button size="small" variant="contained" disabled={!!busy} onClick={() => action(`/api/skill-library/suggestions/${c.id}/accept`, `accept:${c.id}`, r => generated(r.generation_id))}>
        {t(c.action === 'update' ? 'Ask Agent to improve this Skill' : 'Ask Agent to generate Skill')}</Button>
      <Button size="small" disabled={!!busy} onClick={() => action(`/api/skill-library/suggestions/${c.id}/dismiss`, `dismiss:${c.id}`)}>{t('Not now')}</Button>
    </Box>
  </Box>;
  let cards = [], detail = null;
  if (section === 'suggestions') {
    cards = suggestions.map(c => ({ key: `suggestion:${c.id}`, node: suggestion(c) }));
  } else if (section === 'library') {
    cards = skills.map(skill => ({ key: `skill:${skill.slug}`, title: skill.name || skill.slug, sub: skill.description,
      badge: t('Published'), onOpen: () => go('library', `skill:${skill.slug}`) }));
    if (open.startsWith('skill:')) detail = <PublishedSkill key={open} slug={open.slice(6)} onChanged={load} onOpenTask={onOpenTask} onGenerated={generated} />;
  } else {
    cards = generations.map(g => ({ key: `generation:${g.id}`, title: g.title || g.slug, sub: skillState(g.state),
      badge: g.task_id ? `TQ-${String(g.task_id).padStart(4, '0')}` : '', onOpen: () => go('generations', `generation:${g.id}`) }));
    if (/^generation:\d+$/.test(open)) detail = <SkillPackageReview key={open} generationId={Number(open.slice(11))} onChanged={load} onOpenTask={onOpenTask} />;
  }
  const frame = { title: t('Skills'), wide: true, summary: skillState(data?.analysis?.state || 'idle'),
    sections: [{ key: 'suggestions', label: t('AI suggestions'), n: suggestions.length }, { key: 'library', label: t('Published Skills'), n: skills.length },
      { key: 'generations', label: t('Generation records'), n: generations.length }], section,
    onSection: key => go(key), cards, detail, onBack: () => go(section), openLabel: detail ? `${t('Skills')} · ${open}` : '',
    empty: !data ? t('Loading Skills…') : section === 'suggestions' ? skillState(data.analysis?.state || 'idle') : t(section === 'library' ? 'No Skill has been published yet.' : 'No Skill generation task yet.'),
    tools: <Box sx={{ mt: 1.25 }}>
      {data?.demo && <Alert severity="info" sx={{ mb: 1 }}>{t('This demo uses fictional Skill suggestions and packages. No live AI ran and no native skill directory is changed.')}</Alert>}
      <Typography sx={lineSx}>{t('AI summarizes completed work and suggests reusable methods. You decide whether an Agent should generate or improve a Skill.')}</Typography>
      <Typography sx={{ fontSize: 11.5, color: FAINT, mt: 0.5 }}>{t('Source tasks explain the recommendation. You do not need to select tasks or write the workflow yourself.')}</Typography>
      <Button size="small" disabled={!!busy || data?.analysis?.state === 'running'} onClick={() => action('/api/skill-library/analyze', 'analysis')} sx={{ mt: 1 }}>{t(data?.analysis?.auto_enabled ? 'Analyze completed work with AI' : 'Start AI discovery')}</Button>
      {data?.analysis?.auto_enabled && <Button size="small" disabled={!!busy} onClick={() => action('/api/skill-library/pause', 'pause')} sx={{ mt: 1 }}>{t('Pause automatic analysis')}</Button>}
      <Typography sx={{ fontSize: 11.5, color: FAINT, mt: 0.5 }}>{t('Starting discovery enables background checks for newly completed work. Pause stops future checks; an active read-only analysis may finish.')}</Typography>
      {data?.analysis?.evidence_count != null && <Typography data-tq-skill-analysis-count="" sx={{ fontSize: 11.5, color: DIM, mt: 0.5 }}>{t('Eligible completed tasks: {count}', { count: data.analysis.evidence_count })}</Typography>}
      {data?.analysis?.analyzed_at && <Typography sx={{ fontSize: 11.5, color: FAINT, mt: 0.5 }}>{t('Last AI analysis: {time}', { time: data.analysis.analyzed_at })}</Typography>}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}<Button size="small" onClick={load}>{t('Reload')}</Button><Button size="small" onClick={() => openAppLink('connections')}>{t('Connections')}</Button></Alert>}
      {!!data?.analysis?.error && <Alert severity="warning" sx={{ mt: 1 }}>{skillError(data.analysis.error)}<Button size="small" onClick={() => openAppLink('connections')}>{t('Connections')}</Button></Alert>}
    </Box> };
  return browse ? browse(frame) : null;
}
