import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeChecklist, loadJurisdictionProfiles, loadRequirementSets } from '../scripts/composePlattingChecklists.mjs';
import { plattingSlug } from '../src/plattingSlug.mjs';

const site = fileURLToPath(new URL('..', import.meta.url));
const authored = join(site, 'src/pages/office/checklists/platting');

test('browser and generator use the same jurisdiction slug', () => {
  assert.equal(plattingSlug('St. Johns'), 'st-johns');
  assert.equal(plattingSlug('Miami-Dade'), 'miami-dade');
});

test('published authored platting checklist matches its current source sets', async () => {
  const sets = await loadRequirementSets(join(authored, 'requirements'));
  const profiles = await loadJurisdictionProfiles(join(authored, 'jurisdictions'));
  const orange = profiles.find(profile => profile.output === 'platting/orange');
  assert.ok(orange);
  const published = JSON.parse(await readFile(join(site, 'public/checklists/platting/orange.json'), 'utf8'));
  assert.deepEqual(composeChecklist(orange, sets), published);
});
