import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  BrandMark,
  PlaygroundBanner,
  useSessionState,
  Button as ShadcnButton,
  Input,
  Textarea,
  Badge,
  Card,
  Dialog as ShadcnDialog,
  DialogContent,
  DialogTitle,
} from '@playground/ui';
import {
  DEFAULT_MONITORS,
  METRICS,
  OBSERVABILITY_NOW,
  RANGE_MINUTES,
  SERVICES,
  evaluateAlert,
  filterLogs,
  metricSeries,
  seededLogs,
  seededTraces,
  validateAlert,
  type AlertRule,
  type LogEntry,
  type LogLevel,
  type TimeRange,
  type Trace,
  type TraceSpan,
} from '@playground/core/observability';

type Page = 'overview' | 'logs' | 'traces' | 'monitors';
const navigation = [
  { id: 'overview' as Page, label: 'Overview', icon: LayoutDashboard },
  { id: 'logs' as Page, label: 'Log explorer', icon: Terminal },
  { id: 'traces' as Page, label: 'Traces', icon: GitBranch },
  { id: 'monitors' as Page, label: 'Monitors', icon: Bell },
];
const logs = seededLogs();
const traces = seededTraces();
const bugDefinitions = [
  {
    id: 'log-filter',
    label: 'Broken log status filter',
    description: 'Status queries and facets are ignored, so unrelated log levels appear.',
  },
  {
    id: 'alert-threshold',
    label: 'Inverted monitor threshold',
    description: 'New monitors save the opposite threshold direction.',
  },
];
const bug = new URLSearchParams(window.location.search).get('bug');
const pageFromHash = (): Page => {
  const value = location.hash.slice(1);
  return navigation.some((item) => item.id === value) ? (value as Page) : 'overview';
};
const rangeLabels: Record<TimeRange, string> = {
  '15m': 'Past 15 minutes',
  '1h': 'Past 1 hour',
  '4h': 'Past 4 hours',
  '24h': 'Past 24 hours',
};
const time = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
const number = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits });

function Button({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variant = className.includes('primary')
    ? 'default'
    : className.includes('danger')
      ? 'destructive'
      : 'outline';
  return (
    <ShadcnButton variant={variant} className={`button ${className}`} {...props}>
      {children}
    </ShadcnButton>
  );
}
function Status({ value }: { value: string }) {
  const tone =
    value === 'warning'
      ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
      : value === 'alert' || value === 'error'
        ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
        : value === 'paused'
          ? 'border-slate-400/25 bg-slate-400/10 text-slate-300'
          : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  return (
    <Badge variant="outline" className={`status status-${value} ${tone} text-xs font-semibold`}>
      <span />
      {value === 'ok'
        ? 'Healthy'
        : value === 'paused'
          ? 'Paused'
          : value.charAt(0).toUpperCase() + value.slice(1)}
    </Badge>
  );
}

function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Search size={24} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <ShadcnDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`dialog ${wide ? 'wide sm:max-w-[1000px]' : 'sm:max-w-[640px]'} top-[calc(50%+20px)] max-h-[calc(100dvh-80px)] block gap-0 p-0`}
        aria-describedby={undefined}
        showCloseButton={false}
      >
        <header>
          <DialogTitle>{title}</DialogTitle>
          <ShadcnButton variant="ghost" size="icon-sm" aria-label="Close dialog" onClick={onClose}>
            <X size={19} />
          </ShadcnButton>
        </header>
        {children}
      </DialogContent>
    </ShadcnDialog>
  );
}

