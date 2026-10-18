import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Bug, RotateCcw, ChevronDown } from 'lucide-react';
import './playground.css';
export type BugDefinition = { id: string; label: string; description: string };
export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(`playground:${key}`);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      /* Private browsing may disallow storage. */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(`playground:${key}`, JSON.stringify(value));
    } catch {
      /* Continue in memory when storage is full. */
    }
  }, [key, value]);
  return [value, setValue];
}
export function PlaygroundBanner({ app, bugs = [] }: { app: string; bugs?: BugDefinition[] }) {
  const [open, setOpen] = useState(false);
  const active = new URLSearchParams(location.search).get('bug');
  function toggleBug(id: string) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('bug', id);
    else url.searchParams.delete('bug');
    location.assign(url.toString());
  }
  function reset() {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith('playground:')) sessionStorage.removeItem(key);
    const url = new URL(location.href);
    url.searchParams.delete('bug');
    url.hash = '';
    location.assign(url.toString());
  }
  return (
    <div className="pg-banner">
      <div>
        <span className="pg-dot" /> Playground{' '}
        <span className="pg-muted">· Simulated data. No real transactions.</span>
      </div>
      <div className="pg-tools">
        <a href="/">All apps</a>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          <Bug size={13} /> {active ? 'Bug enabled' : 'Test controls'}
          <ChevronDown size={12} />
        </button>
        <button
          onClick={reset}
          aria-label="Reset playground session"
          title="Reset playground session"
        >
          <RotateCcw size={13} />
        </button>
      </div>
      {open && (
        <div className="pg-menu">
          <strong>{app} test controls</strong>
          <p>Deliberate bugs are off by default. Enable one to test a failure.</p>
          <label>
            Active bug
            <select
              aria-label="Active bug"
              value={active || ''}
              onChange={(e) => toggleBug(e.target.value)}
            >
              <option value="">None — normal behavior</option>
              {bugs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          {bugs.map((b) => (
            <div key={b.id}>
              <b>{b.label}</b>
              <p>
                {b.description} <code>?bug={b.id}</code>
              </p>
            </div>
          ))}
          <button onClick={() => setOpen(false)}>Close controls</button>
        </div>
      )}
      {active && (
        <div className="pg-bug" role="status">
          Deliberate bug enabled: {bugs.find((b) => b.id === active)?.label || active}{' '}
          <button onClick={() => toggleBug('')}>Disable</button>
        </div>
      )}
    </div>
  );
}
