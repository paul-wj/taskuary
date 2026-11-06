import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasRequestFromHash, hashFor, placeOf } from '../src/canvasLinks.js';

test('Skill sections and a reviewed generation survive a link roundtrip', () => {
  for (const section of ['suggestions', 'library', 'generations']) {
    const state = { section, open: section === 'generations' ? 'generation:12' : null };
    const address = hashFor('skills', state);
    const request = canvasRequestFromHash(address);
    assert.equal(request?.area, 'skills');
    assert.deepEqual(request.state, state);
    assert.equal(placeOf(address), address);
  }
});
