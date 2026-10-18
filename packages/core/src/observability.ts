export const SERVICES = [
  'api-gateway',
  'checkout',
  'payment-worker',
  'inventory',
  'notifications',
  'auth-service',
] as const;
export type Service = (typeof SERVICES)[number];
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type TimeRange = '15m' | '1h' | '4h' | '24h';
export const OBSERVABILITY_NOW = Date.UTC(2026, 9, 18, 14, 30);
export const RANGE_MINUTES: Record<TimeRange, number> = {
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '24h': 1440,
};
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  service: Service;
  environment: 'production' | 'staging';
  host: string;
  message: string;
  traceId: string;
  duration: number;
}
export interface TraceSpan {
  id: string;
  parentId: string | null;
  name: string;
  service: Service;
  start: number;
  duration: number;
  status: 'ok' | 'error';
  tags: Record<string, string>;
}
export interface Trace {
  id: string;
  timestamp: number;
  name: string;
  service: Service;
  duration: number;
  status: 'ok' | 'error';
  spans: TraceSpan[];
}
export interface LogFilters {
  levels?: LogLevel[];
  services?: string[];
  environment?: string;
  range?: TimeRange;
  now?: number;
}
export interface LogToken {
  field: string | null;
  value: string;
  exclude: boolean;
}
export interface AlertRule {
  id: string;
  name: string;
  metric: 'error-rate' | 'latency' | 'throughput';
  service: string;
  operator: 'above' | 'below';
  threshold: number;
  warningThreshold: number | null;
  window: number;
  recipients: string;
  message: string;
  enabled: boolean;
}
export const METRICS = {
  'error-rate': { label: 'Error rate', unit: '%', max: 100 },
  latency: { label: 'P95 latency', unit: 'ms', max: 60000 },
  throughput: { label: 'Request throughput', unit: 'req/s', max: 100000 },
};

function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
const messages: Record<LogLevel, string[]> = {
  info: [
    'Request completed successfully',
    'Order confirmed and queued for fulfillment',
    'Cache refreshed for product catalog',
    'Connected to primary database',
    'Background job completed',
    'Session token validated',
  ],
  warn: [
    'Upstream response exceeded latency budget',
    'Connection pool approaching capacity',
    'Rate limit threshold approaching',
    'Retry scheduled after transient failure',
  ],
  error: [
    'Payment provider request timed out',
    'Database connection acquisition failed',
    'Upstream returned 503 Service Unavailable',
    'Request failed: inventory reservation expired',
  ],
  debug: ['Cache lookup completed', 'Request middleware processed', 'Job payload deserialized'],
};
export function seededLogs(count = 6000): LogEntry[] {
  const random = randomSource(92814);
  return Array.from({ length: count }, (_, i) => {
    const sample = random();
    const level: LogLevel =
      sample < 0.07 ? 'error' : sample < 0.22 ? 'warn' : sample < 0.31 ? 'debug' : 'info';
    const service = SERVICES[Math.floor(random() * SERVICES.length)]!;
    return {
      id: `log-${String(i + 1).padStart(6, '0')}`,
      timestamp: OBSERVABILITY_NOW - i * 14000,
      level,
      service,
      environment: random() > 0.13 ? 'production' : 'staging',
      host: `ip-10-0-${Math.floor(random() * 4) + 1}-${Math.floor(random() * 90) + 10}`,
      message: messages[level][Math.floor(random() * messages[level].length)]!,
      traceId: `trace-${String((i % 240) + 1).padStart(4, '0')}`,
      duration: Math.round(28 + random() * (level === 'error' ? 1700 : 290)),
    };
  });
}

