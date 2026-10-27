import { useEffect, useState } from 'react';
import { fmt, statusOf, toneVar } from './utils.js';

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

export function useCountUp(target, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

const PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 15c1.6.6 2.8 2.2 3 5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M4 20h16" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  printer: <><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2" /><rect x="6" y="14" width="12" height="7" /></>,
  upload: <><path d="M12 15V4M7 9l5-5 5 5M4 20h16" /></>,
  chevLeft: <path d="m15 6-6 6 6 6" />,
  chevRight: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12 4 4 10-10" />,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Kpi({ label, value, sub, icon, tone = '', delay = 0 }) {
  const v = useCountUp(value);
  return (
    <article className={`kpi ${tone}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="kpi-top">
        <span>{label}</span>
        {icon && <span className="kpi-ico"><Icon name={icon} size={16} /></span>}
      </div>
      <strong className="kpi-val">{fmt(v)}</strong>
      <small>{sub}</small>
    </article>
  );
}

export function Ring({ value, size = 112, stroke = 11, color = 'var(--accent)', label }) {
  const m = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - (Math.min(value, 100) / 100) * (m ? 1 : 0));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      </svg>
      <div className="ring-label"><strong>{label ?? `${Math.round(value)}%`}</strong></div>
    </div>
  );
}

export function Bar({ value, max = 100, color = 'var(--accent)' }) {
  const m = useMounted();
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <i style={{ width: `${m ? w : 0}%`, background: color }} />
    </div>
  );
}

export function Pill({ pct, threshold }) {
  const s = statusOf(pct, threshold);
  return <span className={`pill ${s.key}`}>{s.label}</span>;
}

export function SortTh({ label, k, sort, onSort, num }) {
  const active = sort.key === k;
  return (
    <th className={num ? 'num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className={`th-btn ${active ? 'on' : ''}`} onClick={() => onSort(k)}>
        {label}
        <span className="arrow">{active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head">
          <div>
            <div className="eyebrow">Territory detail</div>
            <h3>{title}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close details"><Icon name="x" /></button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function SkeletonKpis() {
  return (
    <div className="kpi-grid">
      {[0, 1, 2, 3].map((i) => (
        <div className="kpi" key={i}>
          <div className="sk" style={{ width: '40%', height: 12 }} />
          <div className="sk" style={{ width: '60%', height: 30, marginTop: 18 }} />
          <div className="sk" style={{ width: '75%', height: 10, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ rows = 5 }) {
  return (
    <div className="panel">
      <div className="sk" style={{ width: '30%', height: 16 }} />
      <div className="sk-stack">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="sk" style={{ width: `${100 - ((i * 13) % 35)}%`, height: 14 }} />
        ))}
      </div>
    </div>
  );
}

export { toneVar };
