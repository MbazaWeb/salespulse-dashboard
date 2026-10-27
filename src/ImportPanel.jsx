import { useRef, useState } from 'react';
import { Icon } from './components.jsx';
import { fmt, signedGap } from './utils.js';

const SECTION_MARK = { ok: '✓', warn: '!', error: '×' };

export default function ImportPanel({ dataset, onApply, onRestore }) {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      // Load the Excel parser only when a user imports a workbook.
      // This keeps SheetJS out of the initial dashboard JavaScript bundle.
      const { parseWorkbook } = await import('./excel.js');
      const res = parseWorkbook(buffer, dataset);
      if (res.ok) res.dataset.fileName = file.name;
      setResult(res);
    } catch {
      setResult({ ok: false, error: 'Could not read this file. Save it as .xlsx and try again.', sections: [], issues: [] });
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const apply = () => {
    onApply(result.dataset);
    setResult(null);
  };

  const c = result?.changes;
  const issueCount = result?.issues?.length ?? 0;

  return (
    <section className="panel import">
      <div className="panel-head">
        <div>
          <h2>Update dashboard from Excel</h2>
          <p>Upload the daily regional sheet. Every section of the dashboard is rebuilt from it after you confirm.</p>
        </div>
        <span className={`tag ${dataset.source === 'excel' ? 'live-tag' : ''}`}>
          {dataset.source === 'excel' ? `Live · ${dataset.fileName}` : 'Built-in snapshot'}
        </span>
      </div>

      <div
        className={`dropzone ${dragOver ? 'over' : ''} ${busy ? 'busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        data-testid="dropzone"
      >
        <Icon name="upload" size={22} />
        <div>
          <strong>{busy ? 'Reading file…' : 'Drop an Excel file here, or click to choose'}</strong>
          <small>.xlsx, .xls or .csv · the sheet needs TERRITORY, RSM/TSM and ACTUAL headers</small>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      <div className="import-actions">
        {dataset.source === 'excel' && (
          <button className="btn" onClick={onRestore}>Restore built-in snapshot</button>
        )}
        <span className="muted small">
          Currently showing {dataset.reportLabel}
          {dataset.importedAt ? ` · imported ${new Date(dataset.importedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </span>
      </div>

      {result && (
        <div className="preview" data-testid="import-preview">
          {!result.ok ? (
            <div className="notice error-notice">
              <strong>Import stopped.</strong> {result.error}
            </div>
          ) : (
            <>
              <div className="preview-head">
                <div>
                  <div className="eyebrow">Review before applying · {fileName}</div>
                  <h3>{result.dataset.reportLabel} · {result.dataset.territories.length} territories</h3>
                </div>
                <div className="actions">
                  <button className="btn" onClick={() => setResult(null)}>Discard</button>
                  <button className="btn primary" onClick={apply} data-testid="apply-import">Apply to dashboard</button>
                </div>
              </div>

              <div className="changes">
                <div><span>Actual sales</span><b>{fmt(c.prev.actual)} → {fmt(c.next.actual)}</b></div>
                <div><span>Achievement</span><b>{c.prev.pct}% → {c.next.pct}%</b></div>
                <div><span>To go</span><b>{fmt(c.prev.mtgGap)} → {fmt(c.next.mtgGap)}</b></div>
                <div><span>Territories</span><b>+{c.added.length} / −{c.removed.length} · {c.changed} updated</b></div>
              </div>

              <div className="sections">
                {result.sections.map((s) => (
                  <div className={`section-check ${s.status}`} key={s.key}>
                    <span className="mark">{SECTION_MARK[s.status]}</span>
                    <div>
                      <strong>{s.title}</strong>
                      {s.lines.map((l, i) => <small key={i}>{l}</small>)}
                    </div>
                  </div>
                ))}
              </div>

              {result.tieRows.length > 0 && (
                <details className="tie">
                  <summary>Totals check against the sheet</summary>
                  <table>
                    <thead><tr><th>Measure</th><th className="num">Calculated</th><th className="num">Sheet</th><th>Status</th></tr></thead>
                    <tbody>
                      {result.tieRows.map((r) => (
                        <tr key={r.key}>
                          <td>{r.label}</td>
                          <td className="num">{r.key === 'gap' ? signedGap(r.calc) : fmt(r.calc)}</td>
                          <td className="num">{r.key === 'gap' ? signedGap(r.sheet) : fmt(r.sheet)}</td>
                          <td><span className={`pill ${r.ok ? 'good' : 'low'}`}>{r.ok ? 'Matches' : 'Mismatch'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              {issueCount > 0 && (
                <details className="tie" open>
                  <summary>{issueCount} issue{issueCount === 1 ? '' : 's'} found</summary>
                  <ul className="issues">
                    {result.issues.slice(0, 25).map((x, i) => (
                      <li key={i}>{x.row ? `Row ${x.row}` : 'Sheet'}{x.territory ? ` · ${x.territory}` : ''}: {x.msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
