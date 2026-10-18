import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MONITORS,
  OBSERVABILITY_NOW,
  evaluateAlert,
  filterLogs,
  metricSeries,
  parseLogQuery,
  seededLogs,
  seededTraces,
  validateAlert,
} from './observability.ts';

test('telemetry is repeatable and generated in realistic volumes', () => {
  const logs = seededLogs();
  assert.equal(logs.length, 6000);
  assert.deepEqual(logs, seededLogs());
  assert.equal(new Set(logs.map((log) => log.id)).size, logs.length);
  assert.equal(logs[0]!.timestamp, OBSERVABILITY_NOW);
  assert.deepEqual(metricSeries('1h', 2), metricSeries('1h', 2));
  assert.notDeepEqual(metricSeries('1h', 2), metricSeries('1h', 3));
  assert.notDeepEqual(metricSeries('1h'), metricSeries('24h'));
});

test('log queries combine exact fields, wildcards, phrases and negation', () => {
  const logs = seededLogs();
  const results = filterLogs(logs, 'service:checkout status:error env:production');
  assert.ok(results.length > 0);
  assert.ok(
    results.every(
      (log) =>
        log.service === 'checkout' && log.level === 'error' && log.environment === 'production',
    ),
  );
  assert.ok(filterLogs(logs, '-status:error').every((log) => log.level !== 'error'));
  const wildcard = filterLogs(logs, 'service:*worker');
  assert.ok(wildcard.length > 0);
  assert.ok(wildcard.every((log) => log.service === 'payment-worker'));
  const phrase = filterLogs(logs, '"payment provider"');
  assert.ok(phrase.length > 0);
  assert.ok(phrase.every((log) => log.message.toLowerCase().includes('payment provider')));
  assert.deepEqual(filterLogs(logs, 'no-matching-content'), []);
});

test('invalid search grammar is rejected with actionable errors', () => {
  assert.throws(() => parseLogQuery('"unclosed'), /quotation/);
  assert.throws(() => parseLogQuery('service:'), /Enter a value/);
  assert.throws(() => parseLogQuery('unknown:checkout'), /Unknown field/);
  assert.throws(() => parseLogQuery('status:critical'), /Status must/);
});

test('facets and time windows compose with query filters; opt-in bug is isolated', () => {
  const logs = seededLogs();
  const results = filterLogs(logs, 'env:production', {
    range: '15m',
    levels: ['error'],
    services: ['checkout', 'inventory'],
  });
  assert.ok(results.length > 0);
  assert.ok(
    results.every(
      (log) =>
        log.timestamp >= OBSERVABILITY_NOW - 15 * 60000 &&
        log.level === 'error' &&
        ['checkout', 'inventory'].includes(log.service) &&
        log.environment === 'production',
    ),
  );
  assert.ok(filterLogs(logs, 'status:error', {}, true).some((log) => log.level !== 'error'));
  assert.ok(filterLogs(logs, 'status:error').every((log) => log.level === 'error'));
});

test('trace spans are bounded, linked, deterministic, and reachable from logs', () => {
  const traces = seededTraces();
  assert.equal(traces.length, 240);
  assert.deepEqual(traces, seededTraces());
  assert.ok(seededLogs().every((log) => traces.some((trace) => trace.id === log.traceId)));
  for (const trace of traces) {
    assert.equal(trace.spans[0]!.parentId, null);
    for (const span of trace.spans) {
      assert.ok(
        span.start >= 0 && span.duration > 0 && span.start + span.duration <= trace.duration + 1,
      );
      if (span.parentId) assert.ok(trace.spans.some((parent) => parent.id === span.parentId));
    }
  }
});

test('monitor validation handles threshold direction, ranges, recipients, and empty fields', () => {
  const valid = DEFAULT_MONITORS[0]!;
  assert.deepEqual(validateAlert(valid), {});
  assert.ok(validateAlert({ ...valid, name: '', recipients: '', threshold: NaN }).name);
  assert.ok(validateAlert({ ...valid, name: '', recipients: '', threshold: NaN }).recipients);
  assert.ok(validateAlert({ ...valid, threshold: NaN }).threshold);
  assert.ok(validateAlert({ ...valid, threshold: 101 }).threshold);
  assert.ok(validateAlert({ ...valid, warningThreshold: 3 }).warningThreshold);
  assert.ok(validateAlert({ ...valid, operator: 'below', warningThreshold: 1 }).warningThreshold);
  assert.deepEqual(
    validateAlert({
      ...valid,
      operator: 'below',
      warningThreshold: 3,
      recipients: 'first@example.test, second@example.test',
    }),
    {},
  );
  assert.ok(validateAlert({ ...valid, recipients: 'first@example.test, invalid' }).recipients);
  assert.ok(validateAlert({ ...valid, window: 7 }).window);
});

test('monitor evaluation respects strict thresholds, warning direction and pause state', () => {
  const above = DEFAULT_MONITORS[0]!;
  assert.equal(evaluateAlert(above, 0.5), 'ok');
  assert.equal(evaluateAlert(above, 1.5), 'warning');
  assert.equal(evaluateAlert(above, 2), 'warning');
  assert.equal(evaluateAlert(above, 2.1), 'alert');
  const below = DEFAULT_MONITORS[2]!;
  assert.equal(evaluateAlert(below, 10), 'alert');
  assert.equal(evaluateAlert(below, 30), 'warning');
  assert.equal(evaluateAlert(below, 60), 'ok');
  assert.equal(evaluateAlert({ ...above, enabled: false }, 999), 'paused');
});
