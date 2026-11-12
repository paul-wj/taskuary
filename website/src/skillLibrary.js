import { t } from './i18n.js';

const STATES = { idle: 'Not analyzed yet', running: 'AI is analyzing completed work', ready: 'AI suggestions are ready', empty: 'No reusable method suggested yet',
  no_evidence: 'No completed work with saved results to analyze',
  no_provider: 'Connect an AI to analyze completed work', failed: 'Failed', interrupted: 'Interrupted', generating: 'Agent is generating the package',
  needs_review: 'Package waiting for your review', returned: 'Returned to the Agent', published: 'Published', discarded: 'Discarded' };
export const skillState = value => STATES[value] ? t(STATES[value]) : String(value || '');
export const skillError = error => {
  const detail = error?.response?.data?.detail ?? error?.message ?? error;
  return typeof detail === 'string' ? detail : detail?.message || t('The Skill operation failed.');
};
export const fileChange = value => t(({ added: 'Added', modified: 'Modified', deleted: 'Deleted', unchanged: 'Unchanged' })[value] || 'Unchanged');
