import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const secrets = [/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/u, /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/u, /\bAKIA[0-9A-Z]{16}\b/u, /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u];
const retired = new RegExp(['Con' + '[\\s_-]*fluence', 'Azure' + '[\\s_-]*Dev[\\s_-]*Ops'].join('|'), 'iu');
const markerFiles = new Map([['LICENSE', '[COPYRIGHT_HOLDER]'], ['SECURITY.md', '[PRIVATE_SECURITY_CONTACT]'], ['CODE_OF_CONDUCT.md', '[CONDUCT_CONTACT]']]);

export function parsePolicy(source) {
  let policy;
  try { policy = JSON.parse(source); }
  catch { throw new Error('policy'); }
  if (!policy || Object.keys(policy).join() !== 'employerTerms' || !Array.isArray(policy.employerTerms) || !policy.employerTerms.length) throw new Error('policy');
  const terms = policy.employerTerms;
  if (terms.some((term) => typeof term !== 'string' || !term.trim() || term !== term.trim() || term.length > 200 || /[\u0000-\u001f]/u.test(term))) throw new Error('policy');
  if (new Set(terms.map((term) => term.normalize('NFC').toLowerCase())).size !== terms.length) throw new Error('policy');
  return { digest: digest(JSON.stringify(policy)), terms };
}

function identifierWords(value) {
  return value.normalize('NFC').replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2').replace(/([\p{Lu}])([\p{Lu}][\p{Ll}])/gu, '$1 $2').replace(/[-_]+/gu, ' ');
}

function containsTerm(text, term) {
  const escaped = identifierWords(term).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(identifierWords(text));
}

function privateEmail(text) {
  const classified = text.replace(/[a-z0-9_-]+@\d+\.\d+\.\d+\.patch/giu, 'synthetic-package-path');
  return [...classified.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Z0-9.-]+\.[A-Z]{2,})/giu)]
    .some((match) => !['a@b.co', 'user@github.com', 'pass@github.com'].includes(match[0].replace(/^['`/]+/u, '')) && !/(?:^|\.)(?:example\.(?:com|org|net)|invalid|test)$/iu.test(match[1]) && !match[1].endsWith('.example'));
}

function rawTextCategories(text, policy) {
  const categories = [];
  if (secrets.some((pattern) => pattern.test(text))) categories.push('secret-signature');
  if (policy.terms.some((term) => containsTerm(text, term))) categories.push('employer-reference');
  if (retired.test(text)) categories.push('retired-provider-reference');
  if (/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)(?!<|\[|(?:runner|user|username|public|default)(?:[/\\]|$))[\p{L}\p{N}_.-]+/iu.test(text)) categories.push('personal-home-path');
  if (privateEmail(text)) categories.push('email-review');
  if (/https?:\/\/[^\s/]+\.(?:corp|internal|local)(?:[:/\s]|$)/iu.test(text)) categories.push('private-url-review');
  return categories;
}

export function textCategories(text, policy) {
  const categories = new Set(rawTextCategories(text, policy));
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\[\s\S]?)*(?:"|$)/gu)) {
    if (!/^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"$/u.test(token)) continue;
    for (const category of rawTextCategories(JSON.parse(token), policy)) categories.add(category);
  }
  return [...categories];
}

function unsupportedArchive(bytes) {
  return bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) || bytes.subarray(0, 3).toString() === 'BZh'
    || bytes.subarray(0, 6).equals(Buffer.from([253, 55, 122, 88, 90, 0])) || bytes.subarray(257, 262).toString() === 'ustar'
    || bytes.subarray(0, 4).equals(Buffer.from([40, 181, 47, 253])) || bytes.subarray(0, 6).equals(Buffer.from([55, 122, 188, 175, 39, 28]));
}

export function inspectContent(bytes, policy, depth = 0) {
  const categories = new Set(textCategories(bytes.toString('utf8'), policy));
  if (bytes.includes(0)) for (const category of textCategories(bytes.toString('utf16le'), policy)) categories.add(category);
  if (bytes.includes(0)) {
    const swapped = Buffer.from(bytes.subarray(0, bytes.length - bytes.length % 2)).swap16();
    for (const category of textCategories(swapped.toString('utf16le'), policy)) categories.add(category);
  }
  if (bytes[0] === 31 && bytes[1] === 139) {
    if (depth >= 8) return [...categories, 'archive-depth-limit'];
    try { for (const category of inspectContent(gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }), policy, depth + 1)) categories.add(category); }
    catch (error) {
      if (!['Z_DATA_ERROR', 'Z_BUF_ERROR', 'Z_MEM_ERROR', 'ERR_BUFFER_TOO_LARGE'].includes(error.code)) throw error;
      categories.add('unreadable-archive');
    }
    return [...categories].sort();
  }
  if (unsupportedArchive(bytes)) categories.add('unsupported-archive');
  const decoded = bytes.toString('utf8');
  if (bytes.subarray(0, 5).toString() === '%PDF-' || bytes.includes(0) || decoded.includes('\ufffd') || /[\u0001-\u0008\u000e-\u001f]/u.test(decoded)) {
    categories.add('binary-privacy-review');
    categories.add('redistribution-review');
  }
  return [...categories].sort();
}

export function declarationCategories(file, bytes) {
  const marker = markerFiles.get(file);
  return marker && bytes.toString('utf8').includes(marker) ? ['private-declaration'] : [];
}

export function finding(category, scope, location) {
  const owner = category === 'secret-signature' ? 'credential-owner' : category === 'redistribution-review' ? 'rights-holder' : 'maintainer';
  return { category, scope, location, owner, disposition: 'unresolved', validation: 'required' };
}
