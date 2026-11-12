import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const index = process.argv.indexOf('--output-dir');
const output = index >= 0 ? resolve(process.argv[index + 1] || '.audit') : null;
if (output) mkdirSync(output, { recursive: true });
let failed = false;
for (const [name, extra] of [
  ['all', []],
  ['production', ['--omit=dev']],
]) {
  const result = spawnSync(
    'npm',
    ['audit', '--json', '--registry=https://registry.npmjs.org', ...extra],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  if (output)
    writeFileSync(resolve(output, `audit-${name}.json`), result.stdout || '{}');
  try {
    const report = JSON.parse(result.stdout);
    const counts = report.metadata?.vulnerabilities;
    if (
      result.error ||
      report.error ||
      !counts ||
      ['info', 'low', 'moderate', 'high', 'critical', 'total'].some(
        (level) => !Number.isSafeInteger(counts[level]) || counts[level] < 0
      ) ||
      counts.info +
        counts.low +
        counts.moderate +
        counts.high +
        counts.critical !==
        counts.total ||
      ![0, 1].includes(result.status)
    )
      throw new Error('registry audit did not complete');
    console.log(`${name}: ${JSON.stringify(counts)}`);
    if (counts.moderate + counts.high + counts.critical > 0) failed = true;
  } catch {
    console.error(
      `${name}: audit failed or returned an incomplete response; readiness is unverified.`
    );
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
