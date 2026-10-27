// Built-in snapshot (26 Oct 2026). The app always reads a "dataset" object; the Excel import builds the same shape.

// [region, rsm, tsm, territory, territoryRR, yesterday, mtdTarget, actual, rank, mtdRR, remain]
const TERRITORY_ROWS = [
  ['Coastal', 'Hubert Isowe', 'Lomayani Lairumbe', 'ILA', 31, 10, 806, 528, 10, 20, 155],
  ['Coastal', 'Hubert Isowe', 'Lomayani Lairumbe', 'ZNZ', 7, 0, 182, 102, 16, 4, 35],
  ['Coastal', 'Hubert Isowe', 'Evarine Joseph', 'KIN', 31, 17, 806, 598, 6, 23, 155],
  ['Coastal', 'Hubert Isowe', 'Khaleed Korosheni', 'TMK', 20, 12, 520, 317, 13, 12, 100],
  ['Coastal', 'Hubert Isowe', 'Diamond Mwandenuka', 'MTR/LND', 9, 6, 234, 228, 1, 9, 45],
  ['Lake', 'Mnova Mkalenda', 'Regina Mjema', 'MWZ/SHY', 27, 20, 702, 566, 5, 22, 135],
  ['Lake', 'Mnova Mkalenda', 'Regina Mjema', 'MARA/SMY', 7, 4, 182, 75, 18, 3, 35],
  ['Lake', 'Mnova Mkalenda', 'Abdallah Chama', 'GET/KGR', 17, 6, 442, 250, 15, 10, 85],
  ['Northern', 'Steven Mwangamila', 'Joseph John', 'AR/MNY', 27, 11, 702, 402, 14, 15, 135],
  ['Northern', 'Steven Mwangamila', 'Upendo Nyamaloy', 'KIL', 14, 11, 364, 309, 4, 12, 70],
  ['Northern', 'Steven Mwangamila', 'Abel Moshi', 'TNG', 9, 1, 234, 110, 17, 4, 45],
  ['Central', 'Jackson Marco', 'Emmanuel Melita', 'DOM/SING', 21, 6, 546, 368, 8, 14, 105],
  ['Central', 'Jackson Marco', 'David Sechome', 'MRG', 7, 4, 182, 134, 7, 5, 35],
  ['Central', 'Jackson Marco', 'Emmanuel Masere', 'TBR/KGM', 8, 3, 208, 79, 19, 3, 40],
  ['Southern', 'Wachache Mwenda', 'Modestus Gama', 'MBY/SGW', 18, 17, 468, 305, 11, 12, 90],
  ['Southern', 'Wachache Mwenda', 'Modestus Gama', 'KTV/RKW', 4, 4, 104, 70, 9, 3, 20],
  ['Southern', 'Wachache Mwenda', 'David Mbazza', 'IR/NJB', 10, 10, 265, 257, 2, 10, 51],
  ['Southern', 'Wachache Mwenda', 'David Mbazza', 'RVM', 7, 6, 182, 116, 12, 4, 35],
];
const TELESALES_ROW = ['Telesales', 'Telesales desk', 'Telesales team', 'Telesales', 16, 7, 416, 399, 3, 15, 80];

export const TIE_OUT = {
  mtdTarget: 7129, actual: 4814, rr: 274, yesterday: 148, mtdRR: 185,
  remain: 1371, mtgGap: 3686, newRR: 737, gap: -2315,
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function enrichRow(r, i, daysLeft) {
  const [region, rsm, tsm, territory, rr, yesterday, mtdTarget, actual, rank, mtdRR, remain] = r;
  const rem = Number.isFinite(remain) ? remain : rr * daysLeft;
  const mtgGap = mtdTarget - actual + rem;
  return {
    id: `${i}-${region}-${territory}`,
    region, rsm, tsm, territory,
    rr, yesterday, mtdTarget, actual, rank, mtdRR, remain: rem,
    gap: actual - mtdTarget,
    mtgGap,
    newRR: Math.round(mtgGap / Math.max(daysLeft, 1)),
    pct: pct(actual, mtdTarget),
    dailyPct: pct(yesterday, rr),
  };
}

export function buildDataset({ rows, telesales = null, meta, tieOut = null }) {
  const daysLeft = Math.max(1, meta.daysInMonth - meta.daysElapsed);
  const territories = rows.map((r, i) => enrichRow(r, i, daysLeft));
  return {
    ...meta,
    daysLeft,
    territories,
    telesales: telesales ? enrichRow(telesales, 'T', daysLeft) : null,
    regions: [...new Set(territories.map((t) => t.region))],
    tieOut,
  };
}

export const BUILTIN_DATASET = buildDataset({
  rows: TERRITORY_ROWS,
  telesales: TELESALES_ROW,
  tieOut: TIE_OUT,
  meta: {
    source: 'builtin', fileName: 'Built-in snapshot', importedAt: null,
    reportDate: '2026-10-26', reportLabel: '26 Oct 2026', daysElapsed: 26, daysInMonth: 31,
  },
});

const KEY = 'sp-dataset-v3';
export function loadDataset() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ds = JSON.parse(raw);
      if (Array.isArray(ds?.territories) && ds.territories.length > 0 && Number.isFinite(ds.daysLeft) && ds.daysLeft > 0 && ds.territories.every(r => r && typeof r.territory === 'string' && Number.isFinite(r.actual) && Number.isFinite(r.mtdTarget))) return ds;
    }
  } catch { /* fall through to built-in */ }
  return BUILTIN_DATASET;
}
export function saveDataset(ds) {
  try { localStorage.setItem(KEY, JSON.stringify(ds)); } catch { /* storage unavailable */ }
}
export function clearDataset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
