import * as XLSX from 'xlsx';
import { buildDataset } from './data.js';
import { aggregate, diffDatasets } from './utils.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const up = (v) => clean(v).toUpperCase();
const isTelesales = (t) => /telesale/i.test(t);

// Blank -> NaN (so callers can choose a default); "-" means zero, as on the sheet; "(126)" is negative.
function toNum(v) {
  if (typeof v === 'number') return v;
  const s = clean(v).replace(/,/g, '').replace(/−/g, '-');
  if (s === '') return NaN;
  if (s === '-') return 0;
  if (/^\(.*\)$/.test(s)) { const n = Number(s.slice(1, -1)); return Number.isNaN(n) ? NaN : -n; }
  const n = Number(s.replace('%', ''));
  return Number.isNaN(n) ? NaN : n;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const h = rows[i].map(up);
    if (h.includes('TERRITORY') && h.includes('ACTUAL') && (h.includes('RSM') || h.includes('TSM'))) return i;
  }
  return -1;
}

// Columns are matched by header text. "MTD" and "ACTUAL" appear twice on the sheet; the first is the territory figure.
function columnMap(header) {
  return {
    region: header.findIndex((h) => h === 'REGIONS' || h === 'REGION'),
    rsm: header.indexOf('RSM'),
    tsm: header.indexOf('TSM'),
    territory: header.indexOf('TERRITORY'),
    rr: header.indexOf('TERRITORY RR'),
    yesterday: header.indexOf('YESTERDAY'),
    mtdTarget: header.indexOf('MTD'),
    actual: header.indexOf('ACTUAL'),
    rank: header.indexOf('RANK'),
    mtdRR: header.indexOf('MTD RR'),
    remain: header.indexOf('REMAIN'),
    gap: header.indexOf('GAP'),
    mtgGap: header.indexOf('MTG GAP'),
    newRR: header.indexOf('NEW RR'),
  };
}
const COLNAME = { territory: 'TERRITORY', mtdTarget: 'MTD', actual: 'ACTUAL', rr: 'TERRITORY RR' };

// Looks for a report date such as 10/26/2026 (or 26/10/2026) in the rows above the table.
function detectDate(rows) {
  for (const row of rows) {
    for (const c of row) {
      if (c instanceof Date && !Number.isNaN(c.getTime())) return { y: c.getFullYear(), m: c.getMonth() + 1, d: c.getDate() };
      const m = clean(c).match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
      if (m) {
        let a = Number(m[1]), b = Number(m[2]);
        let mo = a, d = b;
        if (a > 12) { d = a; mo = b; }
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y: Number(m[3]), m: mo, d };
      }
    }
  }
  return null;
}

