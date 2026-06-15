import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENCY_ALIASES } from '../data/agencyAliases';

test('alias keys are all lowercase and trimmed', () => {
  for (const key of Object.keys(AGENCY_ALIASES)) {
    assert.equal(key, key.toLowerCase(), `key "${key}" is not lowercase`);
    assert.equal(key, key.trim(), `key "${key}" has surrounding whitespace`);
  }
});

test('every alias maps to a non-empty array of non-empty canonical names', () => {
  for (const [key, names] of Object.entries(AGENCY_ALIASES)) {
    assert.ok(Array.isArray(names), `"${key}" should map to an array`);
    assert.ok(names.length >= 1, `"${key}" maps to an empty array`);
    for (const name of names) {
      assert.equal(typeof name, 'string');
      assert.ok(name.trim().length > 0, `"${key}" has a blank canonical name`);
    }
  }
});

test('common acronyms resolve to the expected single canonical name', () => {
  assert.deepEqual(AGENCY_ALIASES['gao'], ['Government Accountability Office']);
  assert.deepEqual(AGENCY_ALIASES['nasa'], ['National Aeronautics and Space Administration']);
  assert.deepEqual(AGENCY_ALIASES['va'], ['Department of Veterans Affairs']);
  assert.deepEqual(AGENCY_ALIASES['epa'], ['Environmental Protection Agency']);
});

test('sub-agency nicknames resolve to the parent department', () => {
  assert.deepEqual(AGENCY_ALIASES['fbi'], ['Department of Justice']);
  assert.deepEqual(AGENCY_ALIASES['fema'], ['Department of Homeland Security']);
  assert.deepEqual(AGENCY_ALIASES['irs'], ['Department of the Treasury']);
  assert.deepEqual(AGENCY_ALIASES['noaa'], ['Department of Commerce']);
});

test('"doe" is treated as ambiguous (Energy and Education)', () => {
  const doe = AGENCY_ALIASES['doe'];
  assert.equal(doe.length, 2);
  assert.ok(doe.includes('Department of Energy'));
  assert.ok(doe.includes('Department of Education'));
});

test('unambiguous aliases map to exactly one canonical name', () => {
  const ambiguous = ['doe'];
  for (const [key, names] of Object.entries(AGENCY_ALIASES)) {
    if (ambiguous.includes(key)) continue;
    assert.equal(names.length, 1, `"${key}" unexpectedly maps to ${names.length} names`);
  }
});
