import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Bug, RotateCcw, ChevronDown } from 'lucide-react';
import './styles.css';
import './playground.css';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from './components/ui/dialog';

if (typeof document !== 'undefined') document.documentElement.classList.add('dark');
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
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="pg-banner">
        <a className="pg-home" href="/">
          All apps
        </a>
        <div className="pg-tools">
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Bug size={13} /> {active ? 'Bug enabled' : 'Test controls'}
              <ChevronDown size={12} />
            </Button>
          </DialogTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reset}
            aria-label="Reset playground session"
            title="Reset playground session"
          >
            <RotateCcw size={13} />
          </Button>
        </div>
        <DialogContent className="pg-menu max-w-lg" aria-describedby="pg-controls-description">
          <DialogHeader>
            <DialogTitle>{app} test controls</DialogTitle>
            <DialogDescription id="pg-controls-description">
              Deliberate bugs are off by default. Enable one to test a failure.
            </DialogDescription>
          </DialogHeader>
          <label className="pg-control-label">
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
          <div className="pg-bug-options">
            {bugs.map((b) => (
              <div key={b.id}>
                <b>{b.label}</b>
                <p>{b.description}</p>
                <code>?bug={b.id}</code>
              </div>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close controls
          </Button>
        </DialogContent>
        {active && (
          <div className="pg-bug" role="status">
            Deliberate bug enabled: {bugs.find((b) => b.id === active)?.label || active}{' '}
            <Button variant="ghost" size="sm" onClick={() => toggleBug('')}>
              Disable
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export * from './components/ui/button';
export * from './components/ui/input';
export * from './components/ui/textarea';
export * from './components/ui/badge';
export * from './components/ui/card';
export * from './components/ui/separator';
export * from './components/ui/dialog';
export * from './components/ui/tabs';
export * from './components/ui/select';
export * from './components/ui/label';
export * from './brand-mark';
