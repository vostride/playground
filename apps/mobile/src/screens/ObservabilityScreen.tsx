import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { PlaygroundNotice, SafeModalArea, useSessionState, type MobileScreenProps } from '../ui';

type Page = 'overview' | 'logs' | 'traces' | 'monitors';
const pages: { key: Page; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'logs', label: 'Log explorer' },
  { key: 'traces', label: 'Traces' },
  { key: 'monitors', label: 'Monitors' },
];
const logs = seededLogs();
const traces = seededTraces();
const labels: Record<TimeRange, string> = {
  '15m': 'Past 15 minutes',
  '1h': 'Past 1 hour',
  '4h': 'Past 4 hours',
  '24h': 'Past 24 hours',
};
const metricValues = { 'error-rate': 0.42, latency: 264, throughput: 112 };
const formatTime = (timestamp: number) => new Date(timestamp).toISOString().slice(11, 19);
const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { maximumFractionDigits: digits });
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

function Action({
  label,
  onPress,
  primary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        primary && s.actionPrimary,
        danger && s.actionDanger,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[s.actionText, (primary || danger) && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}
function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.panel, style]}>{children}</View>;
}
function Badge({ value }: { value: string }) {
  const color =
    value === 'ok' || value === 'info'
      ? '#527d6d'
      : value === 'warn' || value === 'warning'
        ? '#ac833c'
        : value === 'error' || value === 'alert'
          ? '#b76c71'
          : '#8793a4';
  return (
    <View style={[s.badge, { backgroundColor: `${color}12`, borderColor: `${color}28` }]}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 10, color, fontWeight: '500' }}>
        {value === 'ok' ? 'Healthy' : value.charAt(0).toUpperCase() + value.slice(1)}
      </Text>
    </View>
  );
}
function Title({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      {detail && <Text style={s.description}>{detail}</Text>}
    </View>
  );
}
function Empty({ title, detail, clear }: { title: string; detail: string; clear?: () => void }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={[s.description, { textAlign: 'center' }]}>{detail}</Text>
      {clear && <Action label="Clear filters" onPress={clear} />}
    </View>
  );
}
function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        testID={`vigil-field-${label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#a2acba"
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        autoCapitalize="none"
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: 'top' },
          !!error && { borderColor: '#bd777d' },
        ]}
      />
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeModalArea style={{ backgroundColor: '#f7f8fa' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <PlaygroundNotice />
          <View style={s.sheetHeader}>
            <Text accessibilityRole="header" style={s.sheetTitle}>
              {title}
            </Text>
            <Action label="Close" onPress={onClose} />
          </View>
          {children}
        </KeyboardAvoidingView>
      </SafeModalArea>
    </Modal>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`}
        onPress={() => setOpen(true)}
        style={s.select}
      >
        <Text style={s.selectText}>
          {options.find((option) => option.value === value)?.label ?? value}
        </Text>
        <Text style={{ color: '#a3adba' }}>⌄</Text>
      </Pressable>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <ScrollView contentContainerStyle={s.sheetContent}>
            {options.map((option) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: option.value === value }}
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[s.option, option.value === value && s.optionSelected]}
              >
                <Text style={s.optionText}>{option.label}</Text>
                <Text style={{ color: '#b58b4e' }}>{option.value === value ? '✓' : ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Sheet>
      )}
    </View>
  );
}
function MetricChart({
  values,
  color = '#c69a56',
  label,
  height = 130,
}: {
  values: number[];
  color?: string;
  label: string;
  height?: number;
}) {
  const [width, setWidth] = useState(300);
  const max = Math.max(...values) * 1.15;
  const points = values.map((value, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - (value / max) * (height - 10),
  }));
  return (
    <View
      accessible
      accessibilityLabel={`${label}: minimum ${formatNumber(Math.min(...values), 2)}, maximum ${formatNumber(Math.max(...values), 2)}`}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height, overflow: 'hidden', marginVertical: 12 }}
    >
      {[0.25, 0.5, 0.75, 1].map((value) => (
        <View
          key={value}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: height * value - 1,
            height: 1,
            backgroundColor: '#edf0f5',
          }}
        />
      ))}
      {points.slice(0, -1).map((point, index) => {
        const next = points[index + 1]!;
        const length = Math.sqrt((next.x - point.x) ** 2 + (next.y - point.y) ** 2);
        const angle = Math.atan2(next.y - point.y, next.x - point.x);
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: (point.x + next.x) / 2 - length / 2,
              top: (point.y + next.y) / 2,
              width: length + 1,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      })}
    </View>
  );
}