export function parseWorkbook(buffer, prev) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    return { ok: false, error: 'This file could not be opened. Use .xlsx, .xls or .csv.', sections: [], issues: [] };
  }

  let found = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false });
    const hi = findHeader(rows);
    if (hi >= 0) { found = { name, rows, hi }; break; }
  }
  if (!found) {
    return {
      ok: false,
      error: 'No table header found. The sheet needs columns named TERRITORY, RSM or TSM, and ACTUAL.',
      sections: [], issues: [],
    };
  }

  const { name: sheetName, rows, hi } = found;
  const map = columnMap(rows[hi].map(up));
  const issues = [];

  const missing = ['territory', 'mtdTarget', 'actual', 'rr'].filter((k) => map[k] < 0);
  if (missing.length) {
    return { ok: false, error: `Missing column(s): ${missing.map((k) => COLNAME[k]).join(', ')}.`, sections: [], issues };
  }

  // Report date → days elapsed / days in month / days left.
  const found_date = detectDate(rows.slice(0, hi + 3));
  let reportDate = prev.reportDate, reportLabel = prev.reportLabel;
  let daysElapsed = prev.daysElapsed, daysInMonth = prev.daysInMonth;
  if (found_date) {
    const { y, m, d } = found_date;
    reportDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    reportLabel = `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
    daysElapsed = d;
    daysInMonth = new Date(y, m, 0).getDate();
  } else {
    issues.push({ row: null, territory: '', msg: `No report date found; kept ${prev.reportLabel}` });
  }
  const daysLeft = daysInMonth - daysElapsed;

  const cell = (row, k) => (map[k] >= 0 ? row[map[k]] : '');
  const readNums = (row) => ({
    rr: toNum(cell(row, 'rr')),
    yesterday: toNum(cell(row, 'yesterday')),
    mtdTarget: toNum(cell(row, 'mtdTarget')),
    actual: toNum(cell(row, 'actual')),
    rank: toNum(cell(row, 'rank')),
    mtdRR: toNum(cell(row, 'mtdRR')),
    remain: toNum(cell(row, 'remain')),
  });

  const territoryRows = [];
  let telesalesRaw = null;
  let totalsRow = null;
  let lastRegion = '', lastRsm = '', lastTsm = '';

  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 1;
    if (row.some((c) => up(c) === 'TOTAL')) { totalsRow = row; continue; }
    const terr = clean(cell(row, 'territory'));
    if (!terr) continue;

    const n = readNums(row);
    if (isTelesales(terr)) {
      telesalesRaw = ['Telesales', 'Telesales desk', 'Telesales team', 'Telesales',
        Number.isFinite(n.rr) ? n.rr : 0, Number.isFinite(n.yesterday) ? n.yesterday : 0,
        Number.isFinite(n.mtdTarget) ? n.mtdTarget : 0, Number.isFinite(n.actual) ? n.actual : 0,
        Number.isFinite(n.rank) ? n.rank : 0, Number.isFinite(n.mtdRR) ? n.mtdRR : 0,
        Number.isFinite(n.remain) ? n.remain : 0];
      continue;
    }

    // Merged cells on the sheet: region/RSM/TSM are only written on the first row of each block.
    const region = clean(cell(row, 'region')) || lastRegion || 'Unassigned';
    const rsm = clean(cell(row, 'rsm')) || (region === lastRegion ? lastRsm : '') || 'Unassigned';
    const tsm = clean(cell(row, 'tsm')) || (rsm === lastRsm ? lastTsm : '') || 'Unassigned';
    lastRegion = region; lastRsm = rsm; lastTsm = tsm;

    const bad = ['rr', 'mtdTarget', 'actual'].filter((k) => !Number.isFinite(n[k]));
    if (bad.length) {
      issues.push({ row: rowNo, territory: terr, msg: `skipped — ${bad.join(', ')} not a number` });
      continue;
    }
    territoryRows.push({
      row: rowNo,
      raw: [
        region, rsm, tsm, terr, n.rr,
        Number.isFinite(n.yesterday) ? n.yesterday : 0,
        n.mtdTarget, n.actual,
        Number.isFinite(n.rank) ? n.rank : 0,
        Number.isFinite(n.mtdRR) ? n.mtdRR : 0,
        Number.isFinite(n.remain) ? n.remain : n.rr * daysLeft,
      ],
    });
  }

  if (territoryRows.length === 0) {
    return { ok: false, error: 'No territory rows were found under the header.', sections: [], issues };
  }

  // Ranks: use the sheet's RANK column; derive from achievement when it is missing.
  const rankMissing = map.rank < 0 || territoryRows.some((t) => t.raw[8] === 0);
  if (rankMissing) {
    const order = [...territoryRows].sort((a, b) => b.raw[7] / b.raw[6] - a.raw[7] / a.raw[6]);
    order.forEach((t, idx) => { t.raw[8] = idx + 1; });
    issues.push({ row: null, territory: '', msg: 'RANK missing for some rows; ranks derived from achievement' });
  }

  // Duplicate territory names.
  const seen = new Map();
  territoryRows.forEach((t) => seen.set(t.raw[3], (seen.get(t.raw[3]) || 0) + 1));
  [...seen.entries()].filter(([, c]) => c > 1).forEach(([name]) =>
    issues.push({ row: null, territory: name, msg: 'appears more than once' }));

  const telesales = telesalesRaw;
  const dataset = buildDataset({
    rows: territoryRows.map((t) => t.raw),
    telesales,
    meta: {
      source: 'excel', fileName: '', importedAt: new Date().toISOString(),
      reportDate, reportLabel, daysElapsed, daysInMonth,
    },
    tieOut: null,
  });

  // Totals row from the sheet, checked against totals recalculated from the territory rows.
  let tieRows = [];
  if (totalsRow) {
    const t = (k) => { const v = toNum(cell(totalsRow, k)); return Number.isFinite(v) ? v : null; };
    const sheetTotals = {
      mtdTarget: t('mtdTarget'), actual: t('actual'), rr: t('rr'), yesterday: t('yesterday'),
      mtdRR: t('mtdRR'), remain: t('remain'), mtgGap: t('mtgGap'), newRR: t('newRR'), gap: t('gap'),
    };
    dataset.tieOut = sheetTotals;
    const calc = aggregate(dataset.territories, daysLeft);
    const labels = {
      mtdTarget: 'MTD target', actual: 'Actual sales', rr: 'Territory RR', yesterday: 'Yesterday',
      mtdRR: 'MTD RR', remain: 'Remaining', mtgGap: 'To go', newRR: 'New RR/day', gap: 'MTD gap',
    };
    tieRows = Object.entries(sheetTotals)
      .filter(([, v]) => v !== null)
      .map(([k, sheet]) => ({ key: k, label: labels[k], calc: calc[k], sheet, ok: calc[k] === sheet }));
  }

  const regions = dataset.regions;
  const rsms = new Set(dataset.territories.map((t) => t.rsm));
  const tsms = new Set(dataset.territories.map((t) => t.tsm));
  const unassignedTsm = dataset.territories.filter((t) => t.tsm === 'Unassigned').length;
  const unassignedRegion = dataset.territories.filter((t) => t.region === 'Unassigned').length;
  const skipped = issues.filter((x) => x.msg.startsWith('skipped')).length;
  const tieMatched = tieRows.filter((r) => r.ok).length;

  const sections = [
    {
      key: 'header', title: 'Header & report date', status: found_date ? 'ok' : 'warn',
      lines: [
        `Table found on sheet "${sheetName}", row ${hi + 1}`,
        found_date ? `Report date ${reportLabel} · day ${daysElapsed} of ${daysInMonth}` : `No date found — kept ${reportLabel}`,
      ],
    },
    {
      key: 'regions', title: 'Regions', status: unassignedRegion ? 'warn' : 'ok',
      lines: [`${regions.length} regions: ${regions.join(', ')}`,
        ...(unassignedRegion ? [`${unassignedRegion} territories have no region`] : [])],
    },
    {
      key: 'team', title: 'RSMs & TSMs', status: unassignedTsm ? 'warn' : 'ok',
      lines: [`${rsms.size} RSMs · ${tsms.size} TSMs`,
        ...(unassignedTsm ? [`${unassignedTsm} territories have no TSM`] : [])],
    },
    {
      key: 'territories', title: 'Territories', status: skipped ? 'warn' : 'ok',
      lines: [`${dataset.territories.length} territories loaded`,
        ...(skipped ? [`${skipped} rows skipped (see issues)`] : [])],
    },
    {
      key: 'telesales', title: 'Telesales', status: telesales ? 'ok' : 'warn',
      lines: [telesales ? 'Telesales line loaded' : 'No Telesales line found — desk will show as empty'],
    },
    {
      key: 'totals', title: 'Totals vs sheet', status: !tieRows.length ? 'warn' : tieMatched === tieRows.length ? 'ok' : 'warn',
      lines: !tieRows.length
        ? ['No TOTAL row found — totals could not be checked']
        : [`${tieMatched} of ${tieRows.length} totals match the sheet`],
    },
  ];

  return {
    ok: true,
    sheetName,
    sections,
    issues,
    tieRows,
    dataset,
    changes: diffDatasets(prev, dataset),
  };
}