/** Search grammar: field:value, quoted phrases, free text, and -term negation. */
export function parseLogQuery(query: string): LogToken[] {
  const fields = ['service', 'status', 'level', 'env', 'host', 'trace'];
  const tokens: LogToken[] = [];
  const parts = query.match(/(?:[^\s"]|"[^"]*")+/g) ?? [];
  if ((query.match(/"/g)?.length ?? 0) % 2 !== 0)
    throw new Error('Close the quotation mark to complete your search.');
  for (const part of parts) {
    const exclude = part.startsWith('-');
    const normalized = exclude ? part.slice(1) : part;
    const colon = normalized.indexOf(':');
    const field = colon >= 0 ? normalized.slice(0, colon) : null;
    const value = (colon >= 0 ? normalized.slice(colon + 1) : normalized)
      .replace(/^"|"$/g, '')
      .toLowerCase();
    if (field && !fields.includes(field))
      throw new Error(`Unknown field “${field}”. Use service, status, env, host, or trace.`);
    if (!value) throw new Error(`Enter a value${field ? ` after ${field}:` : ' to search'}.`);
    if (
      (field === 'status' || field === 'level') &&
      !['info', 'warn', 'error', 'debug', '*'].includes(value)
    )
      throw new Error('Status must be info, warn, error, or debug.');
    tokens.push({ field, value, exclude });
  }
  return tokens;
}
export function filterLogs(
  logs: LogEntry[],
  query = '',
  filters: LogFilters = {},
  ignoreStatus = false,
): LogEntry[] {
  const tokens = parseLogQuery(query);
  const earliest = filters.range
    ? (filters.now ?? OBSERVABILITY_NOW) - RANGE_MINUTES[filters.range] * 60000
    : -Infinity;
  return logs.filter((log) => {
    if (log.timestamp < earliest) return false;
    if (filters.levels?.length && !filters.levels.includes(log.level) && !ignoreStatus)
      return false;
    if (filters.services?.length && !filters.services.includes(log.service)) return false;
    if (
      filters.environment &&
      filters.environment !== 'all' &&
      log.environment !== filters.environment
    )
      return false;
    return tokens.every((token) => {
      if (ignoreStatus && (token.field === 'status' || token.field === 'level')) return true;
      const values: Record<string, string> = {
        service: log.service,
        status: log.level,
        level: log.level,
        env: log.environment,
        host: log.host,
        trace: log.traceId,
      };
      const haystack = token.field
        ? values[token.field]!
        : `${log.message} ${log.service} ${log.host} ${log.traceId}`;
      const escaped = token.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
      const matches = token.field
        ? new RegExp(`^${escaped}$`, 'i').test(haystack)
        : haystack.toLowerCase().includes(token.value);
      return token.exclude ? !matches : matches;
    });
  });
}
export function metricSeries(
  range: TimeRange,
  tick = 0,
  metric: 'requests' | 'latency' | 'errors' | 'cpu' = 'requests',
): number[] {
  const metricSeed = { requests: 17, latency: 45, errors: 81, cpu: 120 }[metric];
  const random = randomSource(metricSeed + RANGE_MINUTES[range]);
  return Array.from({ length: 60 }, (_, i) => {
    const wave = Math.sin((i + tick) / 6) * 0.2 + Math.sin((i + tick) / 2) * 0.08;
    const base = { requests: 1240, latency: 186, errors: 0.42, cpu: 42 }[metric];
    const spike = i > 34 && i < 40 ? (metric === 'errors' ? 1.8 : 0.35) : 0;
    return Math.max(0, base * (1 + wave + random() * 0.22 + spike));
  });
}
export function seededTraces(count = 240): Trace[] {
  const random = randomSource(55129);
  return Array.from({ length: count }, (_, i) => {
    const status = i % 13 === 0 ? 'error' : 'ok';
    const duration = Math.round(112 + random() * (status === 'error' ? 1700 : 650));
    const root = `span-${i}-0`;
    const span = (
      index: number,
      parentId: string | null,
      name: string,
      service: Service,
      start: number,
      length: number,
    ): TraceSpan => ({
      id: `span-${i}-${index}`,
      parentId,
      name,
      service,
      start: Math.round(start),
      duration: Math.round(length),
      status: status === 'error' && index === 4 ? 'error' : 'ok',
      tags: {
        'http.method': 'POST',
        'http.status_code': status === 'error' && index === 4 ? '503' : '200',
        'deployment.environment': 'production',
        'service.version': '2.14.0',
      },
    });
    return {
      id: `trace-${String(i + 1).padStart(4, '0')}`,
      timestamp: OBSERVABILITY_NOW - i * 180000,
      name:
        i % 3 === 0 ? 'POST /api/checkout' : i % 3 === 1 ? 'GET /api/products' : 'POST /api/orders',
      service: 'api-gateway',
      duration,
      status,
      spans: [
        span(0, null, 'http.request', 'api-gateway', 0, duration),
        span(1, root, 'authenticate', 'auth-service', 4, duration * 0.09),
        span(2, root, 'checkout.create', 'checkout', duration * 0.12, duration * 0.85),
        span(3, `span-${i}-2`, 'inventory.reserve', 'inventory', duration * 0.16, duration * 0.23),
        span(
          4,
          `span-${i}-2`,
          'payment.authorize',
          'payment-worker',
          duration * 0.41,
          duration * 0.42,
        ),
        span(
          5,
          `span-${i}-2`,
          'order.confirmation',
          'notifications',
          duration * 0.87,
          duration * 0.08,
        ),
      ],
    };
  });
}
export function validateAlert(rule: Omit<AlertRule, 'id'> | AlertRule): Record<string, string> {
  const errors: Record<string, string> = {};
  if (rule.name.trim().length < 3) errors.name = 'Enter a monitor name with at least 3 characters.';
  if (rule.name.length > 100) errors.name = 'Keep the monitor name under 100 characters.';
  if (!Object.prototype.hasOwnProperty.call(METRICS, rule.metric))
    errors.metric = 'Choose a valid metric.';
  if (!['all', ...SERVICES].includes(rule.service)) errors.service = 'Choose a valid service.';
  if (!['above', 'below'].includes(rule.operator)) errors.operator = 'Choose above or below.';
  const limit = METRICS[rule.metric]?.max ?? Infinity;
  if (!Number.isFinite(rule.threshold) || rule.threshold <= 0 || rule.threshold > limit)
    errors.threshold = `Enter a threshold greater than 0 and at most ${limit.toLocaleString()}.`;
  if (
    rule.warningThreshold !== null &&
    (!Number.isFinite(rule.warningThreshold) ||
      rule.warningThreshold < 0 ||
      rule.warningThreshold > limit)
  )
    errors.warningThreshold = 'Enter a valid warning threshold.';
  else if (
    rule.warningThreshold !== null &&
    (rule.operator === 'above'
      ? rule.warningThreshold >= rule.threshold
      : rule.warningThreshold <= rule.threshold)
  )
    errors.warningThreshold = `Warning must be ${rule.operator === 'above' ? 'below' : 'above'} the alert threshold.`;
  if (![1, 5, 10, 15, 30, 60].includes(rule.window))
    errors.window = 'Choose a supported evaluation window.';
  const recipients = rule.recipients.split(',').map((value) => value.trim());
  if (!recipients.length || recipients.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    errors.recipients = 'Enter email addresses separated by commas.';
  return errors;
}
export function evaluateAlert(
  rule: AlertRule,
  value: number,
): 'ok' | 'warning' | 'alert' | 'paused' {
  if (!rule.enabled) return 'paused';
  const matches = (threshold: number) =>
    rule.operator === 'above' ? value > threshold : value < threshold;
  if (matches(rule.threshold)) return 'alert';
  if (rule.warningThreshold !== null && matches(rule.warningThreshold)) return 'warning';
  return 'ok';
}
export const DEFAULT_MONITORS: AlertRule[] = [
  {
    id: 'monitor-1',
    name: 'Checkout error rate is elevated',
    metric: 'error-rate',
    service: 'checkout',
    operator: 'above',
    threshold: 2,
    warningThreshold: 1,
    window: 5,
    recipients: 'oncall@example.test',
    message: 'Check recent deployments and payment provider health.',
    enabled: true,
  },
  {
    id: 'monitor-2',
    name: 'API response time exceeds budget',
    metric: 'latency',
    service: 'api-gateway',
    operator: 'above',
    threshold: 300,
    warningThreshold: 250,
    window: 10,
    recipients: 'platform@example.test',
    message: 'Review the slowest traces before escalating.',
    enabled: true,
  },
  {
    id: 'monitor-3',
    name: 'Payment throughput dropped',
    metric: 'throughput',
    service: 'payment-worker',
    operator: 'below',
    threshold: 20,
    warningThreshold: 40,
    window: 5,
    recipients: 'payments@example.test',
    message: '',
    enabled: true,
  },
];
