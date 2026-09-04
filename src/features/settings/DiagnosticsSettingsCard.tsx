import { useEffect, useRef, useState } from 'react';
import { getDiagnosticLogPort, type DiagnosticLogContent, type DiagnosticLogList, type DiagnosticLogPort } from '../../diagnostics/diagnosticLogService';
import './diagnosticsSettings.css';

interface Props {
  port?: DiagnosticLogPort;
  clipboard?: Pick<Clipboard, 'writeText'>;
}

export function DiagnosticsSettingsCard({ port = getDiagnosticLogPort(), clipboard = navigator.clipboard }: Props) {
  const [listing, setListing] = useState<DiagnosticLogList | null>(null);
  const [selected, setSelected] = useState('');
  const [log, setLog] = useState<DiagnosticLogContent | null>(null);
  const [status, setStatus] = useState('Loading diagnostic logs…');
  const generation = useRef(0);

  const read = async (filename: string, request = ++generation.current) => {
    setSelected(filename); setStatus('Loading log…');
    try {
      const result = await port.read(filename);
      if (request === generation.current) { setLog(result); setStatus(''); }
    } catch {
      if (request === generation.current) { setLog(null); setStatus('This diagnostic log could not be read.'); }
    }
  };

  const refresh = async () => {
    const request = ++generation.current;
    setStatus('Loading diagnostic logs…');
    try {
      const result = await port.list();
      if (request !== generation.current) return;
      setListing(result);
      const newest = result.files[0]?.filename ?? '';
      if (!newest) { setSelected(''); setLog(null); setStatus('No diagnostic logs are available yet.'); return; }
      await read(result.files.some((file) => file.filename === selected) ? selected : newest, request);
    } catch {
      if (request === generation.current) { setListing(null); setLog(null); setStatus('Diagnostic logs could not be loaded.'); }
    }
  };

  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, []); // port is intentionally fixed for this mounted viewer

  const copy = async () => {
    if (!log) return;
    try { await clipboard.writeText(log.content); setStatus('Log copied to the clipboard.'); }
    catch { setStatus('The log could not be copied.'); }
  };

  return <article className="feature-card feature-card--wide diagnostics-card">
    <div className="feature-card__toolbar"><div><h2>Diagnostics</h2><span>One log per day · newest 14 days</span></div><button type="button" className="feature-button feature-button--quiet" onClick={() => { void refresh(); }}>Refresh logs</button></div>
    <p>Review local launch and action events. Logs exclude credentials, provider page content, prompts, and usage values.</p>
    <div className="diagnostics-card__controls">
      <label className="feature-field">Daily log<select aria-label="Daily diagnostic log" value={selected} disabled={!listing?.files.length} onChange={(event) => { void read(event.target.value); }}>{listing?.files.map((file) => <option key={file.filename} value={file.filename}>{new Date(`${file.date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })} · {Math.ceil(file.sizeBytes / 1024)} KiB</option>)}</select></label>
      <button type="button" className="feature-button" disabled={!log} onClick={() => { void copy(); }}>Copy visible log</button>
    </div>
    <textarea aria-label="Diagnostic log content" readOnly value={log?.content ?? ''} />
    {log?.truncated ? <p className="diagnostics-card__notice">Showing the newest 512 KiB.</p> : null}
    <p className="diagnostics-card__status" role="status">{status}</p>
    <small>Location: {listing?.directory ?? 'Loading…'}</small>
  </article>;
}
