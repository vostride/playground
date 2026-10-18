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
  View,
} from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Button as PrimitiveButton } from '../components/ui/button';
import { Input } from '../components/ui/input';
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
import {
  BottomTabs,
  Icon,
  IconButton,
  SafeModalArea,
  colors,
  useSessionState,
  type IconName,
  type MobileScreenProps,
} from '../ui';

type Page = 'overview' | 'logs' | 'traces' | 'monitors';
const pages: { key: Page; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'activity' },
  { key: 'logs', label: 'Logs', icon: 'terminal' },
  { key: 'traces', label: 'Traces', icon: 'gitBranch' },
  { key: 'monitors', label: 'Monitors', icon: 'bell' },
];
const statusColors = { healthy: '#4ade80', warning: '#fbbf24', error: '#fb7185' };
const switchColors = { false: '#3f3f46', true: '#a1a1aa' };
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
  icon,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <PrimitiveButton
      variant={primary ? 'default' : danger ? 'destructive' : 'outline'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={s.action}
    >
      {icon && (
        <Icon
          name={icon}
          size={16}
          color={primary ? colors.primaryForeground : danger ? statusColors.error : colors.text}
        />
      )}
      <Text
        style={[
          s.actionText,
          primary && { color: colors.primaryForeground },
          danger && { color: statusColors.error },
        ]}
      >
        {label}
      </Text>
    </PrimitiveButton>
  );
}
function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.panel, style]}>{children}</View>;
}
function Badge({ value, testID }: { value: string; testID?: string }) {
  const color =
    value === 'ok' || value === 'info'
      ? statusColors.healthy
      : value === 'warn' || value === 'warning'
        ? statusColors.warning
        : value === 'error' || value === 'alert'
          ? statusColors.error
          : colors.muted;
  return (
    <View style={s.badge}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      <Text testID={testID} style={{ fontSize: 12, lineHeight: 18, color, fontWeight: '600' }}>
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
      <Input
        testID={`vigil-field-${label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.text}
        keyboardAppearance="dark"
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        returnKeyType={multiline ? 'default' : 'done'}
        submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
        autoCapitalize="none"
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: 'top' },
          !!error && { borderColor: statusColors.error },
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
      <SafeModalArea style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.sheetHeader}>
            <Text accessibilityRole="header" style={s.sheetTitle}>
              {title}
            </Text>
            <IconButton icon="x" label="Close" onPress={onClose} />
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
        testID={`vigil-select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? value}`}
        onPress={() => setOpen(true)}
        style={s.select}
      >
        <Text style={s.selectText}>
          {options.find((option) => option.value === value)?.label ?? value}
        </Text>
        <Icon name="chevronDown" size={16} color={colors.muted} />
      </Pressable>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <ScrollView contentContainerStyle={s.sheetContent}>
            {options.map((option) => (
              <Pressable
                testID={`vigil-option-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${option.value}`}
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
                {option.value === value && <Icon name="check" size={18} color={colors.text} />}
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
  color = '#60a5fa',
  label,
  height = 130,
}: {
  values: number[];
  color?: string;
  label: string;
  height?: number;
}) {
  const [width, setWidth] = useState(300);
  const max = Math.max(1, ...values) * 1.15;
  const points = values.map((value, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - 6 - (value / max) * (height - 16),
  }));
  return (
    <View
      accessible
      accessibilityLabel={`${label}: minimum ${formatNumber(Math.min(...values), 2)}, maximum ${formatNumber(Math.max(...values), 2)}`}
      onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
      style={{ height, overflow: 'hidden', marginVertical: 6 }}
    >
      <Svg
        width={width}
        height={height}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {[0.25, 0.5, 0.75, 1].map((value) => (
          <Line
            key={value}
            x1={0}
            x2={width}
            y1={(height - 6) * value}
            y2={(height - 6) * value}
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}
        <Polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
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
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              testID="vigil-live-updates"
              accessibilityLabel="Live updates"
              value={live}
              onValueChange={setLive}
              trackColor={switchColors}
              thumbColor={colors.text}
            />
          </View>
        </View>
      )}
      {loading ? (
        <View style={s.empty}>
          <ActivityIndicator color={colors.text} />
          <Text style={s.description}>Loading telemetry…</Text>
        </View>
      ) : page === 'overview' ? (
        <ScrollView
          style={s.scroller}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.text}
              colors={[colors.text]}
              progressBackgroundColor={colors.surface}
            />
          }
          contentContainerStyle={s.content}
        >
          <Title title="Production overview" />
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
          <IconButton icon="x" label="Dismiss notification" onPress={() => setNotice('')} />
        </View>
      ) : null}
      <BottomTabs
        tabs={pages.map((item) => ({
          id: item.key,
          label: item.label,
          icon: item.icon,
          testID: `vigil-tab-${item.key}`,
        }))}
        active={page}
        onSelect={(id) => navigate('observability', id)}
      />
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
            <Text
              testID={`vigil-metric-${metric.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              style={s.metricValue}
            >
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
        <MetricChart values={series.latency} color="#a78bfa" label="P95 latency" />
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
            <Icon name="chevronRight" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </Panel>
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
        testID="vigil-log-list"
        style={s.scroller}
        data={filtered}
        keyExtractor={(log) => log.id}
        initialNumToRender={18}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title title="Log explorer" />
            <Field
              label="Log search query"
              value={draft}
              onChange={setDraft}
              placeholder="service:checkout status:error"
              error={error}
            />
            <View style={s.row}>
              <Action label="Search" onPress={search} primary icon="search" />
              <Action
                label={`Filters${levels.length + services.length ? ` (${levels.length + services.length})` : ''}`}
                onPress={() => setFilters(true)}
                icon="filter"
              />
              <Action
                label={newest ? 'Newest first' : 'Oldest first'}
                onPress={() => setNewest(!newest)}
                icon="arrowUpDown"
              />
            </View>
            <Text style={s.smallLabel}>
              Try status:error, service:checkout, or "payment provider".
            </Text>
            <View style={s.resultCount}>
              <Text testID="vigil-log-count" style={s.resultCountText}>
                {formatNumber(filtered.length)} logs found
              </Text>
              <Text style={s.smallLabel}>{environment} · UTC</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`vigil-${item.id}`}
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
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  testID={`vigil-filter-level-${level}`}
                  accessibilityLabel={`Filter ${level} logs`}
                  value={levels.includes(level)}
                  onValueChange={() => setLevels(toggle(levels, level))}
                  trackColor={switchColors}
                  thumbColor={colors.text}
                />
              </View>
            ))}
            <Text style={s.sectionTitle}>Service</Text>
            {SERVICES.map((service) => (
              <View key={service} style={s.switchRow}>
                <Text style={s.serviceName}>{service}</Text>
                <Switch
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  testID={`vigil-filter-service-${service}`}
                  accessibilityLabel={`Filter ${service} logs`}
                  value={services.includes(service)}
                  onValueChange={() => setServices(toggle(services, service))}
                  trackColor={switchColors}
                  thumbColor={colors.text}
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
              <Text testID="vigil-selected-event-id" style={s.time}>
                {selected.id}
              </Text>
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
              icon="gitBranch"
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
  const palette = ['#60a5fa', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#a1a1aa'];
  function spanDepth(item: TraceSpan) {
    let depth = 0;
    let parentId = item.parentId;
    const visited = new Set([item.id]);
    while (parentId && !visited.has(parentId)) {
      const parent = selected?.spans.find((candidate) => candidate.id === parentId);
      if (!parent) break;
      visited.add(parentId);
      depth++;
      parentId = parent.parentId;
    }
    return depth;
  }
  return (
    <>
      <FlatList
        style={s.scroller}
        data={filtered}
        keyExtractor={(trace) => trace.id}
        initialNumToRender={15}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title title="Distributed traces" />
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
              detail={`${selected.duration} ms · ${selected.spans.length} spans · ${new Set(selected.spans.map((item) => item.service)).size} services`}
            />
            <Text style={s.sectionTitle}>Trace waterfall</Text>
            <Text style={s.description}>Tap a span to inspect its timing and attributes.</Text>
            <Panel>
              {selected.spans.map((item) => (
                <Pressable
                  key={item.id}
                  testID={`vigil-${item.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: span?.id === item.id }}
                  accessibilityLabel={`Inspect ${item.name}, ${item.duration} milliseconds`}
                  onPress={() => setSpan(item)}
                  style={[s.spanRow, span?.id === item.id && s.spanSelected]}
                >
                  <View style={s.logMeta}>
                    <Text
                      style={[
                        s.spanName,
                        {
                          paddingLeft: spanDepth(item) * 10,
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={s.duration}>{item.duration} ms</Text>
                  </View>
                  <Text style={s.logService}>{item.service}</Text>
                  <View style={s.spanTrack}>
                    {[0, 25, 50, 75, 100].map((offset) => (
                      <View key={offset} style={[s.spanGridLine, { left: `${offset}%` }]} />
                    ))}
                    <View
                      style={{
                        position: 'absolute',
                        top: 5,
                        height: 8,
                        left: `${(item.start / selected.duration) * 100}%`,
                        width: `${(item.duration / selected.duration) * 100}%`,
                        minWidth: 1,
                        borderRadius: 1,
                        backgroundColor:
                          item.status === 'error'
                            ? statusColors.error
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
                  'Start offset': `${span.start} ms`,
                  'End offset': `${span.start + span.duration} ms`,
                  ...span.tags,
                }).map(([key, value]) => (
                  <View key={key} style={s.detailRow}>
                    <Text style={s.smallLabel}>{key}</Text>
                    <Text
                      testID={`vigil-span-detail-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      selectable
                      style={s.detailValue}
                    >
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
    Alert.alert('Delete monitor?', `“${rule.name}” will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete monitor',
        style: 'destructive',
        onPress: () => {
          setMonitors((old) => old.filter((item) => item.id !== rule.id));
          notify('Monitor deleted.');
        },
      },
    ]);
  }
  return (
    <>
      <FlatList
        style={s.scroller}
        data={filtered}
        keyExtractor={(rule) => rule.id}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Title title="Monitors" />
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
            <Action label="New monitor" primary icon="plus" onPress={() => start()} />
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
              <Badge
                testID={`vigil-${item.id}-status`}
                value={evaluateAlert(item, metricValues[item.metric])}
              />
              <Switch
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityLabel={`${item.enabled ? 'Pause' : 'Resume'} ${item.name}`}
                value={item.enabled}
                onValueChange={(value) => {
                  setMonitors((old) =>
                    old.map((rule) => (rule.id === item.id ? { ...rule, enabled: value } : rule)),
                  );
                  notify(value ? 'Monitor resumed.' : 'Monitor paused.');
                }}
                trackColor={switchColors}
                thumbColor={colors.text}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.name}`}
              onPress={() => start(item)}
              style={s.monitorOpen}
            >
              <Text style={s.monitorTitle}>{item.name}</Text>
            </Pressable>
            <Text testID={`vigil-${item.id}-condition`} style={s.description}>
              {METRICS[item.metric].label} {item.operator === 'above' ? '>' : '<'} {item.threshold}{' '}
              {METRICS[item.metric].unit} · {item.window} minutes
            </Text>
            <Text style={s.smallLabel}>
              {item.service === 'all' ? 'All services' : item.service}
            </Text>
            <View style={s.row}>
              <Action label="Edit monitor" icon="sliders" onPress={() => start(item)} />
              <Action label="Delete" danger onPress={() => remove(item)} />
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
              <Text style={s.step}>Metric</Text>
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
              <Text style={s.step}>Alert conditions</Text>
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
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel="Set a warning threshold"
                  value={warningEnabled}
                  onValueChange={setWarningEnabled}
                  trackColor={switchColors}
                  thumbColor={colors.text}
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
              <Text style={s.step}>Notifications</Text>
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
              <Text style={s.smallLabel}>Separate addresses with commas.</Text>
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
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityLabel="Enable this monitor immediately"
                  value={editing.enabled}
                  onValueChange={(value) => patch('enabled', value)}
                  trackColor={switchColors}
                  thumbColor={colors.text}
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
  root: { flex: 1, backgroundColor: colors.background },
  scroller: { flex: 1 },
  rangeRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  liveControl: { minWidth: 60, alignItems: 'center', gap: 4 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  description: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  action: { paddingHorizontal: 12 },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  panel: {
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    gap: 10,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  smallLabel: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '500', flexShrink: 1 },
  input: {
    height: 44,
  },
  select: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  selectText: { fontSize: 14, lineHeight: 20, color: colors.text, flexShrink: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metricCard: { width: '50%', paddingRight: 12, gap: 6 },
  metricValue: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.6,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: { color: colors.muted, fontSize: 12, letterSpacing: 0, fontWeight: '400' },
  metricChange: { color: statusColors.healthy, fontSize: 12, lineHeight: 18 },
  chartTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  healthy: { color: statusColors.healthy, fontSize: 12, lineHeight: 18 },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  serviceRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  serviceName: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    flexShrink: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  listContent: { padding: 16, paddingBottom: 24 },
  listHeader: { gap: 12, marginBottom: 8 },
  logRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    gap: 8,
    minHeight: 88,
  },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  logService: { fontSize: 12, lineHeight: 18, color: colors.muted, flexShrink: 1 },
  logMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingVertical: 6,
  },
  resultCountText: { color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '500' },
  empty: { padding: 24, gap: 12, justifyContent: 'center', alignItems: 'center', flex: 1 },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  sheetHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  sheetContent: { padding: 16, gap: 12, paddingBottom: 28 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 2,
  },
  optionSelected: { backgroundColor: colors.subtle },
  optionText: { fontSize: 14, lineHeight: 20, color: colors.text, flexShrink: 1 },
  switchRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  detailRow: {
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailValue: { color: colors.text, fontSize: 13, lineHeight: 20 },
  json: {
    fontSize: 12,
    lineHeight: 20,
    color: colors.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  traceRow: {
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  traceResource: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flexShrink: 1,
  },
  duration: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  spanRow: {
    minHeight: 72,
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  spanSelected: { backgroundColor: colors.subtle },
  spanName: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  spanTrack: { height: 18, position: 'relative', marginTop: 2, overflow: 'hidden' },
  spanGridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  monitorStats: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
  },
  monitorStat: { flex: 1, alignItems: 'center', gap: 4 },
  monitorStatValue: {
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  monitorOpen: { minHeight: 44, justifyContent: 'center' },
  monitorTitle: { fontSize: 16, color: colors.text, fontWeight: '600', lineHeight: 23 },
  step: { fontSize: 15, lineHeight: 22, color: colors.text, fontWeight: '600', marginBottom: 2 },
  error: { color: statusColors.error, fontSize: 12, lineHeight: 18 },
  errorSummary: {
    color: statusColors.error,
    backgroundColor: '#261419',
    borderWidth: 1,
    borderColor: '#572330',
    padding: 12,
    borderRadius: 2,
    fontSize: 13,
    lineHeight: 20,
  },
  notice: {
    position: 'absolute',
    zIndex: 5,
    bottom: 72,
    left: 16,
    right: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    paddingLeft: 12,
    paddingRight: 4,
    gap: 8,
  },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 20, flexShrink: 1 },
});
