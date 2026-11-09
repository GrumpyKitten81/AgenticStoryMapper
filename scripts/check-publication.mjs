import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runPublication } from './check-publication-audit.mjs';
import { publicationFailure } from './check-publication-errors.mjs';

export async function publicationMain(args = process.argv.slice(2), root = process.cwd()) {
  const scan = args[0] === '--scan';
  const parameters = scan ? args.slice(1) : args;
  if (parameters.length !== 2 || parameters[0] !== '--policy' || !parameters[1]) {
    process.stderr.write('publication: blocked; policy-required; provide explicit --policy input.\n');
    return 1;
  }
  try {
    const report = await runPublication({ root, policyPath: parameters[1], scan });
    process.stdout.write(`publication: ${report.verdict}; ${report.findings.length} unresolved findings; ${report.coverage.publicationFiles} publication files.\n`);
    return report.verdict === 'accepted' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`publication: blocked; ${publicationFailure(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await publicationMain();
