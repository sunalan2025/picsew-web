import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function auditWithReport(report, status) {
  const dir = mkdtempSync(join(tmpdir(), 'picsew-audit-test-'));
  try {
    const npm = join(dir, 'npm');
    const json = JSON.stringify(report).replaceAll("'", "'\\''");
    writeFileSync(npm, `#!/bin/sh\nprintf '%s' '${json}'\nexit ${status}\n`);
    chmodSync(npm, 0o755);
    return spawnSync(
      process.execPath,
      [resolve('scripts/audit-dependencies.mjs')],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const clear = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
test('security gate accepts a complete clean report and blocks moderate advisories', () => {
  assert.equal(
    auditWithReport({ metadata: { vulnerabilities: clear } }, 0).status,
    0
  );
  assert.equal(
    auditWithReport(
      { metadata: { vulnerabilities: { ...clear, moderate: 1, total: 1 } } },
      1
    ).status,
    1
  );
});
test('registry failures and incomplete audit reports cannot be presented as a clean audit', () => {
  const result = auditWithReport({ error: { code: 'ECONNRESET' } }, 1);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /incomplete response/);
  assert.equal(auditWithReport({ metadata: {} }, 0).status, 1);
});

test('partial or inconsistent severity counts cannot silently pass the security gate', () => {
  assert.equal(
    auditWithReport({ metadata: { vulnerabilities: {} } }, 0).status,
    1
  );
  assert.equal(
    auditWithReport(
      { metadata: { vulnerabilities: { ...clear, high: -1 } } },
      0
    ).status,
    1
  );
  assert.equal(
    auditWithReport(
      { metadata: { vulnerabilities: { ...clear, total: 1 } } },
      0
    ).status,
    1
  );
  assert.equal(
    auditWithReport(
      { metadata: { vulnerabilities: { ...clear, low: 1, total: 1 } } },
      1
    ).status,
    0
  );
});
