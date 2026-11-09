export const compatibleLicenses = new Map([
  ['MIT-0', 'No attribution requirement; preserve upstream provenance.'],
  ['BlueOak-1.0.0', 'Retain license and copyright notice.'],
  ['Zlib', 'Preserve notice; mark altered source and do not misrepresent origin.'],
  ['MIT', 'Retain copyright and license notice.'],
  ['ISC', 'Retain copyright and permission notice.'],
  ['BSD-2-Clause', 'Retain copyright, conditions and disclaimer.'],
  ['BSD-3-Clause', 'Retain copyright, conditions and disclaimer; no endorsement.'],
  ['Apache-2.0', 'Retain license and notices, identify modified files and preserve patent terms.'],
  ['0BSD', 'Preserve upstream provenance.'],
  ['Unlicense', 'Preserve upstream provenance.'],
  ['CC0-1.0', 'Preserve upstream provenance.'],
  ['CC-BY-4.0', 'Provide attribution, license link and modification indication.'],
  ['Python-2.0', 'Retain license, copyright and modification notices.'],
  ['MPL-2.0', 'Keep covered files and modifications under MPL with corresponding source and notices; larger works may use MIT.']
]);

export function licenseCompatible(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return false;
  const tokens = expression.split(/(\(|\)|\bAND\b|\bOR\b)/).map((token) => token.trim()).filter(Boolean);
  let index = 0;
  const primary = () => {
    if (tokens[index] !== '(') {
      const token = tokens[index++];
      if (!token || ['AND', 'OR', ')'].includes(token) || !/^(?:[A-Za-z0-9][A-Za-z0-9.+-]*(?: WITH [A-Za-z0-9][A-Za-z0-9.+-]*)?|SEE LICENSE IN [A-Za-z0-9._/-]+)$/.test(token)) throw new Error('Invalid license expression.');
      return compatibleLicenses.has(token);
    }
    index++;
    const value = disjunction();
    if (tokens[index++] !== ')') throw new Error('Invalid license expression.');
    return value;
  };
  const conjunction = () => {
    let value = primary();
    while (tokens[index] === 'AND') { index++; const next = primary(); value = value && next; }
    return value;
  };
  const disjunction = () => {
    let value = conjunction();
    while (tokens[index] === 'OR') { index++; const next = conjunction(); value = value || next; }
    return value;
  };
  try { const result = disjunction(); return index === tokens.length && result; }
  catch (error) { if (error.message !== 'Invalid license expression.') throw error; return false; }
}