function Chart({
  values,
  color = '#6c9cff',
  height = 160,
  label,
  compact = false,
  unit = '',
}: {
  values: number[];
  color?: string;
  height?: number;
  label: string;
  compact?: boolean;
  unit?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth || 480,
        dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(dpr, dpr);
      const left = compact ? 0 : 48,
        top = 10,
        bottom = compact ? 0 : 24;
      const usableWidth = width - left - 10,
        usableHeight = height - top - bottom,
        maximum = Math.max(...values) * 1.2;
      context.clearRect(0, 0, width, height);
      if (!compact) {
        context.font = '500 12px Inter, sans-serif';
        context.fillStyle = '#a7b4c7';
        context.strokeStyle = '#283548';
        context.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const y = top + (usableHeight * i) / 3;
          context.beginPath();
          context.moveTo(left, y);
          context.lineTo(width, y);
          context.stroke();
          context.fillText(number(maximum * (1 - i / 3), maximum < 10 ? 1 : 0), 0, y + 4);
        }
      }
      const points = values.map(
        (value, i) =>
          [
            left + (usableWidth * i) / (values.length - 1),
            top + usableHeight * (1 - value / maximum),
          ] as const,
      );
      const gradient = context.createLinearGradient(0, top, 0, height);
      gradient.addColorStop(0, `${color}24`);
      gradient.addColorStop(1, `${color}00`);
      context.beginPath();
      context.moveTo(left, top + usableHeight);
      points.forEach(([x, y]) => context.lineTo(x, y));
      context.lineTo(left + usableWidth, top + usableHeight);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      context.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.strokeStyle = color;
      context.lineWidth = compact ? 1.6 : 2;
      context.lineJoin = 'round';
      context.stroke();
      if (hover !== null) {
        const point = points[hover];
        if (point) {
          context.strokeStyle = '#9db5d8';
          context.setLineDash([3, 3]);
          context.beginPath();
          context.moveTo(point[0], top);
          context.lineTo(point[0], height - bottom);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.arc(point[0], point[1], 4, 0, Math.PI * 2);
          context.fillStyle = color;
          context.fill();
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [values, height, compact, color, hover]);
  return (
    <div className="canvas-wrap">
      <canvas
        ref={ref}
        style={{ width: '100%', height }}
        role="img"
        aria-label={`${label}. Minimum ${number(Math.min(...values), 2)}${unit}, maximum ${number(Math.max(...values), 2)}${unit}.`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHover(
            Math.min(
              values.length - 1,
              Math.max(
                0,
                Math.round(
                  ((event.clientX - rect.left - (compact ? 0 : 48)) /
                    (rect.width - (compact ? 10 : 58))) *
                    (values.length - 1),
                ),
              ),
            ),
          );
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hover !== null && (
        <span className="chart-tooltip">
          {number(values[hover] ?? 0, 2)}
          {unit}
        </span>
      )}
    </div>
  );
}

function RangePicker({
  range,
  setRange,
}: {
  range: TimeRange;
  setRange: (value: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="range-control" ref={ref}>
      <Button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Clock3 size={15} />
        {rangeLabels[range]}
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="range-menu" role="menu" aria-label="Time range">
          <div className="menu-label">RELATIVE TIME</div>
          {(Object.keys(rangeLabels) as TimeRange[]).map((value) => (
            <button
              role="menuitemradio"
              aria-checked={range === value}
              key={value}
              onClick={() => {
                setRange(value);
                setOpen(false);
              }}
            >
              {rangeLabels[value]}
              {range === value && <Check size={15} />}
            </button>
          ))}
          <p>UTC</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [range, setRange] = useSessionState<TimeRange>('vigil-range', '1h');
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);
  const [environment, setEnvironment] = useSessionState<string>('vigil-environment', 'production');
  const [monitors, setMonitors] = useSessionState<AlertRule[]>('vigil-monitors', DEFAULT_MONITORS);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [command, setCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const handler = () => setPage(pageFromHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    document.title = `${navigation.find((item) => item.id === page)?.label ?? 'Overview'} · PepaPog`;
  }, [page]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((value) => value + 1), 5000);
    return () => clearInterval(id);
  }, [live]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setCommand((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function navigate(value: Page) {
    location.hash = value;
    setPage(value);
  }
  return (
    <div className="vigil-app">
      <PlaygroundBanner app="PepaPog" bugs={bugDefinitions} />
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#overview"
            onClick={() => navigate('overview')}
            aria-label="PepaPog home"
          >
            <div className="brand-mark">
              <BrandMark app="observability" size={32} className="size-8 shrink-0" />
            </div>
            <span>PepaPog</span>
          </a>
          <nav aria-label="Main navigation">
            {navigation.map((item) => (
              <a
                href={`#${item.id}`}
                key={item.id}
                className={page === item.id ? 'active' : ''}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === 'monitors' && <span className="nav-count">{monitors.length}</span>}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={() => setHelp(true)}>
              <CircleHelp size={17} />
              Help
              <ArrowUpRight size={14} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <strong>{navigation.find((item) => item.id === page)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <ShadcnButton
                variant="ghost"
                className="command-trigger"
                onClick={() => setCommand(true)}
              >
                <Search size={15} />
                <span>Find a page</span>
                <kbd>⌘ K</kbd>
              </ShadcnButton>
            </div>
          </header>
          <main>
            <div className="page-heading">
              <div>
                <h1>
                  {page === 'overview'
                    ? 'Production overview'
                    : page === 'logs'
                      ? 'Log explorer'
                      : page === 'traces'
                        ? 'Distributed traces'
                        : 'Monitors'}
                </h1>
              </div>
              {page !== 'monitors' && (
                <div className="page-tools">
                  <RangePicker range={range} setRange={setRange} />
                  <button
                    className={`live-toggle ${live ? 'on' : ''}`}
                    onClick={() => setLive(!live)}
                    aria-pressed={live}
                    title={live ? 'Pause live updates' : 'Resume live updates'}
                  >
                    {live ? <Radio size={14} /> : <Pause size={14} />}
                    {live ? 'Live' : 'Paused'}
                  </button>
                </div>
              )}
            </div>
            {loading ? (
              <div className="loading-state" role="status">
                <LoaderCircle size={24} className="spin" />
                Loading telemetry…
              </div>
            ) : (
              <>
                {page === 'overview' && (
                  <Overview
                    range={range}
                    tick={tick}
                    environment={environment}
                    setEnvironment={setEnvironment}
                    navigate={navigate}
                  />
                )}
                {page === 'logs' && (
                  <Logs
                    range={range}
                    environment={environment}
                    setEnvironment={setEnvironment}
                    onTrace={(trace) => {
                      setSelectedTrace(trace);
                      navigate('traces');
                    }}
                    notify={setToast}
                  />
                )}
                {page === 'traces' && (
                  <Traces range={range} selected={selectedTrace} setSelected={setSelectedTrace} />
                )}
                {page === 'monitors' && (
                  <Monitors monitors={monitors} setMonitors={setMonitors} notify={setToast} />
                )}
              </>
            )}
          </main>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <ShadcnButton
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            onClick={() => setToast('')}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </ShadcnButton>
        </div>
      )}
      {help && (
        <Dialog title="Help" onClose={() => setHelp(false)}>
          <div className="dialog-body help-content">
            <h3>Search syntax</h3>
            <code>service:checkout status:error</code>
            <code>env:production -status:debug</code>
            <code>"payment provider"</code>
            <p>Live metrics update every 5 seconds.</p>
            <Button className="primary" onClick={() => setHelp(false)}>
              Close
            </Button>
          </div>
        </Dialog>
      )}
      {command && (
        <Dialog title="Go to…" onClose={() => setCommand(false)}>
          <div className="dialog-body">
            <label className="command-input">
              <Search size={18} />
              <Input
                autoFocus
                placeholder="Search pages"
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
              />
            </label>
            <div className="command-results">
              {navigation
                .filter((item) => item.label.toLowerCase().includes(commandQuery.toLowerCase()))
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.id);
                      setCommand(false);
                      setCommandQuery('');
                    }}
                  >
                    <item.icon size={18} />
                    {item.label}
                    <ArrowRight size={15} />
                  </button>
                ))}
              {!navigation.some((item) =>
                item.label.toLowerCase().includes(commandQuery.toLowerCase()),
              ) && <p>No matching pages.</p>}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Overview({
  range,
  tick,
  environment,
  setEnvironment,
  navigate,
}: {
  range: TimeRange;
  tick: number;
  environment: string;
  setEnvironment: (value: string) => void;
  navigate: (page: Page) => void;
}) {
  const requests = useMemo(() => metricSeries(range, tick, 'requests'), [range, tick]);
  const latency = useMemo(() => metricSeries(range, tick, 'latency'), [range, tick]);
  const errors = useMemo(() => metricSeries(range, tick, 'errors'), [range, tick]);
  const cpu = useMemo(() => metricSeries(range, tick, 'cpu'), [range, tick]);
  const scale = environment === 'staging' ? 0.18 : environment === 'all' ? 1.18 : 1;
  const scaledRequests = requests.map((value) => value * scale);
  return (
    <>
      <div className="filter-strip">
        <label>
          <Filter size={14} />
          <span>Environment</span>
          <select
            aria-label="Environment"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="all">all environments</option>
          </select>
        </label>
        <span className="filter-divider" />
        <span className="subtle">6 services</span>
        <span className="filter-right">
          <span className="live-dot" />
          Updated just now
        </span>
      </div>
      <section className="stats-grid" aria-label="Key metrics">
        {[
          {
            name: 'Request rate',
            value: number(scaledRequests.at(-1) ?? 0),
            unit: 'req/s',
            change: '+12.8%',
            good: true,
            values: scaledRequests,
            color: '#6c9cff',
            note: 'vs. previous period',
          },
          {
            name: 'P95 latency',
            value: number(latency.at(-1) ?? 0),
            unit: 'ms',
            change: '−8.2%',
            good: true,
            values: latency,
            color: '#a294ff',
            note: 'vs. previous period',
          },
          {
            name: 'Error rate',
            value: number(errors.at(-1) ?? 0, 2),
            unit: '%',
            change: '−0.12%',
            good: true,
            values: errors,
            color: '#f48cab',
            note: 'vs. previous period',
          },
          {
            name: 'Active services',
            value: '6',
            unit: '/ 6',
            change: '100%',
            good: true,
            values: cpu.map(() => 100),
            color: '#58cda5',
            note: 'services reporting',
          },
        ].map((metric) => (
          <Card className="stat-card block gap-0" key={metric.name}>
            <div className="stat-label">
              {metric.name}
              <Activity size={14} />
            </div>
            <div className="stat-value">
              {metric.value}
              <span>{metric.unit}</span>
            </div>
            <div className="stat-bottom">
              <span className="metric-change">
                {metric.change.startsWith('+') ? (
                  <ArrowUpRight size={13} />
                ) : metric.change === '100%' ? (
                  <Check size={13} />
                ) : (
                  <ArrowDownLeft size={13} />
                )}
                {metric.change}
              </span>
              <span>{metric.note}</span>
            </div>
            <div className="sparkline">
              <Chart
                values={metric.values}
                label={metric.name}
                color={metric.color}
                compact
                height={42}
              />
            </div>
          </Card>
        ))}
      </section>
      <section className="charts-grid">
        <Card className="panel block gap-0 py-0">
          <div className="panel-heading">
            <div>
              <h2>Request volume</h2>
            </div>
            <span className="chart-legend">
              <i style={{ background: '#6c9cff' }} />
              Requests / second
            </span>
          </div>
          <Chart
            values={scaledRequests}
            label="Request volume over selected time range"
            height={195}
          />
          <ChartTimes range={range} />
          <div className="chart-foot">
            <span>
              Total requests{' '}
              <strong>
                {number(
                  ((scaledRequests.reduce((sum, value) => sum + value, 0) / scaledRequests.length) *
                    RANGE_MINUTES[range] *
                    60) /
                    1000000,
                  1,
                )}
                M
              </strong>
            </span>
            <span>
              Peak <strong>{number(Math.max(...scaledRequests))} req/s</strong>
            </span>
          </div>
        </Card>
        <Card className="panel block gap-0 py-0">
          <div className="panel-heading">
            <div>
              <h2>Response time</h2>
            </div>
            <span className="chart-legend">
              <i style={{ background: '#a294ff' }} />
              P95 latency
            </span>
          </div>
          <Chart
            values={latency}
            color="#a294ff"
            label="P95 response time over selected time range"
            height={195}
            unit=" ms"
          />
          <ChartTimes range={range} />
          <div className="chart-foot">
            <span>
              Average <strong>{number(latency.reduce((a, b) => a + b) / latency.length)} ms</strong>
            </span>
            <span className="healthy-text">
              <CheckCircle2 size={13} />
              Within 300 ms budget
            </span>
          </div>
        </Card>
      </section>
      <div className="section-heading">
        <div>
          <h2>Service health</h2>
        </div>
        <ShadcnButton variant="ghost" className="text-button" onClick={() => navigate('traces')}>
          View traces
          <ArrowRight size={14} />
        </ShadcnButton>
      </div>
      <Card className="panel service-table table-scroll block gap-0 py-0">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Request rate</th>
              <th>Error rate</th>
              <th>P95 latency</th>
              <th>Last 60 minutes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((service, i) => (
              <tr key={service}>
                <td>
                  <span className={`service-icon service-color-${i}`}>
                    <Server size={15} />
                  </span>
                  <strong>{service}</strong>
                  <small>{['Node.js', 'Node.js', 'Python', 'Go', 'Node.js', 'Go'][i]}</small>
                </td>
                <td>
                  <Status value={i === 2 ? 'warning' : 'ok'} />
                </td>
                <td>
                  {number([482, 284, 112, 226, 94, 312][i]! * scale)}
                  <span className="cell-unit">req/s</span>
                </td>
                <td>
                  <span className={i === 2 ? 'warning-text' : ''}>
                    {[0.12, 0.34, 1.42, 0.08, 0.02, 0.04][i]}%
                  </span>
                </td>
                <td>
                  {[86, 142, 284, 64, 42, 38][i]}
                  <span className="cell-unit">ms</span>
                </td>
                <td className="table-chart">
                  <Chart
                    values={metricSeries('1h', tick + i * 4, 'requests')}
                    color={i === 2 ? '#6c9cff' : '#77a293'}
                    compact
                    height={31}
                    label={`${service} request history`}
                  />
                </td>
                <td>
                  <ShadcnButton
                    variant="ghost"
                    size="icon-sm"
                    className="icon-button"
                    aria-label={`View ${service} logs`}
                    onClick={() => {
                      sessionStorage.setItem('vigil-quick-query', `service:${service}`);
                      navigate('logs');
                    }}
                  >
                    <ChevronRight size={16} />
                  </ShadcnButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="bottom-panels">
        <Card className="panel compact-panel block gap-0 py-0">
          <div className="panel-heading">
            <h2>
              <Bell size={15} />
              Monitor activity
            </h2>
            <ShadcnButton
              variant="ghost"
              className="text-button"
              onClick={() => navigate('monitors')}
            >
              View monitors
              <ArrowRight size={13} />
            </ShadcnButton>
          </div>
          <div className="activity-item">
            <span className="activity-dot amber" />
            <div>
              <strong>Payment latency approaching threshold</strong>
              <p>payment-worker · Warning threshold: 250 ms</p>
            </div>
            <time>8 min ago</time>
          </div>
          <div className="activity-item">
            <span className="activity-dot green" />
            <div>
              <strong>API error rate recovered</strong>
              <p>api-gateway · Back within normal range</p>
            </div>
            <time>24 min ago</time>
          </div>
        </Card>
        <Card className="panel compact-panel block gap-0 py-0">
          <div className="panel-heading">
            <h2>
              <Activity size={15} />
              Infrastructure
            </h2>
            <span className="subtle">12 hosts</span>
          </div>
          <div className="resource">
            <span>CPU utilization</span>
            <strong>{number(cpu.at(-1) ?? 0)}%</strong>
            <div>
              <i style={{ width: `${cpu.at(-1)}%` }} />
            </div>
          </div>
          <div className="resource">
            <span>Memory usage</span>
            <strong>62%</strong>
            <div>
              <i style={{ width: '62%', background: '#8295bc' }} />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
function ChartTimes({ range }: { range: TimeRange }) {
  return (
    <div className="chart-times">
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
        <span key={fraction}>
          {time(OBSERVABILITY_NOW - RANGE_MINUTES[range] * 60000 * (1 - fraction)).slice(0, 5)}
        </span>
      ))}
    </div>
  );
}

function Logs({
  range,
  environment,
  setEnvironment,
  onTrace,
  notify,
}: {
  range: TimeRange;
  environment: string;
  setEnvironment: (value: string) => void;
  onTrace: (trace: Trace) => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useSessionState('vigil-query', '');
  const [draft, setDraft] = useState(query);
  const [levels, setLevels] = useSessionState<LogLevel[]>('vigil-log-levels', []);
  const [services, setServices] = useSessionState<string[]>('vigil-log-services', []);
  const [error, setError] = useState('');
  const [scroll, setScroll] = useState(0);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const quick = sessionStorage.getItem('vigil-quick-query');
    if (quick) {
      setQuery(quick);
      setDraft(quick);
      sessionStorage.removeItem('vigil-quick-query');
    }
  }, []);
  const filtered = useMemo(() => {
    try {
      const result = filterLogs(
        logs,
        query,
        { range, environment, levels, services },
        bug === 'log-filter',
      );
      return sortNewest ? result : [...result].reverse();
    } catch {
      return [];
    }
  }, [query, range, environment, levels, services, sortNewest]);
  const facets = useMemo(() => filterLogs(logs, '', { range, environment }), [range, environment]);
  useEffect(() => {
    setScroll(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [query, range, environment, levels, services, sortNewest]);
  const rowHeight = 43,
    visibleHeight = 430,
    start = Math.max(0, Math.floor(scroll / rowHeight) - 3),
    end = Math.min(filtered.length, start + Math.ceil(visibleHeight / rowHeight) + 7);
  const histogram = useMemo(() => {
    const bins = Array.from({ length: 72 }, () => ({ info: 0, warn: 0, error: 0 }));
    filtered.forEach((log) => {
      const index = Math.min(
        71,
        Math.max(
          0,
          Math.floor(((OBSERVABILITY_NOW - log.timestamp) / (RANGE_MINUTES[range] * 60000)) * 72),
        ),
      );
      bins[71 - index]![log.level === 'debug' ? 'info' : log.level]++;
    });
    return bins;
  }, [filtered, range]);
  function search(event: FormEvent) {
    event.preventDefault();
    try {
      filterLogs(logs, draft);
      setError('');
      setBusy(true);
      setTimeout(() => {
        setQuery(draft);
        setBusy(false);
      }, 180);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function clear() {
    setDraft('');
    setQuery('');
    setLevels([]);
    setServices([]);
    setError('');
  }
  const toggle = <T,>(values: T[], value: T) =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  return (
    <>
      <form className="query-bar" onSubmit={search}>
        <Search size={18} />
        <Input
          aria-label="Log search query"
          placeholder="Search logs…  service:checkout status:error"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? 'query-error' : 'query-hint'}
        />
        {draft && (
          <ShadcnButton
            variant="ghost"
            size="icon-sm"
            type="button"
            className="icon-button"
            aria-label="Clear query"
            onClick={() => {
              setDraft('');
              setQuery('');
              setError('');
            }}
          >
            <X size={16} />
          </ShadcnButton>
        )}
        <Button type="submit" className="primary">
          {busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}Search
        </Button>
      </form>
      {error ? (
        <p className="field-error query-error" id="query-error" role="alert">
          <TriangleAlert size={14} />
          {error}
        </p>
      ) : (
        <div className="query-hint" id="query-hint">
          Try{' '}
          <button
            onClick={() => {
              setDraft('status:error');
              setQuery('status:error');
            }}
          >
            status:error
          </button>
          <button
            onClick={() => {
              setDraft('service:checkout');
              setQuery('service:checkout');
            }}
          >
            service:checkout
          </button>
          <span>Use quotes for exact phrases and − to exclude a term.</span>
        </div>
      )}
      <Card className="panel log-volume block gap-0 py-0">
        <div className="panel-heading">
          <h2>
            Log volume<span className="count-badge">{number(filtered.length)}</span>
          </h2>
          <div className="histogram-legend">
            <span>
              <i className="info" />
              Info / debug
            </span>
            <span>
              <i className="warn" />
              Warning
            </span>
            <span>
              <i className="error" />
              Error
            </span>
          </div>
        </div>
        <div
          className="histogram"
          role="img"
          aria-label={`Log volume histogram for ${filtered.length} matching logs`}
        >
          {histogram.map((bin, i) => {
            const max = Math.max(
              1,
              ...histogram.map((value) => value.info + value.warn + value.error),
            );
            return (
              <div
                className="histogram-bar"
                key={i}
                title={`${bin.info + bin.warn + bin.error} logs`}
              >
                <i className="info" style={{ height: `${(bin.info / max) * 100}%` }} />
                <i className="warn" style={{ height: `${(bin.warn / max) * 100}%` }} />
                <i className="error" style={{ height: `${(bin.error / max) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <ChartTimes range={range} />
      </Card>
      <div className="log-layout">
        <aside className="facets">
          <div className="facet-heading">
            <h2>
              <ListFilter size={16} />
              Filters
            </h2>
            {(levels.length > 0 || services.length > 0) && (
              <button
                onClick={() => {
                  setLevels([]);
                  setServices([]);
                }}
              >
                Reset
              </button>
            )}
          </div>
          <div className="facet-group">
            <h3>Environment</h3>
            <select
              aria-label="Log environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="all">All environments</option>
            </select>
          </div>
          <div className="facet-group">
            <h3>
              Status
              <ChevronDown size={14} />
            </h3>
            {(['error', 'warn', 'info', 'debug'] as LogLevel[]).map((level) => (
              <label className="facet-option" key={level}>
                <input
                  type="checkbox"
                  checked={levels.includes(level)}
                  onChange={() => setLevels(toggle(levels, level))}
                />
                <span className={`level-dot ${level}`} />
                {level}
                <small>{number(facets.filter((log) => log.level === level).length)}</small>
              </label>
            ))}
          </div>
          <div className="facet-group">
            <h3>
              Service
              <ChevronDown size={14} />
            </h3>
            {SERVICES.map((service) => (
              <label className="facet-option" key={service}>
                <input
                  type="checkbox"
                  checked={services.includes(service)}
                  onChange={() => setServices(toggle(services, service))}
                />
                <span className="facet-service-name">{service}</span>
                <small>{number(facets.filter((log) => log.service === service).length)}</small>
              </label>
            ))}
          </div>
          <div className="facet-note">
            <CircleHelp size={15} />
            Combine facets and queries to narrow your results.
          </div>
        </aside>
        <Card className="panel logs-panel block gap-0 py-0">
          <div className="log-toolbar">
            <span>
              <strong>{number(filtered.length)}</strong> logs found
            </span>
            <div>
              <ShadcnButton
                variant="ghost"
                className="text-button"
                onClick={() => setSortNewest(!sortNewest)}
              >
                <ArrowDown size={13} />
                {sortNewest ? 'Newest first' : 'Oldest first'}
              </ShadcnButton>
              <ShadcnButton
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label="Refresh logs"
                onClick={() => {
                  setBusy(true);
                  setTimeout(() => {
                    setBusy(false);
                    notify('Logs refreshed.');
                  }, 250);
                }}
              >
                <RefreshCw size={15} className={busy ? 'spin' : ''} />
              </ShadcnButton>
            </div>
          </div>
          {filtered.length === 0 ? (
            <Empty
              title="No logs match your search"
              detail="Try a wider time range or remove a filter to see more events."
              action={<Button onClick={clear}>Clear search and filters</Button>}
            />
          ) : (
            <>
              <div className="log-table-header">
                <span>TIME (UTC)</span>
                <span>STATUS</span>
                <span>SERVICE</span>
                <span>MESSAGE</span>
              </div>
              <div
                className={`virtual-logs ${busy ? 'is-loading' : ''}`}
                ref={scrollRef}
                style={{ height: visibleHeight }}
                onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
                role="table"
                aria-label="Log events"
                aria-rowcount={filtered.length}
              >
                <div style={{ height: filtered.length * rowHeight, position: 'relative' }}>
                  {filtered.slice(start, end).map((log, i) => (
                    <button
                      className="log-row"
                      role="row"
                      aria-rowindex={start + i + 1}
                      key={log.id}
                      style={{
                        position: 'absolute',
                        top: (start + i) * rowHeight,
                        height: rowHeight,
                      }}
                      onClick={() => setSelected(log)}
                      aria-label={`${log.level} ${log.service} ${log.message}`}
                    >
                      <span role="cell" className="mono muted">
                        {time(log.timestamp)}
                      </span>
                      <span role="cell">
                        <span className={`log-level ${log.level}`}>{log.level}</span>
                      </span>
                      <span role="cell" className="log-service">
                        {log.service}
                      </span>
                      <span role="cell" className="log-message">
                        {log.message}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="log-footer">
                <span>
                  Showing {Math.min(filtered.length, Math.floor(scroll / rowHeight) + 1)}–
                  {Math.min(
                    filtered.length,
                    Math.floor(scroll / rowHeight) + Math.ceil(visibleHeight / rowHeight),
                  )}{' '}
                  of {number(filtered.length)} events
                </span>
                <span>Click an event to inspect</span>
              </div>
            </>
          )}
        </Card>
      </div>
      {selected && (
        <Dialog title="Log event" wide onClose={() => setSelected(null)}>
          <div className="dialog-body log-detail">
            <div className="detail-meta">
              <span className={`log-level ${selected.level}`}>{selected.level}</span>
              <code>{selected.id}</code>
              <span>{time(selected.timestamp)} UTC</span>
            </div>
            <h3>{selected.message}</h3>
            <dl>
              {Object.entries({
                Service: selected.service,
                Environment: selected.environment,
                Host: selected.host,
                'Trace ID': selected.traceId,
                Duration: `${selected.duration} ms`,
                Timestamp: new Date(selected.timestamp).toISOString(),
              }).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="detail-actions">
              <Button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(JSON.stringify(selected, null, 2))
                    .then(() => notify('Log JSON copied to clipboard.'))
                    .catch(() =>
                      notify('Clipboard unavailable. Select and copy the event details.'),
                    );
                }}
              >
                <Copy size={14} />
                Copy JSON
              </Button>
              <Button
                className="primary"
                onClick={() => {
                  const trace = traces.find((trace) => trace.id === selected.traceId);
                  setSelected(null);
                  if (trace) onTrace(trace);
                }}
              >
                <GitBranch size={14} />
                View trace
                <ArrowRight size={14} />
              </Button>
            </div>
            <pre>{JSON.stringify(selected, null, 2)}</pre>
          </div>
        </Dialog>
      )}
    </>
  );
}

function Traces({
  range,
  selected,
  setSelected,
}: {
  range: TimeRange;
  selected: Trace | null;
  setSelected: (trace: Trace | null) => void;
}) {
  const [query, setQuery] = useSessionState('vigil-trace-query', '');
  const [status, setStatus] = useSessionState('vigil-trace-status', 'all');
  const [sort, setSort] = useState('newest');
  const [limit, setLimit] = useState(25);
  const [span, setSpan] = useState<TraceSpan | null>(null);
  const filtered = useMemo(
    () =>
      traces
        .filter(
          (trace) =>
            trace.timestamp >= OBSERVABILITY_NOW - RANGE_MINUTES[range] * 60000 &&
            (status === 'all' || trace.status === status) &&
            `${trace.name} ${trace.id} ${trace.service}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => (sort === 'slowest' ? b.duration - a.duration : b.timestamp - a.timestamp)),
    [range, status, query, sort],
  );
  useEffect(() => setLimit(25), [range, status, query]);
  useEffect(() => setSpan(null), [selected]);
  return (
    <>
      <div className="trace-summary">
        <div>
          <GitBranch size={19} />
          <span>
            Indexed traces<strong>{number(filtered.length)}</strong>
          </span>
        </div>
        <div>
          <Clock3 size={19} />
          <span>
            Average duration
            <strong>
              {filtered.length
                ? number(filtered.reduce((sum, trace) => sum + trace.duration, 0) / filtered.length)
                : '—'}
              <small> ms</small>
            </strong>
          </span>
        </div>
        <div>
          <TriangleAlert size={19} />
          <span>
            Error traces
            <strong>{filtered.filter((trace) => trace.status === 'error').length}</strong>
          </span>
        </div>
        <div>
          <Server size={19} />
          <span>
            Connected services<strong>6</strong>
          </span>
        </div>
      </div>
      <div className="trace-filters">
        <label className="search-field">
          <Search size={16} />
          <Input
            aria-label="Search traces"
            placeholder="Search by resource, service, or trace ID…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Trace status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="ok">Healthy</option>
          <option value="error">Error</option>
        </select>
        <select
          aria-label="Sort traces"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="slowest">Slowest first</option>
        </select>
      </div>
      <Card className="panel table-scroll trace-table block gap-0 py-0">
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Service</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Spans</th>
              <th>Time (UTC)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((trace) => (
              <tr key={trace.id} onClick={() => setSelected(trace)}>
                <td>
                  <button className="trace-resource" onClick={() => setSelected(trace)}>
                    <span className={`method ${trace.name.startsWith('GET') ? 'get' : ''}`}>
                      {trace.name.split(' ')[0]}
                    </span>
                    <strong>{trace.name.split(' ')[1]}</strong>
                    <small>{trace.id}</small>
                  </button>
                </td>
                <td>
                  <span className="service-pill">{trace.service}</span>
                </td>
                <td>
                  <Status value={trace.status} />
                </td>
                <td>
                  <div className="duration-cell">
                    <span>{trace.duration} ms</span>
                    <i
                      style={{
                        width: `${Math.max(8, (trace.duration / 1900) * 95)}%`,
                        background: trace.status === 'error' ? '#c6807e' : '#8295bc',
                      }}
                    />
                  </div>
                </td>
                <td className="muted">{trace.spans.length}</td>
                <td className="mono muted">{time(trace.timestamp)}</td>
                <td>
                  <ShadcnButton
                    variant="ghost"
                    size="icon-sm"
                    className="icon-button"
                    aria-label={`Inspect ${trace.id}`}
                    onClick={() => setSelected(trace)}
                  >
                    <ChevronRight size={15} />
                  </ShadcnButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            title="No traces found"
            detail="Change your filters or select a wider time range."
            action={
              <Button
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        )}
        {filtered.length > limit && (
          <div className="load-more">
            <Button onClick={() => setLimit((value) => value + 25)}>
              Load 25 more traces
              <ChevronDown size={14} />
            </Button>
            <span>
              {limit} of {filtered.length} traces
            </span>
          </div>
        )}
      </Card>
      {selected && (
        <Dialog title="Trace details" wide onClose={() => setSelected(null)}>
          <div className="dialog-body">
            <div className="detail-meta">
              <Status value={selected.status} />
              <code>{selected.id}</code>
              <span>{time(selected.timestamp)} UTC</span>
            </div>
            <h3 className="trace-title">{selected.name}</h3>
            <div className="trace-metrics">
              <span>
                Duration<strong>{selected.duration} ms</strong>
              </span>
              <span>
                Total spans<strong>{selected.spans.length}</strong>
              </span>
              <span>
                Services<strong>{new Set(selected.spans.map((span) => span.service)).size}</strong>
              </span>
            </div>
            <div className="waterfall-heading">
              <h3>Flame graph</h3>
              <span>Click a span to inspect</span>
            </div>
            <div className="waterfall-scroll">
              <div className="waterfall-ticks">
                <span>Service / operation</span>
                <div>
                  {[0, 0.25, 0.5, 0.75, 1].map((value) => (
                    <span key={value}>{Math.round(selected.duration * value)} ms</span>
                  ))}
                </div>
              </div>
              <div className="waterfall" role="list" aria-label="Trace waterfall">
                {selected.spans.map((item) => (
                  <button
                    key={item.id}
                    className={`waterfall-row ${span?.id === item.id ? 'selected' : ''}`}
                    onClick={() => setSpan(item)}
                    aria-label={`Inspect ${item.name}, ${item.duration} milliseconds`}
                  >
                    <span
                      className="span-name"
                      style={{
                        paddingLeft:
                          item.parentId === null
                            ? 0
                            : item.parentId === selected.spans[0]?.id
                              ? 12
                              : 24,
                      }}
                    >
                      <i className={`service-color-${SERVICES.indexOf(item.service)}`} />
                      <strong>{item.name}</strong>
                      <small>{item.service}</small>
                    </span>
                    <div className="span-track">
                      <span
                        className={`span-bar service-color-${SERVICES.indexOf(item.service)} ${item.status === 'error' ? 'span-error' : ''}`}
                        style={{
                          left: `${(item.start / selected.duration) * 100}%`,
                          width: `${Math.max(1, (item.duration / selected.duration) * 100)}%`,
                        }}
                      />
                      <em
                        style={{
                          left: `${Math.min(75, ((item.start + item.duration) / selected.duration) * 100 + 1)}%`,
                        }}
                      >
                        {item.duration} ms
                      </em>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {span ? (
              <div className="span-detail">
                <h3>
                  {span.name}
                  <Status value={span.status} />
                </h3>
                <dl>
                  <div>
                    <dt>Service</dt>
                    <dd>{span.service}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{span.duration} ms</dd>
                  </div>
                  {Object.entries(span.tags).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="span-prompt">
                <Settings2 size={15} />
                Select a span to see its attributes and timing.
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}

const newMonitor = (): AlertRule => ({
  id: '',
  name: '',
  metric: 'error-rate',
  service: 'all',
  operator: 'above',
  threshold: 2,
  warningThreshold: 1,
  window: 5,
  recipients: '',
  message: '',
  enabled: true,
});
function Monitors({
  monitors,
  setMonitors,
  notify,
}: {
  monitors: AlertRule[];
  setMonitors: (value: AlertRule[] | ((old: AlertRule[]) => AlertRule[])) => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [warningEnabled, setWarningEnabled] = useState(true);
  const values = { 'error-rate': 0.42, latency: 264, throughput: 112 };
  function start(rule = newMonitor()) {
    setEditing({ ...rule });
    setWarningEnabled(rule.warningThreshold !== null);
    setErrors({});
  }
  function patch<K extends keyof AlertRule>(key: K, value: AlertRule[K]) {
    setEditing((old) => (old ? { ...old, [key]: value } : old));
    setErrors((old) => {
      const next = { ...old };
      delete next[key];
      return next;
    });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const next = {
      ...editing,
      name: editing.name.trim(),
      warningThreshold: warningEnabled ? editing.warningThreshold : null,
    };
    const validation = validateAlert(next);
    setErrors(validation);
    if (Object.keys(validation).length) {
      document.getElementById(`monitor-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const saved = {
        ...next,
        id:
          next.id ||
          `monitor-${Math.max(0, ...monitors.map((rule) => Number(rule.id.split('-').at(-1)) || 0)) + 1}`,
        operator:
          bug === 'alert-threshold'
            ? next.operator === 'above'
              ? ('below' as const)
              : ('above' as const)
            : next.operator,
      };
      setMonitors((old) =>
        next.id ? old.map((rule) => (rule.id === next.id ? saved : rule)) : [...old, saved],
      );
      setEditing(null);
      setSaving(false);
      notify(next.id ? 'Monitor updated.' : 'Monitor created. Evaluation is active.');
    }, 250);
  }
  const field = (key: string) =>
    errors[key] ? (
      <span className="field-error" id={`error-${key}`}>
        {errors[key]}
      </span>
    ) : null;
  const filtered = monitors.filter((rule) =>
    `${rule.name} ${rule.service}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (editing)
    return (
      <form onSubmit={save} noValidate>
        <div className="builder-toolbar">
          <ShadcnButton
            variant="ghost"
            type="button"
            className="text-button"
            onClick={() => setEditing(null)}
          >
            <ArrowDownLeft size={15} />
            Back to monitors
          </ShadcnButton>
          <span>{editing.id ? 'Edit monitor' : 'New metric monitor'}</span>
        </div>
        <div className="builder-layout">
          <div className="builder-sections">
            <Card className="panel builder-section block gap-0">
              <div className="step-heading">
                <span>1</span>
                <div>
                  <h2>Define your metric</h2>
                  <p>Select a metric and service scope.</p>
                </div>
              </div>
              <div className="metric-options">
                {(Object.keys(METRICS) as AlertRule['metric'][]).map((metric) => (
                  <button
                    type="button"
                    key={metric}
                    className={editing.metric === metric ? 'selected' : ''}
                    aria-pressed={editing.metric === metric}
                    onClick={() => {
                      patch('metric', metric);
                      patch(
                        'threshold',
                        metric === 'latency' ? 300 : metric === 'throughput' ? 100 : 2,
                      );
                      patch(
                        'warningThreshold',
                        metric === 'latency' ? 250 : metric === 'throughput' ? 80 : 1,
                      );
                    }}
                  >
                    {metric === 'latency' ? (
                      <Clock3 size={19} />
                    ) : metric === 'error-rate' ? (
                      <TriangleAlert size={19} />
                    ) : (
                      <Activity size={19} />
                    )}
                    <strong>{METRICS[metric].label}</strong>
                    <small>
                      {metric === 'error-rate'
                        ? 'Failed requests / total requests'
                        : metric === 'latency'
                          ? '95th percentile response time'
                          : 'Requests processed per second'}
                    </small>
                    <span className="radio-mark">{editing.metric === metric && <i />}</span>
                  </button>
                ))}
              </div>
              <label className="form-field">
                <span>Service scope</span>
                <select
                  id="monitor-service"
                  value={editing.service}
                  onChange={(event) => patch('service', event.target.value)}
                >
                  <option value="all">All services</option>
                  {SERVICES.map((service) => (
                    <option key={service}>{service}</option>
                  ))}
                </select>
                {field('service')}
              </label>
            </Card>
            <Card className="panel builder-section block gap-0">
              <div className="step-heading">
                <span>2</span>
                <div>
                  <h2>Set alert conditions</h2>
                  <p>Alert when the average value crosses your threshold.</p>
                </div>
              </div>
              <div className="condition-row">
                <label className="form-field">
                  <span>Trigger when value is</span>
                  <select
                    id="monitor-operator"
                    value={editing.operator}
                    onChange={(event) => patch('operator', event.target.value as 'above' | 'below')}
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  {field('operator')}
                </label>
                <label className="form-field">
                  <span>
                    Alert threshold <b>*</b>
                  </span>
                  <div className="input-with-unit">
                    <Input
                      id="monitor-threshold"
                      type="number"
                      step="any"
                      value={Number.isNaN(editing.threshold) ? '' : editing.threshold}
                      onChange={(event) =>
                        patch(
                          'threshold',
                          event.target.value === '' ? NaN : Number(event.target.value),
                        )
                      }
                      aria-invalid={!!errors.threshold}
                      aria-describedby={errors.threshold ? 'error-threshold' : undefined}
                    />
                    <span>{METRICS[editing.metric].unit}</span>
                  </div>
                  {field('threshold')}
                </label>
                <label className="form-field">
                  <span>For the last</span>
                  <select
                    id="monitor-window"
                    value={editing.window}
                    onChange={(event) => patch('window', Number(event.target.value))}
                  >
                    {[1, 5, 10, 15, 30, 60].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? 'minute' : 'minutes'}
                      </option>
                    ))}
                  </select>
                  {field('window')}
                </label>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={warningEnabled}
                  onChange={(event) => {
                    setWarningEnabled(event.target.checked);
                    if (event.target.checked && editing.warningThreshold === null)
                      patch(
                        'warningThreshold',
                        editing.threshold * (editing.operator === 'above' ? 0.8 : 1.2),
                      );
                  }}
                />
                Set a warning threshold
              </label>
              {warningEnabled && (
                <label className="form-field warning-field">
                  <span>Warning threshold</span>
                  <div className="input-with-unit">
                    <Input
                      id="monitor-warningThreshold"
                      type="number"
                      step="any"
                      value={
                        editing.warningThreshold === null || Number.isNaN(editing.warningThreshold)
                          ? ''
                          : editing.warningThreshold
                      }
                      onChange={(event) =>
                        patch(
                          'warningThreshold',
                          event.target.value === '' ? NaN : Number(event.target.value),
                        )
                      }
                      aria-invalid={!!errors.warningThreshold}
                      aria-describedby={
                        errors.warningThreshold ? 'error-warningThreshold' : undefined
                      }
                    />
                    <span>{METRICS[editing.metric].unit}</span>
                  </div>
                  {field('warningThreshold')}
                  <small>Notify before the alert threshold is reached.</small>
                </label>
              )}
            </Card>
            <Card className="panel builder-section block gap-0">
              <div className="step-heading">
                <span>3</span>
                <div>
                  <h2>Name and notify</h2>
                  <p>Enter a monitor name and email recipients.</p>
                </div>
              </div>
              <label className="form-field">
                <span>
                  Monitor name <b>*</b>
                </span>
                <Input
                  id="monitor-name"
                  placeholder="e.g. Checkout error rate is elevated"
                  value={editing.name}
                  onChange={(event) => patch('name', event.target.value)}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'error-name' : undefined}
                />
                {field('name')}
              </label>
              <label className="form-field">
                <span>
                  Notify <b>*</b>
                </span>
                <Input
                  id="monitor-recipients"
                  type="text"
                  placeholder="oncall@example.test, platform@example.test"
                  value={editing.recipients}
                  onChange={(event) => patch('recipients', event.target.value)}
                  aria-invalid={!!errors.recipients}
                  aria-describedby={errors.recipients ? 'error-recipients' : undefined}
                />
                {field('recipients')}
                <small>Separate email addresses with commas.</small>
              </label>
              <label className="form-field">
                <span>
                  Message <em>optional</em>
                </span>
                <Textarea
                  rows={4}
                  placeholder="What should someone check when this monitor alerts?"
                  value={editing.message}
                  onChange={(event) => patch('message', event.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(event) => patch('enabled', event.target.checked)}
                />
                Enable this monitor immediately
              </label>
            </Card>
            <div className="builder-actions">
              <Button type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" className="primary" disabled={saving}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                {editing.id ? 'Save changes' : 'Create monitor'}
              </Button>
            </div>
          </div>
          <Card className="builder-preview panel block gap-0 py-0">
            <div className="panel-heading">
              <h2>
                <Activity size={16} />
                Monitor preview
              </h2>
            </div>
            <div className="preview-body">
              <span className="preview-label">CURRENT VALUE</span>
              <div className="preview-value">
                {values[editing.metric]}
                <span>{METRICS[editing.metric].unit}</span>
              </div>
              <Chart
                values={metricSeries(
                  '1h',
                  0,
                  editing.metric === 'latency'
                    ? 'latency'
                    : editing.metric === 'error-rate'
                      ? 'errors'
                      : 'requests',
                )}
                color="#8295bc"
                label="Selected metric preview"
                height={130}
              />
              <div className="threshold-key">
                <i />
                Alert: {editing.operator}{' '}
                {Number.isNaN(editing.threshold) ? '—' : editing.threshold}{' '}
                {METRICS[editing.metric].unit}
              </div>
              <div className="preview-summary">
                <h3>Evaluation</h3>
                <p>
                  Watch <strong>{METRICS[editing.metric].label.toLowerCase()}</strong> for{' '}
                  <strong>{editing.service === 'all' ? 'all services' : editing.service}</strong>.
                  Trigger when the {editing.window}-minute average is{' '}
                  <strong>
                    {editing.operator} {Number.isNaN(editing.threshold) ? '—' : editing.threshold}{' '}
                    {METRICS[editing.metric].unit}
                  </strong>
                  .
                </p>
              </div>
            </div>
          </Card>
        </div>
      </form>
    );
  return (
    <>
      <div className="monitor-stats">
        <div>
          <span className="status-dot green" />
          <strong>
            {monitors.filter((rule) => evaluateAlert(rule, values[rule.metric]) === 'ok').length}
          </strong>
          <span>Healthy</span>
        </div>
        <div>
          <span className="status-dot amber" />
          <strong>
            {
              monitors.filter((rule) => evaluateAlert(rule, values[rule.metric]) === 'warning')
                .length
            }
          </strong>
          <span>Warning</span>
        </div>
        <div>
          <span className="status-dot red" />
          <strong>
            {monitors.filter((rule) => evaluateAlert(rule, values[rule.metric]) === 'alert').length}
          </strong>
          <span>Alerting</span>
        </div>
        <div>
          <span className="status-dot gray" />
          <strong>{monitors.filter((rule) => !rule.enabled).length}</strong>
          <span>Paused</span>
        </div>
      </div>
      <div className="monitor-toolbar">
        <label className="search-field">
          <Search size={16} />
          <Input
            placeholder="Search monitors…"
            aria-label="Search monitors"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button className="primary" onClick={() => start()}>
          <Plus size={16} />
          New monitor
        </Button>
      </div>
      <Card className="panel table-scroll monitors-table block gap-0 py-0">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Monitor name</th>
              <th>Scope</th>
              <th>Condition</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <Status value={evaluateAlert(rule, values[rule.metric])} />
                </td>
                <td>
                  <button className="monitor-name" onClick={() => start(rule)}>
                    {rule.name}
                    <small>
                      {METRICS[rule.metric].label} · Evaluated over {rule.window} min
                    </small>
                  </button>
                </td>
                <td>
                  <span className="service-pill">
                    {rule.service === 'all' ? 'All services' : rule.service}
                  </span>
                </td>
                <td className="mono">
                  {rule.operator === 'above' ? '>' : '<'} {rule.threshold}{' '}
                  {METRICS[rule.metric].unit}
                </td>
                <td>
                  <div className="row-actions">
                    <ShadcnButton
                      variant="ghost"
                      size="icon-sm"
                      className="icon-button"
                      aria-label={`${rule.enabled ? 'Pause' : 'Resume'} ${rule.name}`}
                      onClick={() => {
                        setMonitors((old) =>
                          old.map((item) =>
                            item.id === rule.id ? { ...item, enabled: !item.enabled } : item,
                          ),
                        );
                        notify(rule.enabled ? 'Monitor paused.' : 'Monitor resumed.');
                      }}
                    >
                      {rule.enabled ? <Pause size={15} /> : <Play size={15} />}
                    </ShadcnButton>
                    <ShadcnButton
                      variant="ghost"
                      size="icon-sm"
                      className="icon-button"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => start(rule)}
                    >
                      <Settings2 size={15} />
                    </ShadcnButton>
                    <ShadcnButton
                      variant="ghost"
                      className="icon-button danger-icon"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleteId(rule.id)}
                    >
                      <Trash2 size={15} />
                    </ShadcnButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <Empty
            title={search ? 'No matching monitors' : 'Create your first monitor'}
            detail={
              search
                ? 'Try another name or service.'
                : 'Watch a metric and define when your team should be notified.'
            }
            action={
              <Button onClick={() => (search ? setSearch('') : start())}>
                {search ? 'Clear search' : 'New monitor'}
              </Button>
            }
          />
        )}
      </Card>
      {deleteId && (
        <Dialog title="Delete monitor?" onClose={() => setDeleteId(null)}>
          <div className="dialog-body">
            <p>“{monitors.find((rule) => rule.id === deleteId)?.name}” will be deleted.</p>
            <div className="dialog-actions">
              <Button onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button
                className="danger"
                onClick={() => {
                  setMonitors((old) => old.filter((rule) => rule.id !== deleteId));
                  setDeleteId(null);
                  notify('Monitor deleted.');
                }}
              >
                Delete monitor
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