export default function ObservabilityScreen({ route, bug, navigate }: MobileScreenProps) {
  const page: Page = pages.some((page) => page.key === route) ? (route as Page) : 'overview';
  const [range, setRange] = useSessionState<TimeRange>('vigil-range', '1h');
  const [environment, setEnvironment] = useSessionState('vigil-environment', 'production');
  const [, setLogQuery] = useSessionState('vigil-query', '');
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [monitors, setMonitors] = useSessionState<AlertRule[]>('vigil-monitors', DEFAULT_MONITORS);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setTick((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, [live]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function refresh() {
    setRefreshing(true);
    setTimeout(() => {
      setTick((value) => value + 1);
      setRefreshing(false);
      setNotice('Telemetry refreshed.');
    }, 450);
  }
  return (
    <View style={s.root}>
      <View style={s.brandRow}>
        <View>
          <Text style={s.brand}>
            vigil<Text style={{ color: '#d1a35f' }}>.</Text>
          </Text>
          <Text style={s.workspace}>ACME ENGINEERING</Text>
        </View>
        <View style={s.region}>
          <View style={s.liveDot} />
          <Text style={s.regionText}>US East</Text>
        </View>
      </View>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
        >
          {pages.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: page === item.key }}
              onPress={() => navigate('observability', item.key)}
              style={[s.tab, page === item.key && s.tabActive]}
            >
              <Text style={[s.tabText, page === item.key && s.tabTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {page !== 'monitors' && (
        <View style={s.rangeRow}>
          <View style={{ flex: 1 }}>
            <Select
              label="Time range"
              value={range}
              options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
              onChange={(value) => setRange(value as TimeRange)}
            />
          </View>
          <View style={s.liveControl}>
            <Text style={s.label}>{live ? 'Live' : 'Paused'}</Text>
            <Switch
              accessibilityLabel="Live updates"
              value={live}
              onValueChange={setLive}
              trackColor={{ false: '#d9dfe7', true: '#9fb9ad' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}
      {loading ? (
        <View style={s.empty}>
          <ActivityIndicator color="#b58a49" />
          <Text style={s.description}>Loading workspace telemetry…</Text>
        </View>
      ) : page === 'overview' ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#b28b51" />
          }
          contentContainerStyle={s.content}
        >
          <Title
            title="Production overview"
            detail="A clear view of application health, from requests to resources."
          />
          <Select
            label="Environment"
            value={environment}
            options={[
              { value: 'production', label: 'production' },
              { value: 'staging', label: 'staging' },
              { value: 'all', label: 'All environments' },
            ]}
            onChange={setEnvironment}
          />
          <MobileOverview
            range={range}
            tick={tick}
            environment={environment}
            onLogs={(service) => {
              setLogQuery(`service:${service}`);
              navigate('observability', 'logs');
            }}
          />
        </ScrollView>
      ) : page === 'logs' ? (
        <MobileLogs
          range={range}
          environment={environment}
          setEnvironment={setEnvironment}
          bug={bug}
          refresh={refresh}
          refreshing={refreshing}
          onTrace={(trace) => {
            setSelectedTrace(trace);
            navigate('observability', 'traces');
          }}
        />
      ) : page === 'traces' ? (
        <MobileTraces
          range={range}
          selected={selectedTrace}
          setSelected={setSelectedTrace}
          refreshing={refreshing}
          refresh={refresh}
        />
      ) : (
        <MobileMonitors
          monitors={monitors}
          setMonitors={setMonitors}
          bug={bug}
          notify={setNotice}
        />
      )}
      {notice ? (
        <View accessibilityRole="alert" style={s.notice}>
          <Text style={s.noticeText}>{notice}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={() => setNotice('')}
            hitSlop={10}
          >
            <Text style={s.noticeText}>✕</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function MobileOverview({
  range,
  tick,
  environment,
  onLogs,
}: {
  range: TimeRange;
  tick: number;
  environment: string;
  onLogs: (service: string) => void;
}) {
  const series = useMemo(
    () => ({
      requests: metricSeries(range, tick, 'requests'),
      latency: metricSeries(range, tick, 'latency'),
      errors: metricSeries(range, tick, 'errors'),
    }),
    [range, tick],
  );
  const scale = environment === 'staging' ? 0.18 : environment === 'all' ? 1.18 : 1;
  const requests = series.requests.map((value) => value * scale);
  return (
    <>
      <View style={s.metricGrid}>
        {[
          {
            label: 'Request rate',
            value: formatNumber(requests[requests.length - 1] ?? 0),
            unit: 'req/s',
            change: '+12.8%',
          },
          {
            label: 'P95 latency',
            value: formatNumber(series.latency[series.latency.length - 1] ?? 0),
            unit: 'ms',
            change: '−8.2%',
          },
          {
            label: 'Error rate',
            value: formatNumber(series.errors[series.errors.length - 1] ?? 0, 2),
            unit: '%',
            change: '−0.12%',
          },
          { label: 'Active services', value: '6', unit: '/ 6', change: 'All reporting' },
        ].map((metric) => (
          <Panel key={metric.label} style={s.metricCard}>
            <Text style={s.smallLabel}>{metric.label}</Text>
            <Text style={s.metricValue}>
              {metric.value}
              <Text style={s.metricUnit}> {metric.unit}</Text>
            </Text>
            <Text style={s.metricChange}>{metric.change}</Text>
          </Panel>
        ))}
      </View>
      <Panel>
        <Text style={s.panelTitle}>Request volume</Text>
        <Text style={s.smallLabel}>Traffic across all services · requests / second</Text>
        <MetricChart values={requests} label="Request volume" />
        <View style={s.chartTimes}>
          <Text style={s.time}>
            {formatTime(OBSERVABILITY_NOW - RANGE_MINUTES[range] * 60000).slice(0, 5)}
          </Text>
          <Text style={s.time}>14:30 UTC</Text>
        </View>
      </Panel>
      <Panel>
        <Text style={s.panelTitle}>Response time</Text>
        <Text style={s.smallLabel}>95th percentile latency · milliseconds</Text>
        <MetricChart values={series.latency} color="#7d91b7" label="P95 latency" />
        <Text style={s.healthy}>Within 300 ms latency budget</Text>
      </Panel>
      <Text accessibilityRole="header" style={s.sectionTitle}>
        Service health
      </Text>
      <Panel>
        {SERVICES.map((service, index) => (
          <Pressable
            key={service}
            accessibilityRole="button"
            accessibilityLabel={`View ${service} logs`}
            onPress={() => onLogs(service)}
            style={[s.serviceRow, index === SERVICES.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={s.serviceName}>{service}</Text>
              <Text style={s.smallLabel}>
                {formatNumber([482, 284, 112, 226, 94, 312][index]! * scale)} req/s ·{' '}
                {[86, 142, 284, 64, 42, 38][index]} ms
              </Text>
            </View>
            <Badge value={index === 2 ? 'warning' : 'ok'} />
            <Text style={s.chevron}>›</Text>
          </Pressable>
        ))}
      </Panel>
      <Text style={s.footnote}>Simulated telemetry · October 18, 2026 · UTC</Text>
    </>
  );
}

function MobileLogs({
  range,
  environment,
  setEnvironment,
  bug,
  refresh,
  refreshing,
  onTrace,
}: {
  range: TimeRange;
  environment: string;
  setEnvironment: (value: string) => void;
  bug: string;
  refresh: () => void;
  refreshing: boolean;
  onTrace: (trace: Trace) => void;
}) {
  const [query, setQuery] = useSessionState('vigil-query', '');
  const [draft, setDraft] = useState(query);
  const [levels, setLevels] = useSessionState<LogLevel[]>('vigil-log-levels', []);
  const [services, setServices] = useSessionState<string[]>('vigil-log-services', []);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [newest, setNewest] = useState(true);
  const filtered = useMemo(() => {
    try {
      const result = filterLogs(
        logs,
        query,
        { range, environment, levels, services },
        bug === 'log-filter',
      );
      return newest ? result : [...result].reverse();
    } catch {
      return [];
    }
  }, [range, query, environment, levels, services, bug, newest]);
  function search() {
    try {
      filterLogs(logs, draft);
      setError('');
      setQuery(draft);
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
  const toggle = <T,>(array: T[], item: T) =>
    array.includes(item) ? array.filter((value) => value !== item) : [...array, item];
  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(log) => log.id}
        initialNumToRender={18}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshing={refreshing}
        onRefresh={refresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title title="Log explorer" detail="Search events across your services." />
            <Field
              label="Log search query"
              value={draft}
              onChange={setDraft}
              placeholder="service:checkout status:error"
              error={error}
            />
            <View style={s.row}>
              <Action label="Search" onPress={search} primary />
              <Action
                label={`Filters${levels.length + services.length ? ` (${levels.length + services.length})` : ''}`}
                onPress={() => setFilters(true)}
              />
              <Action
                label={newest ? 'Newest first' : 'Oldest first'}
                onPress={() => setNewest(!newest)}
              />
            </View>
            <Text style={s.smallLabel}>
              Try status:error, service:checkout, or "payment provider".
            </Text>
            <View style={s.resultCount}>
              <Text style={s.resultCountText}>{formatNumber(filtered.length)} logs found</Text>
              <Text style={s.smallLabel}>{environment} · UTC</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.level} ${item.service} ${item.message}`}
            onPress={() => setSelected(item)}
            style={s.logRow}
          >
            <View style={s.logMeta}>
              <Badge value={item.level} />
              <Text style={s.logService}>{item.service}</Text>
              <Text style={s.time}>{formatTime(item.timestamp)}</Text>
            </View>
            <Text numberOfLines={2} style={s.logMessage}>
              {item.message}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Empty
            title="No logs match your search"
            detail="Try a wider time range or remove a filter."
            clear={clear}
          />
        }
        ListFooterComponent={
          <Text style={s.footnote}>6,000 seeded events · Scroll to explore</Text>
        }
      />
      {filters && (
        <Sheet title="Log filters" onClose={() => setFilters(false)}>
          <ScrollView contentContainerStyle={s.sheetContent}>
            <Select
              label="Environment"
              value={environment}
              options={[
                { value: 'production', label: 'production' },
                { value: 'staging', label: 'staging' },
                { value: 'all', label: 'All environments' },
              ]}
              onChange={setEnvironment}
            />
            <Text style={s.sectionTitle}>Status</Text>
            {(['error', 'warn', 'info', 'debug'] as LogLevel[]).map((level) => (
              <View style={s.switchRow} key={level}>
                <Badge value={level} />
                <Switch
                  accessibilityLabel={`Filter ${level} logs`}
                  value={levels.includes(level)}
                  onValueChange={() => setLevels(toggle(levels, level))}
                  trackColor={{ true: '#b69a72', false: '#dce1e8' }}
                />
              </View>
            ))}
            <Text style={s.sectionTitle}>Service</Text>
            {SERVICES.map((service) => (
              <View key={service} style={s.switchRow}>
                <Text style={s.serviceName}>{service}</Text>
                <Switch
                  accessibilityLabel={`Filter ${service} logs`}
                  value={services.includes(service)}
                  onValueChange={() => setServices(toggle(services, service))}
                  trackColor={{ true: '#b69a72', false: '#dce1e8' }}
                />
              </View>
            ))}
            <Action label="Apply filters" primary onPress={() => setFilters(false)} />
            <Action
              label="Reset filters"
              onPress={() => {
                setLevels([]);
                setServices([]);
              }}
            />
          </ScrollView>
        </Sheet>
      )}
      {selected && (
        <Sheet title="Log event" onClose={() => setSelected(null)}>
          <ScrollView contentContainerStyle={s.sheetContent}>
            <View style={s.row}>
              <Badge value={selected.level} />
              <Text style={s.time}>{selected.id}</Text>
            </View>
            <Title title={selected.message} />
            <Panel>
              {Object.entries({
                Service: selected.service,
                Environment: selected.environment,
                Host: selected.host,
                'Trace ID': selected.traceId,
                Duration: `${selected.duration} ms`,
                Timestamp: new Date(selected.timestamp).toISOString(),
              }).map(([key, value]) => (
                <View key={key} style={s.detailRow}>
                  <Text style={s.smallLabel}>{key}</Text>
                  <Text selectable style={s.detailValue}>
                    {value}
                  </Text>
                </View>
              ))}
            </Panel>
            <Action
              label="View trace"
              primary
              onPress={() => {
                const trace = traces.find((trace) => trace.id === selected.traceId);
                setSelected(null);
                if (trace) onTrace(trace);
              }}
            />
            <Panel>
              <Text selectable style={s.json}>
                {JSON.stringify(selected, null, 2)}
              </Text>
            </Panel>
          </ScrollView>
        </Sheet>
      )}
    </>
  );
}

function MobileTraces({
  range,
  selected,
  setSelected,
  refreshing,
  refresh,
}: {
  range: TimeRange;
  selected: Trace | null;
  setSelected: (trace: Trace | null) => void;
  refreshing: boolean;
  refresh: () => void;
}) {
  const [query, setQuery] = useSessionState('vigil-trace-query', '');
  const [status, setStatus] = useSessionState('vigil-trace-status', 'all');
  const [sort, setSort] = useState('newest');
  const [span, setSpan] = useState<TraceSpan | null>(null);
  const filtered = useMemo(
    () =>
      traces
        .filter(
          (trace) =>
            trace.timestamp >= OBSERVABILITY_NOW - RANGE_MINUTES[range] * 60000 &&
            (status === 'all' || trace.status === status) &&
            `${trace.name} ${trace.service} ${trace.id}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => (sort === 'slowest' ? b.duration - a.duration : b.timestamp - a.timestamp)),
    [range, status, query, sort],
  );
  useEffect(() => setSpan(null), [selected]);
  const palette = ['#8296bb', '#8eae9e', '#c5a263', '#a293b5', '#bc95a3', '#86a8ba'];
  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(trace) => trace.id}
        initialNumToRender={15}
        refreshing={refreshing}
        onRefresh={refresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title title="Distributed traces" detail="Follow every request across your services." />
            <Field
              label="Search traces"
              value={query}
              onChange={setQuery}
              placeholder="Resource, service, or trace ID"
            />
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Select
                  label="Trace status"
                  value={status}
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'ok', label: 'Healthy' },
                    { value: 'error', label: 'Error' },
                  ]}
                  onChange={setStatus}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Select
                  label="Sort traces"
                  value={sort}
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'slowest', label: 'Slowest first' },
                  ]}
                  onChange={setSort}
                />
              </View>
            </View>
            <Text style={s.resultCountText}>
              {filtered.length} indexed traces ·{' '}
              {filtered.filter((trace) => trace.status === 'error').length} errors
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Inspect ${item.id}, ${item.name}, ${item.duration} milliseconds`}
            onPress={() => setSelected(item)}
            style={s.traceRow}
          >
            <View style={s.logMeta}>
              <Text style={s.traceResource}>{item.name}</Text>
              <Text style={s.duration}>{item.duration} ms</Text>
            </View>
            <View style={s.logMeta}>
              <Text style={s.logService}>
                {item.id} · {item.spans.length} spans
              </Text>
              <Badge value={item.status} />
            </View>
            <Text style={s.time}>
              {formatTime(item.timestamp)} UTC · {item.service}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Empty
            title="No traces found"
            detail="Change your filters or use a wider time range."
            clear={() => {
              setQuery('');
              setStatus('all');
            }}
          />
        }
        ListFooterComponent={<Text style={s.footnote}>240 deterministic distributed traces</Text>}
      />
      {selected && (
        <Sheet title="Trace details" onClose={() => setSelected(null)}>
          <ScrollView contentContainerStyle={s.sheetContent}>
            <View style={s.row}>
              <Badge value={selected.status} />
              <Text style={s.time}>{selected.id}</Text>
            </View>
            <Title
              title={selected.name}
              detail={`${selected.duration} ms · ${selected.spans.length} spans · 6 services`}
            />
            <Text style={s.sectionTitle}>Trace waterfall</Text>
            <Text style={s.description}>Tap a span to inspect its timing and attributes.</Text>
            <Panel>
              {selected.spans.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Inspect ${item.name}, ${item.duration} milliseconds`}
                  onPress={() => setSpan(item)}
                  style={[s.spanRow, span?.id === item.id && { backgroundColor: '#f8f4ed' }]}
                >
                  <View style={s.logMeta}>
                    <Text
                      style={[
                        s.spanName,
                        {
                          paddingLeft:
                            item.parentId === null
                              ? 0
                              : item.parentId === selected.spans[0]?.id
                                ? 8
                                : 16,
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={s.time}>{item.duration} ms</Text>
                  </View>
                  <Text style={s.logService}>{item.service}</Text>
                  <View style={s.spanTrack}>
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${(item.start / selected.duration) * 100}%`,
                        width: `${Math.max(1, (item.duration / selected.duration) * 100)}%`,
                        borderRadius: 2,
                        backgroundColor:
                          item.status === 'error'
                            ? '#c18188'
                            : palette[SERVICES.indexOf(item.service)],
                      }}
                    />
                  </View>
                </Pressable>
              ))}
              <View style={s.chartTimes}>
                <Text style={s.time}>0 ms</Text>
                <Text style={s.time}>{selected.duration} ms</Text>
              </View>
            </Panel>
            {span && (
              <Panel>
                <Text style={s.panelTitle}>{span.name}</Text>
                <Badge value={span.status} />
                {Object.entries({
                  Service: span.service,
                  Duration: `${span.duration} ms`,
                  ...span.tags,
                }).map(([key, value]) => (
                  <View key={key} style={s.detailRow}>
                    <Text style={s.smallLabel}>{key}</Text>
                    <Text selectable style={s.detailValue}>
                      {value}
                    </Text>
                  </View>
                ))}
              </Panel>
            )}
          </ScrollView>
        </Sheet>
      )}
    </>
  );
}

function MobileMonitors({
  monitors,
  setMonitors,
  bug,
  notify,
}: {
  monitors: AlertRule[];
  setMonitors: React.Dispatch<React.SetStateAction<AlertRule[]>>;
  bug: string;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [threshold, setThreshold] = useState('2');
  const [warning, setWarning] = useState('1');
  const [warningEnabled, setWarningEnabled] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef<ScrollView>(null);
  const filtered = monitors.filter((rule) =>
    `${rule.name} ${rule.service}`.toLowerCase().includes(search.toLowerCase()),
  );
  function start(rule = newMonitor()) {
    setEditing({ ...rule });
    setThreshold(String(rule.threshold));
    setWarning(rule.warningThreshold === null ? '' : String(rule.warningThreshold));
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
  function save() {
    if (!editing) return;
    const next = {
      ...editing,
      name: editing.name.trim(),
      threshold: threshold.trim() ? Number(threshold) : NaN,
      warningThreshold: warningEnabled ? (warning.trim() ? Number(warning) : NaN) : null,
    };
    const validation = validateAlert(next);
    setErrors(validation);
    if (Object.keys(validation).length) {
      formRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSaving(true);
    setTimeout(() => {
      const saved = {
        ...next,
        id:
          next.id ||
          `monitor-${Math.max(0, ...monitors.map((rule) => Number(rule.id.split('-').slice(-1)[0]) || 0)) + 1}`,
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
      setSaving(false);
      setEditing(null);
      notify(next.id ? 'Monitor updated.' : 'Monitor created. Evaluation is active.');
    }, 200);
  }
  function remove(rule: AlertRule) {
    Alert.alert(
      'Delete monitor?',
      `“${rule.name}” will stop evaluating and be removed from this session.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete monitor',
          style: 'destructive',
          onPress: () => {
            setMonitors((old) => old.filter((item) => item.id !== rule.id));
            notify('Monitor deleted.');
          },
        },
      ],
    );
  }
  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(rule) => rule.id}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title
              title="Monitors"
              detail="Keep the right people informed when systems need attention."
            />
            <View style={s.monitorStats}>
              {['ok', 'warning', 'alert', 'paused'].map((status) => (
                <View key={status} style={s.monitorStat}>
                  <Text style={s.monitorStatValue}>
                    {
                      monitors.filter(
                        (rule) => evaluateAlert(rule, metricValues[rule.metric]) === status,
                      ).length
                    }
                  </Text>
                  <Text style={s.smallLabel}>
                    {status === 'ok'
                      ? 'Healthy'
                      : status === 'alert'
                        ? 'Alerting'
                        : status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
            <Action label="New monitor" primary onPress={() => start()} />
            <Field
              label="Search monitors"
              value={search}
              onChange={setSearch}
              placeholder="Name or service"
            />
          </View>
        }
        renderItem={({ item }) => (
          <Panel style={{ marginBottom: 12 }}>
            <View style={s.logMeta}>
              <Badge value={evaluateAlert(item, metricValues[item.metric])} />
              <Switch
                accessibilityLabel={`${item.enabled ? 'Pause' : 'Resume'} ${item.name}`}
                value={item.enabled}
                onValueChange={(value) => {
                  setMonitors((old) =>
                    old.map((rule) => (rule.id === item.id ? { ...rule, enabled: value } : rule)),
                  );
                  notify(value ? 'Monitor resumed.' : 'Monitor paused.');
                }}
                trackColor={{ true: '#a2b9ac', false: '#dde2e9' }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.name}`}
              onPress={() => start(item)}
            >
              <Text style={s.monitorTitle}>{item.name}</Text>
            </Pressable>
            <Text style={s.description}>
              {METRICS[item.metric].label} {item.operator === 'above' ? '>' : '<'} {item.threshold}{' '}
              {METRICS[item.metric].unit} · {item.window} minutes
            </Text>
            <Text style={s.smallLabel}>
              {item.service === 'all' ? 'All services' : item.service}
            </Text>
            <View style={s.row}>
              <Action label="Edit monitor" onPress={() => start(item)} />
              <Action label="Delete" onPress={() => remove(item)} />
            </View>
          </Panel>
        )}
        ListEmptyComponent={
          <Empty
            title={search ? 'No matching monitors' : 'Create your first monitor'}
            detail={
              search
                ? 'Try a different name or service.'
                : 'Watch a metric and define when to notify your team.'
            }
            clear={search ? () => setSearch('') : undefined}
          />
        }
      />
      {editing && (
        <Sheet
          title={editing.id ? 'Edit monitor' : 'New metric monitor'}
          onClose={() => setEditing(null)}
        >
          <ScrollView
            ref={formRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.sheetContent}
          >
            {Object.keys(errors).length > 0 && (
              <Text accessibilityRole="alert" style={s.errorSummary}>
                Review the highlighted fields before creating your monitor.
              </Text>
            )}
            <Panel>
              <Text style={s.step}>01 · DEFINE YOUR METRIC</Text>
              <Select
                label="Metric"
                value={editing.metric}
                options={Object.entries(METRICS).map(([value, metric]) => ({
                  value,
                  label: metric.label,
                }))}
                onChange={(value) => {
                  patch('metric', value as AlertRule['metric']);
                  setThreshold(value === 'latency' ? '300' : value === 'throughput' ? '100' : '2');
                  setWarning(value === 'latency' ? '250' : value === 'throughput' ? '80' : '1');
                }}
              />
              <Select
                label="Service scope"
                value={editing.service}
                options={[
                  { value: 'all', label: 'All services' },
                  ...SERVICES.map((service) => ({ value: service, label: service })),
                ]}
                onChange={(value) => patch('service', value)}
              />
            </Panel>
            <Panel>
              <Text style={s.step}>02 · SET ALERT CONDITIONS</Text>
              <Select
                label="Trigger when value is"
                value={editing.operator}
                options={[
                  { value: 'above', label: 'Above' },
                  { value: 'below', label: 'Below' },
                ]}
                onChange={(value) => patch('operator', value as AlertRule['operator'])}
              />
              <Field
                label={`Alert threshold (${METRICS[editing.metric].unit})`}
                value={threshold}
                onChange={setThreshold}
                error={errors.threshold}
                numeric
              />
              <Select
                label="For the last"
                value={String(editing.window)}
                options={[1, 5, 10, 15, 30, 60].map((value) => ({
                  value: String(value),
                  label: `${value} ${value === 1 ? 'minute' : 'minutes'}`,
                }))}
                onChange={(value) => patch('window', Number(value))}
              />
              <View style={s.switchRow}>
                <Text style={s.label}>Set a warning threshold</Text>
                <Switch
                  accessibilityLabel="Set a warning threshold"
                  value={warningEnabled}
                  onValueChange={setWarningEnabled}
                  trackColor={{ true: '#b89e78', false: '#dce1e8' }}
                />
              </View>
              {warningEnabled && (
                <Field
                  label={`Warning threshold (${METRICS[editing.metric].unit})`}
                  value={warning}
                  onChange={setWarning}
                  error={errors.warningThreshold}
                  numeric
                />
              )}
            </Panel>
            <Panel>
              <Text style={s.step}>03 · NAME AND NOTIFY</Text>
              <Field
                label="Monitor name"
                value={editing.name}
                onChange={(value) => patch('name', value)}
                error={errors.name}
                placeholder="e.g. Checkout error rate is elevated"
              />
              <Field
                label="Notify"
                value={editing.recipients}
                onChange={(value) => patch('recipients', value)}
                error={errors.recipients}
                placeholder="oncall@example.test"
              />
              <Text style={s.smallLabel}>
                Separate addresses with commas. Notifications are simulated.
              </Text>
              <Field
                label="Message (optional)"
                value={editing.message}
                onChange={(value) => patch('message', value)}
                multiline
                placeholder="What should someone check when this monitor alerts?"
              />
              <View style={s.switchRow}>
                <Text style={s.label}>Enable this monitor immediately</Text>
                <Switch
                  accessibilityLabel="Enable this monitor immediately"
                  value={editing.enabled}
                  onValueChange={(value) => patch('enabled', value)}
                  trackColor={{ true: '#b89e78', false: '#dce1e8' }}
                />
              </View>
            </Panel>
            <Panel>
              <Text style={s.panelTitle}>Monitor preview</Text>
              <Text style={s.description}>
                Watch {METRICS[editing.metric].label.toLowerCase()} for{' '}
                {editing.service === 'all' ? 'all services' : editing.service}. Trigger when the{' '}
                {editing.window}-minute average is {editing.operator} {threshold || '—'}{' '}
                {METRICS[editing.metric].unit}.
              </Text>
              <Text style={s.smallLabel}>
                Current value: {metricValues[editing.metric]} {METRICS[editing.metric].unit}
              </Text>
            </Panel>
            <Action
              label={saving ? 'Saving…' : editing.id ? 'Save changes' : 'Create monitor'}
              onPress={save}
              primary
              disabled={saving}
            />
            <Action label="Cancel" onPress={() => setEditing(null)} />
          </ScrollView>
        </Sheet>
      )}
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' },
  brandRow: {
    paddingHorizontal: 20,
    paddingVertical: 17,
    backgroundColor: '#1c222c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { fontSize: 29, color: '#fff', fontWeight: '600', letterSpacing: -1.3 },
  workspace: { fontSize: 8, color: '#84909f', letterSpacing: 1.4, marginTop: 5 },
  region: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  regionText: { color: '#a6b0bd', fontSize: 10 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#82aa94' },
  tabs: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e3e8ee',
    gap: 4,
    minWidth: '100%',
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#b68c50' },
  tabText: { color: '#94a0b0', fontSize: 11, fontWeight: '500' },
  tabTextActive: { color: '#a47b3d' },
  rangeRow: {
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#e7ebf0',
  },
  liveControl: { alignItems: 'center', gap: 3 },
  content: { padding: 20, gap: 18, paddingBottom: 35 },
  title: { color: '#3b485b', fontSize: 26, fontWeight: '600', letterSpacing: -0.7, lineHeight: 33 },
  description: { color: '#8c9aae', fontSize: 12, lineHeight: 20 },
  action: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dfe5ed',
    borderRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  actionPrimary: { backgroundColor: '#b58b4e', borderColor: '#b58b4e' },
  actionDanger: { backgroundColor: '#b86f75', borderColor: '#b86f75' },
  actionText: { color: '#8695a9', fontSize: 11, fontWeight: '600' },
  panel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e7ef',
    borderRadius: 7,
    padding: 17,
    gap: 10,
  },
  panelTitle: { color: '#6f7e93', fontSize: 13, fontWeight: '600' },
  smallLabel: { color: '#9aa7b8', fontSize: 10, lineHeight: 16 },
  field: { gap: 7, marginBottom: 6 },
  label: { color: '#8291a6', fontSize: 10, fontWeight: '500' },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#dce3ed',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#718197',
    fontSize: 12,
  },
  select: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dce3ed',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  selectText: { fontSize: 11, color: '#7f90a6', flexShrink: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '48%', flexGrow: 1, gap: 11 },
  metricValue: { color: '#5d6e85', fontSize: 27, letterSpacing: -0.7, fontWeight: '500' },
  metricUnit: { color: '#a7b2c0', fontSize: 11, letterSpacing: 0, fontWeight: '400' },
  metricChange: { color: '#7ca18d', fontSize: 10 },
  chartTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    color: '#a2afc0',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  healthy: { color: '#81a18f', fontSize: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#76869d', marginTop: 4 },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
  },
  serviceName: { color: '#7e8fa7', fontSize: 11, fontWeight: '500' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  chevron: { color: '#b1bbc8', fontSize: 20 },
  footnote: {
    color: '#a8b4c4',
    fontSize: 9,
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  listContent: { padding: 20, paddingBottom: 35 },
  listHeader: { gap: 14, marginBottom: 17 },
  logRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5eaf1',
    borderRadius: 5,
    padding: 12,
    gap: 10,
    marginBottom: 7,
    minHeight: 86,
  },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'space-between' },
  logService: { fontSize: 9, color: '#8d9db3', flexShrink: 1 },
  logMessage: {
    fontSize: 11,
    lineHeight: 18,
    color: '#8493a9',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 7,
  },
  resultCountText: { color: '#8293ab', fontSize: 11, fontWeight: '500' },
  empty: { padding: 28, gap: 15, justifyContent: 'center', alignItems: 'center', flex: 1 },
  emptyTitle: { fontSize: 17, color: '#7d8da4', fontWeight: '500' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    paddingVertical: 13,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5eaf1',
  },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: '#7d8da4' },
  sheetContent: { padding: 20, gap: 17, paddingBottom: 40 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e1e7f0',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 5,
  },
  optionSelected: { borderColor: '#c8ae86', backgroundColor: '#fbf8f2' },
  optionText: { fontSize: 13, color: '#8192aa' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 3,
  },
  detailRow: { paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  detailValue: { color: '#8191a8', fontSize: 11, lineHeight: 18 },
  json: {
    fontSize: 10,
    lineHeight: 18,
    color: '#8f9eb3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  traceRow: {
    gap: 12,
    padding: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e7ef',
    borderRadius: 6,
    marginBottom: 10,
  },
  traceResource: {
    color: '#8293aa',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flexShrink: 1,
  },
  duration: { fontSize: 10, color: '#90a0b7' },
  spanRow: {
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1f5',
    borderRadius: 4,
  },
  spanName: {
    color: '#8c9db4',
    fontSize: 10,
    flexShrink: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  spanTrack: {
    height: 15,
    position: 'relative',
    backgroundColor: '#f2f5f9',
    borderRadius: 2,
    marginVertical: 5,
    overflow: 'hidden',
  },
  monitorStats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e3e9f1',
    borderRadius: 6,
    padding: 16,
  },
  monitorStat: { flex: 1, alignItems: 'center', gap: 7 },
  monitorStatValue: { fontSize: 24, color: '#8293ab', fontWeight: '500' },
  monitorTitle: { fontSize: 15, color: '#7b8ca5', fontWeight: '500', lineHeight: 21 },
  step: { fontSize: 9, color: '#b59d78', letterSpacing: 1.1, fontWeight: '600', marginBottom: 7 },
  error: { color: '#b5787e', fontSize: 10, lineHeight: 16 },
  errorSummary: {
    color: '#ad6e77',
    backgroundColor: '#fcf2f3',
    borderWidth: 1,
    borderColor: '#f0dfe3',
    padding: 13,
    borderRadius: 5,
    fontSize: 11,
    lineHeight: 18,
  },
  notice: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#edf4ef',
    borderWidth: 1,
    borderColor: '#d5e4d9',
    borderRadius: 6,
    padding: 14,
    gap: 12,
  },
  noticeText: { color: '#75957f', fontSize: 11, lineHeight: 17, flexShrink: 1 },
});
