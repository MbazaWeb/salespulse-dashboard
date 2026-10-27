import { useEffect, useMemo, useState } from 'react';
import { BUILTIN_DATASET, loadDataset, saveDataset, clearDataset } from './data.js';
import { aggregate, groupBy, sortRows, toCSV, download, fmt, signedGap, statusOf, toneVar } from './utils.js';
import { Icon, Kpi, Ring, Bar, Pill, SortTh, SkeletonKpis, SkeletonPanel, Drawer } from './components.jsx';
import ImportPanel from './ImportPanel.jsx';
import { SNAPSHOT_DATES, REGION_DAILY, TERRITORY_DAILY, WEEK_GROUPS, sumSales } from './dailySnapshot.js';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'grid', title: 'Performance overview' },
  { id: 'regions', label: 'Regions', icon: 'map', title: 'Regional breakdown' },
  { id: 'territories', label: 'Territories', icon: 'list', title: 'Territory ledger' },
  { id: 'team', label: 'Team', icon: 'users', title: 'Managers & rollups' },
  { id: 'telesales', label: 'Telesales', icon: 'phone', title: 'Telesales desk' },
  { id: 'daily-weekly', label: 'Daily & Weekly Sales', icon: 'trend', title: 'Daily & weekly sales' },
  { id: 'reports', label: 'Reports', icon: 'file', title: 'Reports & tie-out' },
  { id: 'settings', label: 'Settings', icon: 'sliders', title: 'Settings' },
];
const FILTERED = ['overview', 'regions', 'territories', 'team'];
const DEFAULTS = { threshold: 65, density: 'comfortable' };

const COLUMNS = [
  { k: 'territory', label: 'Territory' },
  { k: 'region', label: 'Region' },
  { k: 'tsm', label: 'TSM' },
  { k: 'rr', label: 'RR', num: true },
  { k: 'yesterday', label: 'Yesterday', num: true },
  { k: 'mtdTarget', label: 'MTD target', num: true },
  { k: 'actual', label: 'Actual', num: true },
  { k: 'pct', label: 'Achievement' },
  { k: 'gap', label: 'Gap', num: true },
  { k: 'mtgGap', label: 'To go', num: true },
  { k: 'newRR', label: 'New RR/day', num: true },
  { k: 'rank', label: 'Rank', num: true },
];
const OVERVIEW_KEYS = ['territory', 'region', 'mtdTarget', 'actual', 'pct', 'gap', 'rank'];

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('sp-settings') || '{}') }; }
  catch { return DEFAULTS; }
}
const matches = (r, q) =>
  !q || [r.region, r.territory, r.tsm, r.rsm].join(' ').toLowerCase().includes(q.trim().toLowerCase());

function Ach({ pct, threshold }) {
  const s = statusOf(pct, threshold);
  return (
    <div className="ach">
      <Bar value={pct} color={toneVar(s.key)} />
      <b className={`pct-${s.key}`}>{pct}%</b>
    </div>
  );
}

function Cell({ r, k, threshold }) {
  switch (k) {
    case 'territory': return <strong>{r.territory}</strong>;
    case 'region': return <span className="chip">{r.region}</span>;
    case 'pct': return <Ach pct={r.pct} threshold={threshold} />;
    case 'gap': return <span className={r.gap < 0 ? 'neg' : 'pos'}>{signedGap(r.gap)}</span>;
    case 'rank': return <span className={`rank ${r.rank <= 3 ? 'top' : ''}`}>#{r.rank}</span>;
    default: return typeof r[k] === 'number' ? fmt(r[k]) : r[k];
  }
}

