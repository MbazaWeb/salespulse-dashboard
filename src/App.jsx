import { useEffect, useMemo, useState } from 'react';
import { BUILTIN_DATASET, loadDataset, saveDataset, clearDataset } from './data.js';
import { aggregate, groupBy, sortRows, toCSV, download, fmt, signedGap, statusOf, toneVar } from './utils.js';
import { Icon, Kpi, Ring, Bar, Pill, SortTh, SkeletonKpis, SkeletonPanel, Drawer } from './components.jsx';
import ImportPanel from './ImportPanel.jsx';

const PAGES = [
  { id: 'overview', label: 'Overview', icon: 'grid', title: 'Performance overview' },
  { id: 'regions', label: 'Regions', icon: 'map', title: 'Regional breakdown' },
  { id: 'territories', label: 'Territories', icon: 'list', title: 'Territory ledger' },
  { id: 'team', label: 'Team', icon: 'users', title: 'Managers & rollups' },
  { id: 'telesales', label: 'Telesales', icon: 'phone', title: 'Telesales desk' },
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
                <td key={c.k} className={c.num ? 'num' : ''}><Cell r={r} k={c.k} threshold={threshold} /></td>
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
                return <td key={c.k} className={c.num ? 'num' : ''}>{v}</td>;
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
              <td><strong>{g.name}</strong></td>
              <td className="num">{g.count}</td>
              <td className="num">{fmt(g.mtdRR)}</td>
              <td className="num">{fmt(g.mtdTarget)}</td>
              <td className="num strong">{fmt(g.actual)}</td>
              <td><Ach pct={g.pct} threshold={threshold} /></td>
              <td className={`num ${g.gap < 0 ? 'neg' : 'pos'}`}>{signedGap(g.gap)}</td>
              <td className="num">{fmt(g.mtgGap)}</td>
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

  const views = { overview, regions, territories, team, telesales, reports, settings: settingsView };

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
            <span>© 2026 SalesPulse</span>
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
