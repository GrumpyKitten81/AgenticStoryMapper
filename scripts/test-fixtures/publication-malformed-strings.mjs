import assert from 'node:assert/strict';
import { parsePolicy, textCategories } from '../check-publication-content.mjs';

const policy = parsePolicy(JSON.stringify({ employerTerms: ['Synthetic Organization'] }));
assert.deepEqual(textCategories('\\"'.repeat(65_536), policy), []);