function TerritoryTable({ rows, cols, sort, onSort, onOpen, threshold, totals }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <SortTh key={c.k} label={c.label} k={c.k} sort={sort} onSort={onSort} num={c.num} />)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}>
              {cols.map((c) => (
                <td key={c.k} data-label={c.label} className={c.num ? 'num' : ''}><Cell r={r} k={c.k} threshold={threshold} /></td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              {cols.map((c) => {
                const t = totals;
                const v = {
                  territory: `Total · ${t.count} territories`,
                  rr: fmt(t.rr), yesterday: fmt(t.yesterday), mtdTarget: fmt(t.mtdTarget),
                  actual: fmt(t.actual), pct: `${t.pct}%`, gap: signedGap(t.gap),
                  mtgGap: fmt(t.mtgGap), newRR: fmt(t.newRR),
                }[c.k] ?? '';
                return <td key={c.k} data-label={c.label} className={c.num ? 'num' : ''}>{v}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GroupTable({ groups, threshold }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th><th className="num">Territories</th><th className="num">MTD RR</th>
            <th className="num">MTD target</th><th className="num">Actual</th><th>Achievement</th>
            <th className="num">Gap</th><th className="num">To go</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name}>
              <td data-label="Name"><strong>{g.name}</strong></td>
              <td data-label="Territories" className="num">{g.count}</td>
              <td data-label="Territories" className="num">{fmt(g.mtdRR)}</td>
              <td data-label="Territories" className="num">{fmt(g.mtdTarget)}</td>
              <td data-label="Territories" className="num strong">{fmt(g.actual)}</td>
              <td data-label="Territories"><Ach pct={g.pct} threshold={threshold} /></td>
              <td data-label="Territories" className={`num ${g.gap < 0 ? 'neg' : 'pos'}`}>{signedGap(g.gap)}</td>
              <td data-label="Territories" className="num">{fmt(g.mtgGap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ onClear }) {
  return (
    <div className="empty">
      <Icon name="search" size={22} />
      <p>No territories match these filters.</p>
      <button className="btn" onClick={onClear}>Clear filters</button>
    </div>
  );
}

function TelesalesPanel({ t, threshold }) {
  if (!t) {
    return <section className="panel"><p className="muted">No Telesales line in the current data.</p></section>;
  }
  return (
    <section className="panel tele">
      <Ring value={t.pct} size={120} stroke={12} color={toneVar(statusOf(t.pct, threshold).key)} />
      <div className="tele-stats">
        <div className="eyebrow">Telesales desk · tracked separately</div>
        <h2>{fmt(t.actual)} <span>of {fmt(t.mtdTarget)} MTD target</span></h2>
        <div className="mini-grid">
          <div><span>Yesterday</span><b>{t.yesterday} / {t.rr}</b></div>
          <div><span>Daily RR</span><b>{t.dailyPct}%</b></div>
          <div><span>Rank</span><b>#{t.rank}</b></div>
          <div><span>Required / day</span><b>{t.newRR}</b></div>
        </div>
      </div>
    </section>
  );
}

function TerritoryDetail({ r, threshold, daysLeft, rankCount }) {
  const s = statusOf(r.pct, threshold);
  return (
    <div className="detail">
      <p className="muted">{r.region} · RSM {r.rsm} · TSM {r.tsm}</p>
      <div className="detail-hero">
        <Ring value={r.pct} size={116} stroke={12} color={toneVar(s.key)} />
        <div>
          <Pill pct={r.pct} threshold={threshold} />
          <p className="muted small">Rank #{r.rank} of {rankCount} ranked lines</p>
        </div>
      </div>
      <div className="dl">
        <div><span>MTD target</span><b>{fmt(r.mtdTarget)}</b></div>
        <div><span>Actual</span><b>{fmt(r.actual)}</b></div>
        <div><span>MTD gap</span><b className={r.gap < 0 ? 'neg' : 'pos'}>{signedGap(r.gap)}</b></div>
        <div><span>To go</span><b>{fmt(r.mtgGap)}</b></div>
        <div><span>Yesterday</span><b>{fmt(r.yesterday)}</b></div>
        <div><span>MTD RR</span><b>{fmt(r.mtdRR)}</b></div>
        <div><span>Remaining</span><b>{fmt(r.remain)}</b></div>
        <div><span>New RR/day</span><b>{fmt(r.newRR)}</b></div>
      </div>
      <div className="detail-bars">
        <div className="row-l"><span>Achievement</span><b>{r.pct}%</b></div>
        <Bar value={r.pct} color={toneVar(s.key)} />
        <div className="row-l"><span>Yesterday vs daily RR</span><b>{r.dailyPct}%</b></div>
        <Bar value={r.dailyPct} color="var(--ink-2)" />
      </div>
      <p className="muted small">Territory RR {r.rr} · {daysLeft} days left in the month.</p>
    </div>
  );
}

function PageSkeleton({ page }) {
  return (
    <div className="page">
      <SkeletonKpis />
      {page === 'overview' ? (
        <>
          <div className="grid-2"><SkeletonPanel rows={5} /><SkeletonPanel rows={5} /></div>
          <SkeletonPanel rows={9} />
        </>
      ) : page === 'reports' || page === 'settings' ? (
        <SkeletonPanel rows={4} />
      ) : (
        <><SkeletonPanel rows={3} /><SkeletonPanel rows={10} /></>
      )}
    </div>
  );
}

export default function App() {
  const [dataset, setDataset] = useState(loadDataset);
  const [page, setPage] = useState('overview');
  const [salesPeriod, setSalesPeriod] = useState('daily');
  const [salesGrouping, setSalesGrouping] = useState('territory');
  const [salesDrilldown, setSalesDrilldown] = useState(null);
  const [salesWeek, setSalesWeek] = useState(3);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [region, setRegion] = useState('All');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [picked, setPicked] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sp-nav-collapsed') === '1'; } catch { return false; }
  });
  const [settings, setSettings] = useState(loadSettings);
  const [toast, setToast] = useState(null);
  const { threshold } = settings;

  const { territories: ALL, telesales: TELESALES, regions: REGIONS, daysLeft, daysElapsed, daysInMonth, reportLabel, tieOut } = dataset;
  const activeRegion = region === 'All' || REGIONS.includes(region) ? region : 'All';

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), tick === 0 ? 1100 : 700);
    return () => clearTimeout(t);
  }, [tick]);
  useEffect(() => {
    try { localStorage.setItem('sp-settings', JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);
  useEffect(() => {
    try { localStorage.setItem('sp-nav-collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);
  useEffect(() => { setNavOpen(false); }, [page]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const terr = useMemo(
    () => ALL.filter((r) => (activeRegion === 'All' || r.region === activeRegion) && matches(r, query)),
    [ALL, activeRegion, query]
  );
  const sorted = useMemo(() => sortRows(terr, sort.key, sort.dir), [terr, sort]);
  const totals = useMemo(() => aggregate(terr, daysLeft), [terr, daysLeft]);
  const companyAgg = useMemo(() => aggregate(ALL, daysLeft), [ALL, daysLeft]);
  const regionRows = useMemo(
    () => REGIONS.map((name) => {
      const rows = terr.filter((r) => r.region === name);
      return { name, rsm: rows[0]?.rsm ?? '', rows, ...aggregate(rows, daysLeft) };
    }).filter((g) => g.count > 0),
    [REGIONS, terr, daysLeft]
  );
  const maxTarget = Math.max(1, ...regionRows.map((g) => g.mtdTarget));
  const attention = useMemo(() => [...terr].sort((a, b) => a.pct - b.pct).slice(0, 6), [terr]);
  const belowThreshold = REGIONS.filter((name) => aggregate(ALL.filter((r) => r.region === name), daysLeft).pct < threshold);
  const sortLabel = COLUMNS.find((c) => c.k === sort.key)?.label ?? '';

  const onSort = (k) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }));
  const openRow = (r) => { setPicked(r); setDrawer(true); };
  const closeDrawer = () => setDrawer(false);
  const clearFilters = () => { setRegion('All'); setQuery(''); };
  const exportCSV = () => download(`regional-sales-${dataset.reportDate}.csv`, '\ufeff' + toCSV(sorted));
  const refresh = () => setTick((t) => t + 1);
  const setThreshold = (v) => setSettings((s) => ({ ...s, threshold: v }));
  const setDensity = (v) => setSettings((s) => ({ ...s, density: v }));
  const meta = PAGES.find((p) => p.id === page);

  const applyDataset = (next) => {
    setDataset(next);
    saveDataset(next);
    setRegion('All');
    setToast(`Dashboard updated from ${next.fileName} · ${next.territories.length} territories`);
  };
  const restoreBuiltIn = () => {
    clearDataset();
    setDataset(BUILTIN_DATASET);
    setRegion('All');
    setToast('Restored the built-in 26 Oct snapshot');
  };

  const overview = () => (
    <>
      {dataset.source === 'excel' && (
        <div className="banner" data-testid="live-banner">
          <span className="dot" /> Showing live data from <b>{dataset.fileName}</b> · {reportLabel}
        </div>
      )}
      <div className="kpi-grid">
        <Kpi label="Actual sales" value={totals.actual} sub={`of ${fmt(totals.mtdTarget)} MTD target`} icon="target" tone="accent" />
        <article className="kpi kpi-ring" style={{ animationDelay: '90ms' }}>
          <div>
            <div className="kpi-top"><span>Achievement</span></div>
            <p className="kpi-note">{signedGap(totals.gap)} against MTD pacing</p>
          </div>
          <Ring value={totals.pct} size={88} stroke={9} color={toneVar(statusOf(totals.pct, threshold).key)} />
        </article>
        <Kpi label="Yesterday" value={totals.yesterday} sub={`${totals.dailyPct}% of ${fmt(totals.rr)} daily RR`} icon="trend" tone="good" delay={180} />
        <Kpi label="Required per day" value={totals.newRR} sub={`${fmt(totals.mtgGap)} to go in ${daysLeft} days`} icon="arrowUp" tone="warn" delay={270} />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div><h2>Regional achievement</h2><p>Actual against MTD target</p></div>
            <span className="tag">{regionRows.length} regions</span>
          </div>
          <div className="reg-list">
            {regionRows.map((g) => (
              <div className="reg-row" key={g.name}>
                <div className="top">
                  <span><b>{g.name}</b><small>{g.rsm}</small></span>
                  <span className={`v pct-${statusOf(g.pct, threshold).key}`}>{g.pct}%</span>
                </div>
                <Bar value={g.pct} color={toneVar(statusOf(g.pct, threshold).key)} />
                <div className="sub"><span>{fmt(g.actual)} actual</span><span>{fmt(g.mtdTarget)} target</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>Needs attention</h2><p>Lowest achievers in this view</p></div></div>
          {attention.length ? (
            <ul className="attn">
              {attention.map((r) => (
                <li key={r.id}>
                  <button onClick={() => openRow(r)}>
                    <span className="attn-name"><b>{r.territory}</b><small>{r.region} · {r.tsm}</small></span>
                    <span className={`pct-${statusOf(r.pct, threshold).key}`}>{r.pct}%</span>
                    <span className="neg">{signedGap(r.gap)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing to show for these filters.</p>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Territory performance</h2><p>Click any territory for the full breakdown</p></div>
          <button className="btn" onClick={exportCSV}><Icon name="download" size={16} />Export CSV</button>
        </div>
        {sorted.length ? (
          <TerritoryTable rows={sorted} cols={COLUMNS.filter((c) => OVERVIEW_KEYS.includes(c.k))}
            sort={sort} onSort={onSort} onOpen={openRow} threshold={threshold} />
        ) : <EmptyState onClear={clearFilters} />}
      </section>
      <TelesalesPanel t={TELESALES} threshold={threshold} />
    </>
  );

  const regions = () => (
    <>
      <div className="regions-grid">
        {regionRows.map((g) => {
          const s = statusOf(g.pct, threshold);
          return (
            <section className="panel region-card" key={g.name}>
              <div className="panel-head">
                <div><h2>{g.name}</h2><p>RSM · {g.rsm}</p></div>
                <Pill pct={g.pct} threshold={threshold} />
              </div>
              <div className="rc-main">
                <Ring value={g.pct} size={96} stroke={10} color={toneVar(s.key)} />
                <dl className="rc-stats">
                  <div><dt>Actual</dt><dd>{fmt(g.actual)}</dd></div>
                  <div><dt>MTD target</dt><dd>{fmt(g.mtdTarget)}</dd></div>
                  <div><dt>Gap</dt><dd className="neg">{signedGap(g.gap)}</dd></div>
                  <div><dt>Required / day</dt><dd>{fmt(g.newRR)}</dd></div>
                </dl>
              </div>
              <ul className="mini">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => openRow(r)}>
                      <span>{r.territory}</span>
                      <Bar value={r.pct} color={toneVar(statusOf(r.pct, threshold).key)} />
                      <b>{r.pct}%</b>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div><h2>Target vs actual</h2><p>Bars share one scale, so regions compare directly</p></div>
          <div className="legend"><span className="lg target" />Target <span className="lg actual" />Actual</div>
        </div>
        {regionRows.map((g) => (
          <div className="cmp" key={g.name}>
            <div className="cmp-label"><b>{g.name}</b><small>{fmt(g.actual)} / {fmt(g.mtdTarget)}</small></div>
            <div className="cmp-bars">
              <Bar value={g.mtdTarget} max={maxTarget} color="#d8cdb8" />
              <Bar value={g.actual} max={maxTarget} color="var(--accent)" />
            </div>
          </div>
        ))}
      </section>
    </>
  );

  const territories = () => (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>All territories</h2>
          <p>{sorted.length} of {ALL.length} shown · sorted by {sortLabel.toLowerCase()} ({sort.dir === 'asc' ? 'ascending' : 'descending'})</p>
        </div>
        <button className="btn" onClick={exportCSV}><Icon name="download" size={16} />Export CSV</button>
      </div>
      {sorted.length ? (
        <TerritoryTable rows={sorted} cols={COLUMNS} sort={sort} onSort={onSort}
          onOpen={openRow} threshold={threshold} totals={totals} />
      ) : <EmptyState onClear={clearFilters} />}
    </section>
  );

  const team = () => (
    <>
      <section className="panel">
        <div className="panel-head"><div><h2>Regional sales managers</h2><p>RSM portfolio, ranked by achievement</p></div></div>
        <GroupTable groups={groupBy(terr, 'rsm', daysLeft)} threshold={threshold} />
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Territory sales managers</h2><p>TSM scorecard, ranked by achievement</p></div></div>
        <GroupTable groups={groupBy(terr, 'tsm', daysLeft)} threshold={threshold} />
      </section>
    </>
  );

  const telesales = () => {
    const t = TELESALES;
    return (
      <>
        {t ? (
          <div className="kpi-grid">
            <Kpi label="MTD target" value={t.mtdTarget} sub="Telesales desk, month to date" icon="target" />
            <Kpi label="Actual" value={t.actual} sub={`${t.pct}% of MTD target`} icon="trend" tone="good" delay={90} />
            <Kpi label="Yesterday" value={t.yesterday} sub={`${t.dailyPct}% of ${t.rr} daily RR`} icon="arrowUp" delay={180} />
            <Kpi label="To go" value={t.mtgGap} sub={`${t.newRR} per day for ${daysLeft} days`} icon="file" tone="warn" delay={270} />
          </div>
        ) : null}
        <TelesalesPanel t={t} threshold={threshold} />
        <section className="panel">
          <div className="panel-head"><div><h2>How this is counted</h2><p>Matches the source sheet</p></div></div>
          <p className="prose">
            Telesales is reported on its own line. It is not included in the territory totals, regional
            achievement, or the headline achievement, which all reflect the {ALL.length} field territories.
          </p>
        </section>
      </>
    );
  };

  const dailyWeekly = () => {
    const selectedSales = salesDrilldown;
    const setSelectedSales = setSalesDrilldown;
    const regionNames = ['Coastal', 'Lake', 'Northern', 'Central', 'Southern'];
    const records = salesGrouping === 'region'
      ? regionNames.map(name => ({ name, values: REGION_DAILY[name], target: ALL.filter(r => r.region === name).reduce((a,r)=>a+r.rr,0) }))
      : ALL.map(r => ({ name: r.territory, sub: r.tsm, values: TERRITORY_DAILY[r.territory] ?? [], target: r.rr }));
    const columns = salesPeriod === 'daily'
      ? SNAPSHOT_DATES.map((date, i) => ({ label: `${i+1} Oct`, start:i, end:i })).filter((_, i) => salesWeek === -1 || (i >= WEEK_GROUPS[salesWeek].start && i <= WEEK_GROUPS[salesWeek].end))
      : WEEK_GROUPS;
    const fieldTotal = sumSales(regionNames.flatMap(name => REGION_DAILY[name]));
    const weeklyTotals = WEEK_GROUPS.map(w => sumSales(regionNames.flatMap(name => REGION_DAILY[name].slice(w.start,w.end+1))));
    const total = fieldTotal;
    const avg = Math.round(total / SNAPSHOT_DATES.length);
    const best = Math.max(...SNAPSHOT_DATES.map((_,i)=>sumSales(regionNames.map(name=>REGION_DAILY[name][i]))));
    const exportHistory = () => {
      const headers = ['Name', 'RR', ...columns.map(c=>c.label), 'Total'];
      const lines = records.map(r=>[r.name,r.target,...columns.map(c=>sumSales(r.values.slice(c.start,c.end+1))),sumSales(r.values)]);
      const csv = [headers,...lines].map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
      download(`salespulse-${salesPeriod}-${salesGrouping}-oct2026.csv`, '\ufeff'+csv);
    };
    return <>
      <section className="panel" data-testid="daily-weekly-panel">
        <div className="panel-head"><div><h2>Daily & Weekly Sales</h2><p>October 2026 · historical snapshot, 1–26 October · excludes Telesales from field totals</p></div><span className="tag">Snapshot · 26 Oct 2026</span></div>
        <div className="sales-controls">
          <div className="seg" role="group" aria-label="Sales period">
            <button data-testid="sales-daily" aria-pressed={salesPeriod==='daily'} onClick={()=>setSalesPeriod('daily')}>Daily Sales</button>
            <button data-testid="sales-weekly" aria-pressed={salesPeriod==='weekly'} onClick={()=>setSalesPeriod('weekly')}>Weekly Sales</button>
          </div>
          <div className="seg" role="group" aria-label="Group sales by">
            <button data-testid="sales-territory" aria-pressed={salesGrouping==='territory'} onClick={()=>setSalesGrouping('territory')}>By Territory</button>
            <button data-testid="sales-region" aria-pressed={salesGrouping==='region'} onClick={()=>setSalesGrouping('region')}>By Region</button>
          </div>
          <button className="btn" onClick={exportHistory}><Icon name="download" size={16}/>Export CSV</button>
        </div>
        {salesPeriod === 'daily' && <div className="sales-week-picker" role="group" aria-label="Select daily sales week">
          {WEEK_GROUPS.map((w,i)=><button key={w.label} data-testid={`sales-week-${i+1}`} aria-pressed={salesWeek===i} onClick={()=>setSalesWeek(i)}>{w.label}<small>{w.start+1}–{w.end+1} Oct</small></button>)}
          <button data-testid="sales-week-all" aria-pressed={salesWeek===-1} onClick={()=>setSalesWeek(-1)}>All Days<small>1–26 Oct</small></button>
        </div>}
        <p className="muted small">Historical values were transcribed from the supplied image and should be checked against the original workbook. Importing a new monthly report does not update this historical table.</p>
      </section>
      <div className="sales-summary">
        <div className="panel"><small>Field sales · 1–26 Oct</small><h2>{fmt(total)}</h2></div>
        <div className="panel"><small>Daily average</small><h2>{fmt(avg)}</h2></div>
        <div className="panel"><small>Best field-sales day</small><h2>{fmt(best)}</h2></div>
        <div className="panel"><small>Week 4 (22–26 Oct)</small><h2>{fmt(weeklyTotals[3])}</h2></div>
      </div>
      <section className="panel">
        <div className="panel-head"><div><h2>{salesPeriod === 'daily' ? 'Daily performance' : 'Weekly performance'} · {salesGrouping === 'region' ? 'Regions' : 'Territories'}</h2><p>RR is the daily run rate; weekly target = RR × days in that week</p></div></div>
        <div className="table-wrap sales-history-scroll sales-daily-table"><table className="sales-history-table">
          <thead><tr><th className="sales-sticky">{salesGrouping === 'region' ? 'Region' : 'Territory'}</th><th className="num">RR</th>{columns.map(c=><th key={c.label} className="num">{c.label}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>{records.map(r=><tr key={r.name} role="button" tabIndex={0} aria-label={`Open ${r.name} sales performance`} onClick={()=>setSelectedSales({name:r.name, grouping:salesGrouping})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedSales({name:r.name,grouping:salesGrouping})}}} className="sales-select-row"><td className="sales-sticky"><strong>{r.name}</strong>{r.sub && <small className="sales-sub">{r.sub}</small>}</td><td className="num" data-day="Daily RR">{r.target}</td>{columns.map(c=>{const n=sumSales(r.values.slice(c.start,c.end+1));const goal=r.target*(c.end-c.start+1);return <td key={c.label} data-day={c.label} className={`num ${n>=goal?'sales-hit':''}`} title={`Target ${goal} · ${goal?Math.round(n/goal*100):0}%`}>{fmt(n)}</td>})}<td className="num strong" data-day="Month total">{fmt(sumSales(r.values))}</td></tr>)}</tbody>
          <tfoot><tr><td className="sales-sticky"><strong>Field total</strong></td><td className="num">{sumSales(records.map(r=>r.target))}</td>{columns.map(c=><td className="num" key={c.label}>{fmt(sumSales(records.flatMap(r=>r.values.slice(c.start,c.end+1))))}</td>)}<td className="num">{fmt(sumSales(records.flatMap(r=>r.values)))}</td></tr></tfoot>
        </table></div>
      </section>
      {selectedSales && selectedSales.grouping === salesGrouping && (() => {
        const r = records.find(row=>row.name===selectedSales.name);
        if (!r) return null;
        const days = r.values;
        const rr = Number(r.target)||0;
        const actual = sumSales(days);
        const goal = rr * days.length;
        const pct = goal ? Math.round(actual/goal*100) : null;
        const delta = actual-goal;
        const activeWeeks = WEEK_GROUPS.map(w=>({
          ...w, actual:sumSales(days.slice(w.start,w.end+1)),
          target:rr*(w.end-w.start+1)
        }));
        const bestIndex = days.indexOf(Math.max(...days));
        const last7 = sumSales(days.slice(-7));
        const prior7 = sumSales(days.slice(-14,-7));
        const change = prior7 ? Math.round((last7-prior7)/prior7*100) : null;
        const hitDays = days.filter(v=>v>=rr).length;
        return <section className="panel sales-drilldown" data-testid="sales-drilldown" aria-label={`${r.name} performance details`}>
          <div className="panel-head">
            <div><span className="eyebrow">{salesGrouping==='region'?'Regional':'Territory'} performance · October 2026</span><h2>{r.name}</h2><p>{r.sub||'Regional aggregate'} · Historical snapshot through 26 October</p></div>
            <button className="btn" onClick={()=>setSelectedSales(null)} aria-label="Close sales details">Close details ×</button>
          </div>
          <div className="sales-detail-kpis">
            <div><small>Sales · 1–26 Oct</small><strong>{fmt(actual)}</strong></div>
            <div><small>Target · RR × 26 days</small><strong>{fmt(goal)}</strong></div>
            <div><small>Achievement</small><strong>{pct===null?'N/A':pct+'%'}</strong></div>
            <div><small>Variance to target</small><strong className={delta>=0?'pos':'neg'}>{delta>0?'+':''}{fmt(delta)}</strong></div>
          </div>
          <div className="sales-detail-columns">
            <div>
              <h3>Daily sales trend</h3>
              <p className="muted small">Daily sales compared with RR target of {fmt(rr)}. Select Daily Sales above for week filters.</p>
              <div className="sales-trend" role="img" aria-label={`Daily sales trend for ${r.name}; horizontal target line represents ${rr} sales per day`}>
                {days.map((n,i)=><div className="sales-trend-col" key={i} title={`${i+1} Oct: ${n} sales; target ${rr}`}>
                  <div className="sales-trend-bar" style={{height:`${Math.max(3,Math.round(n/Math.max(rr,...days,1)*100))}%`,background:n>=rr?'var(--good)':'var(--accent)'}}/>
                  <small>{i+1}</small>
                </div>)}
              </div>
              <h3>Weekly performance vs target</h3>
              <div className="sales-week-detail">{activeWeeks.map(w=>{
                const achievement=w.target?Math.round(w.actual/w.target*100):null;
                return <div className="sales-week-detail-row" key={w.label}>
                  <div><strong>{w.label}</strong><small>{w.start+1}–{w.end+1} Oct</small></div>
                  <div className="sales-week-track"><span style={{width:`${Math.min(100,achievement||0)}%`,background:w.actual>=w.target?'var(--good)':'var(--accent)'}}/></div>
                  <b>{fmt(w.actual)} / {fmt(w.target)}</b>
                  <small>{achievement===null?'N/A':achievement+'%'}</small>
                </div>
              })}</div>
            </div>
            <div className="sales-insights">
              <h3>Performance insights</h3>
              <div><small>Days meeting RR</small><strong>{hitDays} of {days.length}</strong></div>
              <div><small>Best day</small><strong>{bestIndex+1} Oct · {fmt(days[bestIndex])} sales</strong></div>
              <div><small>Last 7 days vs previous 7</small><strong>{change===null?'N/A':`${change>0?'+':''}${change}%`}</strong></div>
              <div><small>Daily average</small><strong>{fmt(Math.round(actual/days.length))}</strong></div>
              <p className="muted small">{pct===null?'No RR target is available.':pct>=100?'Sales are meeting the cumulative RR target.':'Sales are below the cumulative RR target.'} {change===null?'':change>0?'The latest seven days show positive momentum.':change<0?'The latest seven days have slowed compared with the previous seven.':'The last two seven-day periods are level.'}</p>
              <p className="muted small">Target comparisons use the current snapshot RR multiplied by the number of days, not an independently verified historical target. Data is transcribed from the screenshot.</p>
            </div>
          </div>
        </section>;
      })()}
      <section className="panel"><div className="panel-head"><div><h2>Telesales · separate</h2><p>Not included in territory or regional totals</p></div></div><div className="table-wrap sales-history-scroll sales-daily-table"><table className="sales-history-table"><thead><tr><th className="sales-sticky">Channel</th>{columns.map(c=><th className="num" key={c.label}>{c.label}</th>)}<th className="num">Total</th></tr></thead><tbody><tr><td className="sales-sticky">Telesales</td>{columns.map(c=><td className="num" data-day={c.label} key={c.label}>{sumSales(REGION_DAILY.Telesales.slice(c.start,c.end+1))}</td>)}<td className="num" data-day="Month total">{sumSales(REGION_DAILY.Telesales)}</td></tr></tbody></table></div></section>
    </>;
  };

  const reports = () => {
    const calc = companyAgg;
    const tie = tieOut
      ? [
          ['MTD target', calc.mtdTarget, tieOut.mtdTarget],
          ['Actual sales', calc.actual, tieOut.actual],
          ['Territory RR', calc.rr, tieOut.rr],
          ['Yesterday', calc.yesterday, tieOut.yesterday],
          ['MTD RR', calc.mtdRR, tieOut.mtdRR],
          ['Remaining', calc.remain, tieOut.remain],
          ['To go', calc.mtgGap, tieOut.mtgGap],
          ['New RR/day', calc.newRR, tieOut.newRR],
          ['MTD gap', calc.gap, tieOut.gap],
        ].filter(([, , s]) => s !== null && s !== undefined)
      : null;
    return (
      <>
        <section className="panel report">
          <div>
            <h2>Export {reportLabel} report</h2>
            <p>{terr.length} territories in the current filter · source {dataset.fileName}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={exportCSV}><Icon name="download" size={16} />Download CSV</button>
            <button className="btn primary" onClick={() => window.print()}><Icon name="printer" size={16} />Print</button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div><h2>Source tie-out</h2><p>Figures recalculated from the territory rows, checked against the sheet totals</p></div>
            {tie && <span className="tag">{tie.filter(([, a, b]) => a === b).length} / {tie.length} match</span>}
          </div>
          {tie ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Measure</th><th className="num">Calculated</th><th className="num">Sheet</th><th>Status</th></tr></thead>
                <tbody>
                  {tie.map(([label, a, b]) => (
                    <tr key={label}>
                      <td><strong>{label}</strong></td>
                      <td className="num">{label === 'MTD gap' ? signedGap(a) : fmt(a)}</td>
                      <td className="num">{label === 'MTD gap' ? signedGap(b) : fmt(b)}</td>
                      <td><span className={`pill ${a === b ? 'good' : 'low'}`}>{a === b ? 'Matches' : 'Mismatch'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">This source has no TOTAL row, so totals were not checked against it.</p>}
        </section>
      </>
    );
  };

  const settingsView = () => (
    <>
      <ImportPanel dataset={dataset} onApply={applyDataset} onRestore={restoreBuiltIn} />
      <section className="panel">
        <div className="panel-head">
          <div><h2>Display preferences</h2><p>Stored in this browser only. They never change the sales data.</p></div>
        </div>
        <div className="setting">
          <div>
            <strong>Watch threshold</strong>
            <small>Achievement below this is marked Behind. Currently {belowThreshold.length} region{belowThreshold.length === 1 ? '' : 's'} under it.</small>
          </div>
          <div className="range-wrap">
            <input type="range" min="40" max="95" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Watch threshold" />
            <b>{threshold}%</b>
          </div>
        </div>
        <div className="setting">
          <div><strong>Table density</strong><small>Row spacing across all tables</small></div>
          <div className="seg">
            {['comfortable', 'compact'].map((d) => (
              <button key={d} aria-pressed={settings.density === d} onClick={() => setDensity(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div><strong>Reset display preferences</strong><small>Restores the threshold and density defaults</small></div>
          <button className="btn" onClick={() => setSettings(DEFAULTS)}>Reset</button>
        </div>
      </section>
    </>
  );

  const views = { overview, regions, territories, team, telesales, 'daily-weekly': dailyWeekly, reports, settings: settingsView };

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''}`} data-density={settings.density}>
      <aside className={`side ${navOpen ? 'open' : ''}`} data-testid="sidebar">
        <div className="brand">
          <div className="logo">SP</div>
          <div>
            <div className="brand-name">SalesPulse</div>
            <div className="brand-sub">FY26 · Regional</div>
          </div>
        </div>
        <div className="nav-label">Workspace</div>
        <nav className="nav">
          {PAGES.map((p) => (
            <button key={p.id} title={p.label} aria-current={page === p.id ? 'page' : undefined}
              onClick={() => setPage(p.id)} data-testid={`nav-${p.id}`}>
              <Icon name={p.icon} size={18} /><span className="nav-text">{p.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span>Company MTD achievement</span>
          <strong>{companyAgg.pct}%</strong>
          <Bar value={companyAgg.pct} color="var(--accent)" />
          <small>{fmt(companyAgg.actual)} of {fmt(companyAgg.mtdTarget)} · day {daysElapsed}/{daysInMonth}</small>
        </div>
      </aside>
      {navOpen && <div className="nav-scrim" data-testid="nav-scrim" onClick={() => setNavOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="top-left">
            <button className="menu-btn icon-btn" data-testid="nav-toggle-mobile" onClick={() => setNavOpen((o) => !o)}
              aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen}>
              <Icon name={navOpen ? 'x' : 'menu'} />
            </button>
            <button className="collapse-btn icon-btn" data-testid="nav-collapse" onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
              <Icon name={collapsed ? 'chevRight' : 'chevLeft'} />
            </button>
            <div className="crumb">Workspace / <b>{meta.label}</b></div>
          </div>
          <div className="live"><span className="dot" />{dataset.source === 'excel' ? 'Live file' : 'Snapshot'} · {reportLabel}</div>
        </header>

        <main className="content">
          <div className="hero">
            <div>
              <div className="eyebrow">Day {daysElapsed} of {daysInMonth} · FY26 October</div>
              <h1>{meta.title}</h1>
              <p>Regional sales, targets and territory movement, updated from the daily sheet.</p>
            </div>
            <div className="actions">
              <button className="btn" onClick={refresh}><Icon name="refresh" size={16} />Refresh</button>
              <button className="btn primary" onClick={exportCSV}><Icon name="download" size={16} />Export CSV</button>
            </div>
          </div>

          {FILTERED.includes(page) && (
            <div className="filters">
              <div className="seg" role="group" aria-label="Filter by region">
                {['All', ...REGIONS].map((r) => (
                  <button key={r} aria-pressed={activeRegion === r} onClick={() => setRegion(r)}>{r}</button>
                ))}
              </div>
              <label className="search">
                <Icon name="search" size={16} />
                <input placeholder="Search territory, TSM or RSM" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
          )}

          {loading ? <PageSkeleton page={page} /> : <div className="page" key={`${page}-${tick}-${dataset.importedAt}`}>{views[page]()}</div>}

          <footer className="foot">
            <span>Â© 2026 SalesPulse</span>
            <span>{reportLabel} · {daysLeft} days remaining</span>
          </footer>
        </main>
      </div>

      {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}

      <Drawer open={drawer} onClose={closeDrawer} title={picked?.territory ?? ''}>
        {picked && <TerritoryDetail r={picked} threshold={threshold} daysLeft={daysLeft} rankCount={ALL.length + (TELESALES ? 1 : 0)} />}
      </Drawer>
    </div>
  );
}
