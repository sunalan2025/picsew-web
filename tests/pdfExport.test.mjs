import test from 'node:test';
import assert from 'node:assert/strict';
import { planPdfExport } from '../src/utils/pdfExport.ts';

test('a reasonable long screenshot fits one PDF page', () => {
  const p = planPdfExport(1200, 10000, 'single');
  assert.equal(p.count, 1);
  assert.equal(p.mode, 'single');
  assert.equal(p.pageHeightPx, 10000);
});

test('an excessively long single-page PDF becomes multiple A4 pages', () => {
  const p = planPdfExport(1000, 30000, 'single');
  assert.equal(p.mode, 'multi');
  assert.equal(p.count, Math.ceil(30000 / p.pageHeightPx));
});

test('every source pixel row is accounted for in pagination', () => {
  const p = planPdfExport(1080, 3841, 'multi');
  assert.ok((p.count - 1) * p.pageHeightPx < 3841);
  assert.ok(p.count * p.pageHeightPx >= 3841);
});

test('invalid sizes and too many pages are rejected', () => {
  assert.throws(() => planPdfExport(0, 100, 'multi'));
  assert.throws(() => planPdfExport(100, 500000, 'multi'));
});
