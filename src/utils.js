export const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(Number(n) || 0));
export const signedGap = (g) => (g < 0 ? '−' : '+') + fmt(Math.abs(g));
export const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const toneVar = (key) => `var(--${key})`;

export function statusOf(pct, threshold = 65) {
  if (pct >= 85) return { key: 'good', label: 'On track' };
  if (pct >= threshold) return { key: 'warn', label: 'Watch' };
  return { key: 'low', label: 'Behind' };
}

export function aggregate(rows, daysLeft = 1) {
  const s = rows.reduce(
    (a, r) => ({
      rr: a.rr + r.rr,
      yesterday: a.yesterday + r.yesterday,
      mtdTarget: a.mtdTarget + r.mtdTarget,
      actual: a.actual + r.actual,
      mtdRR: a.mtdRR + r.mtdRR,
      remain: a.remain + r.remain,
      mtgGap: a.mtgGap + r.mtgGap,
    }),
    { rr: 0, yesterday: 0, mtdTarget: 0, actual: 0, mtdRR: 0, remain: 0, mtgGap: 0 }
  );
  return {
    ...s,
    count: rows.length,
    gap: s.actual - s.mtdTarget,
    pct: pctOf(s.actual, s.mtdTarget),
    dailyPct: pctOf(s.yesterday, s.rr),
    newRR: Math.round(s.mtgGap / Math.max(daysLeft, 1)),
  };
}

export function groupBy(rows, key, daysLeft) {
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  });
  return [...map.entries()]
    .map(([name, rs]) => ({ name, rows: rs, ...aggregate(rs, daysLeft) }))
    .sort((a, b) => b.pct - a.pct);
}

export function sortRows(rows, key, dir) {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (typeof x === 'string') return x.localeCompare(y) * m;
    return (x - y) * m;
  });
}

// What changed between two datasets, for the import preview.
export function diffDatasets(prev, next) {
  const a = aggregate(prev.territories, prev.daysLeft);
  const b = aggregate(next.territories, next.daysLeft);
  const key = (t) => `${t.region}|${t.territory}`;
  const prevMap = new Map(prev.territories.map((t) => [key(t), t]));
  const nextMap = new Map(next.territories.map((t) => [key(t), t]));
  const added = [...nextMap.keys()].filter((k) => !prevMap.has(k));
  const removed = [...prevMap.keys()].filter((k) => !nextMap.has(k));
  const changed = [...nextMap.entries()].filter(([k, t]) => prevMap.has(k) && prevMap.get(k).actual !== t.actual).length;
  return { prev: a, next: b, added, removed, changed };
}

const CSV_COLS = [
  ['Region', 'region'], ['RSM', 'rsm'], ['TSM', 'tsm'], ['Territory', 'territory'],
  ['Territory RR', 'rr'], ['Yesterday', 'yesterday'], ['MTD target', 'mtdTarget'],
  ['Actual', 'actual'], ['Achievement %', 'pct'], ['Gap', 'gap'], ['To go', 'mtgGap'],
  ['New RR/day', 'newRR'], ['MTD RR', 'mtdRR'], ['Rank', 'rank'],
];

export function toCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return [
    CSV_COLS.map(([h]) => esc(h)).join(','),
    ...rows.map((r) => CSV_COLS.map(([, k]) => esc(r[k])).join(',')),
  ].join('\n');
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
