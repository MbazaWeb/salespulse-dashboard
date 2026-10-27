// Round-trip test: build a workbook shaped like the source sheet, parse it, and compare with the known totals.
// Run: npm run test:import
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/excel.js';
import { BUILTIN_DATASET, TIE_OUT } from '../src/data.js';

const ds = BUILTIN_DATASET;
const header = ['REGIONS', 'RSM', 'TSM', 'TERRITORY', 'Territory RR', 'Yesterday', 'MTD %', 'MTD', 'ACTUAL', 'MTD %', 'RANK', 'MTD RR', 'MTD', 'Actual', 'MTD %', 'GAP', 'Remain', 'MTG GAP', 'NEW RR'];
const aoa = [
  ['', '', '', '', '', '', '', '10/26/2026'],
  [],
  header,
];
let lastRegion = '', lastRsm = '', lastTsm = '';
for (const t of ds.territories) {
  const first = t.region !== lastRegion;
  const firstTsm = t.tsm !== lastTsm;
  aoa.push([
    first ? t.region : '', t.rsm !== lastRsm || first ? (first ? t.rsm : '') : '', firstTsm ? t.tsm : '',
    t.territory, t.rr, t.yesterday, `${Math.round((t.yesterday / t.rr) * 100)}%`,
    t.mtdTarget, t.actual, `${t.pct}%`, t.rank, t.mtdRR, '', '', '', t.gap, t.remain, t.mtgGap, t.newRR,
  ]);
  lastRegion = t.region; lastRsm = t.rsm; lastTsm = t.tsm;
}
const tele = ds.telesales;
aoa.push(['', '', '', 'Telesales', tele.rr, tele.yesterday, '', tele.mtdTarget, tele.actual, '', tele.rank, tele.mtdRR, '', '', '', tele.gap, tele.remain, tele.mtgGap, tele.newRR]);
aoa.push(['TOTAL', '', '', '', TIE_OUT.rr, TIE_OUT.yesterday, '', TIE_OUT.mtdTarget, TIE_OUT.actual, '68%', '', TIE_OUT.mtdRR, '', '', '', TIE_OUT.gap, TIE_OUT.remain, TIE_OUT.mtgGap, TIE_OUT.newRR]);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'FY26 OCT - PER REGIONS');
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

const prev = { ...ds, reportDate: '2026-10-25', reportLabel: '25 Oct 2026', daysElapsed: 25 };
const res = parseWorkbook(buf, prev);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

check('parser accepted the workbook', res.ok, res.error ?? '');
check('report date read from sheet', res.dataset?.reportLabel === '26 Oct 2026', res.dataset?.reportLabel);
check('days left derived (5)', res.dataset?.daysLeft === 5, String(res.dataset?.daysLeft));
check('18 territories loaded', res.dataset?.territories.length === 18, String(res.dataset?.territories.length));
check('telesales line loaded', !!res.dataset?.telesales && res.dataset.telesales.actual === 399);
check('regions in order', res.dataset?.regions.join(',') === 'Coastal,Lake,Northern,Central,Southern', res.dataset?.regions.join(','));
check('merged TSM filled (ZNZ → Lomayani)', res.dataset?.territories[1].tsm === 'Lomayani Lairumbe', res.dataset?.territories[1].tsm);
const ilaPct = res.dataset?.territories[0].pct;
check('ILA achievement 66%', ilaPct === 66, String(ilaPct));
check('every sheet total matches recalculation', res.tieRows.length === 9 && res.tieRows.every((r) => r.ok),
  res.tieRows.map((r) => `${r.label}:${r.calc}/${r.sheet}`).join(' '));
check('diff detects date/total changes', res.changes?.next.actual === 4814 && res.changes?.prev.actual === 4814);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll import checks passed');
process.exit(failures ? 1 : 0);
