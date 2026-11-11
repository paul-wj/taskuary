import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import api from './api';
import { onLive } from './live.js';
import { openAppLink } from './appLinks.js';
import { t } from './i18n.js';
import { useLocale } from './LocaleProvider.jsx';
import { BORDER, DIM, FAINT, INK, PANEL2, mono } from './theme.jsx';
import { fileChange, skillError, skillState } from './skillLibrary.js';
import { press, failLine } from './press.js';

export function SkillPackageFiles({ pack, kind, source, digest, baseDigest = null }) {
  useLocale();
  const [picked, setPicked] = useState('SKILL.md'), [error, setError] = useState('');
  const files = pack?.files || [], file = files.find(f => f.path === picked) || files[0];
  const download = async () => {
    setError('');
    try {
      const revision = file.change === 'deleted' ? baseDigest : digest;
      const { data } = await api.get(`/api/skill-library/${kind}/${encodeURIComponent(source)}/file`, { params: { path: file.path, digest: revision }, responseType: 'blob' });
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.path.split('/').pop(); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(skillError(e)); }
  };
  return <Box sx={{ my: 1.5, minWidth: 0 }}>
    <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 1 }}>{t('Complete package files')}</Typography>
    {!!error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, maxHeight: 220, overflow: 'auto', mb: 1 }}>
      {files.map(f => <Button key={f.path} size="small" variant={file?.path === f.path ? 'contained' : 'outlined'} data-tq-skill-file={f.path}
        onClick={() => setPicked(f.path)} sx={{ textTransform: 'none', fontSize: 11.5, overflowWrap: 'anywhere', maxWidth: '100%' }}>
        {f.path} · {fileChange(f.change)}</Button>)}
    </Box>
    {file && <Box data-tq-skill-file-preview="" sx={{ border: `1px solid ${BORDER}`, borderRadius: 1.5, p: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12, color: DIM, overflowWrap: 'anywhere', flex: 1 }}>{file.path} · {file.size} {t('bytes')}</Typography>
        <Button size="small" onClick={download}>{t('Download file')}</Button>
      </Box>
      {file.binary ? <Typography sx={{ fontSize: 12, color: DIM, overflowWrap: 'anywhere', mt: 1 }}>{t('Binary resource — download to inspect.')}<br />SHA-256: {file.sha256}</Typography>
        : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: file.change === 'modified' ? '1fr 1fr' : '1fr' }, gap: 1, mt: 1, minWidth: 0 }}>
          {file.before_text != null && file.change !== 'added' && file.change !== 'unchanged' && <Box sx={{ minWidth: 0 }}><Typography variant="caption">{t('Before')}</Typography>
            <Box component="pre" sx={{ fontFamily: mono, fontSize: 11.5, bgcolor: PANEL2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', p: 1, maxHeight: 350, overflow: 'auto' }}>{file.before_text}</Box></Box>}
          {file.change !== 'deleted' && <Box sx={{ minWidth: 0 }}><Typography variant="caption">{t('Reviewed content')}</Typography>
            <Box component="pre" sx={{ fontFamily: mono, fontSize: 11.5, bgcolor: PANEL2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', p: 1, maxHeight: 350, overflow: 'auto' }}>{file.after_text ?? file.text ?? ''}</Box></Box>}
        </Box>}
    </Box>}
    {!!pack?.validation?.length && <Box sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{t('Validation evidence')}</Typography>
      {pack.validation.map((v, i) => <Box key={`${v.check}:${i}`} sx={{ mt: 0.65, fontSize: 12, color: v.required && v.state !== 'passed' ? '#7a2f3c' : DIM, overflowWrap: 'anywhere' }}>
        <b>{v.check}</b> · {t(({ passed: 'Passed', failed: 'Failed', missing: 'Missing evidence', recorded: 'Recorded, not certified' })[v.state] || 'Missing evidence')}
        {v.required ? ` · ${t('Required')}` : ''}{v.detail ? <Box>{v.detail}</Box> : null}
        {(v.commands || []).map((command, n) => <Box key={n} component="code" sx={{ display: 'block', fontFamily: mono }}>{command}</Box>)}
      </Box>)}
    </Box>}
  </Box>;
}

export default function SkillPackageReview({ generationId, onChanged, onOpenTask }) {
  useLocale();
  const [record, setRecord] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await api.get(`/api/skill-library/generations/${generationId}`); setRecord(data); setError(''); }
    catch (e) { setError(skillError(e)); }
  }, [generationId]);
  useEffect(() => { load(); return onLive(['feed-changed', 'task-changed'], load, { wait: 300, max: 1500 }); }, [load]);
  const act = async kind => {
    setBusy(true); setError('');
    try {
      if (kind === 'approve') {
        const outcome = await press(api, record.review_id, { verb: 'approve' }, 2);
        if (outcome.kind === 'unknown') await load();
        if (outcome.kind !== 'ok' && outcome.kind !== 'already') {
          if (outcome.kind === 'error') throw outcome.thrown;
          const error = outcome.data?.error;
          throw new Error(error?.message || error || t(failLine(outcome, 'published')));
        }
      } else {
        const { data: result } = await api.post(`/api/skill-library/generations/${record.id}/${kind}`, { draft_digest: record.draft_digest || '', feedback });
        if (result?.ok === false || result?.status === 'error' || result?.send_error) throw new Error(result.error?.message || result.error || result.send_error || t('The Skill operation failed.'));
      }
      await load(); onChanged?.();
    } catch (e) { setError(skillError(e)); }
    setBusy(false);
  };
  const pack = record?.package;
  const blocked = (pack?.validation || []).some(v => v.required && v.state !== 'passed');
  const actionable = record && ['needs_review', 'failed', 'interrupted'].includes(record.state);
  return <Box data-tq-skill-generation={generationId} sx={{ minWidth: 0 }}>
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    {!record && !error && <CircularProgress size={18} />}
    {record && <>
      <Typography sx={{ color: INK, fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{record.slug}</Typography>
      <Typography sx={{ color: DIM, fontSize: 12.5, mt: 0.5 }}>{skillState(record.state)}</Typography>
      {record.task_id && <Button size="small" onClick={() => onOpenTask ? onOpenTask(record.task_id) : openAppLink(`task=${record.task_id}`)}>{t('Open Agent task')}</Button>}
      {!!record.error && <Alert severity="error" sx={{ my: 1 }}>{skillError(record.error)}</Alert>}
      {record.state === 'published' && <Alert data-tq-skill-published="" severity="success" sx={{ my: 1 }}>{t('The complete Skill package is published.')}</Alert>}
      {pack && <SkillPackageFiles pack={pack} kind="generations" source={record.id} digest={record.draft_digest} baseDigest={record.base_digest} />}
      {actionable && <>
        <Typography sx={{ fontSize: 12, color: FAINT, my: 1 }}>{t('Approval publishes this exact revision to compatible local Agent discovery directories. It does not execute the scripts.')}</Typography>
        <TextField fullWidth size="small" multiline minRows={2} value={feedback} onChange={e => setFeedback(e.target.value)} label={t('Changes for the Agent')} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
          {record.state === 'needs_review' && <Button data-tq-skill-approve="" data-tq-verb="approve" data-tq-send="" variant="contained" size="small" disabled={busy || blocked || !record.review_id || record.review_state !== 'pending'} onClick={() => act('approve')}>{t('Approve and publish')}</Button>}
          <Button size="small" disabled={busy || !feedback.trim()} onClick={() => act('return')}>{t('Return to Agent')}</Button>
          <Button size="small" disabled={busy} onClick={() => act('discard')}>{t('Discard draft')}</Button>
        </Box>
      </>}
    </>}
  </Box>;
}
