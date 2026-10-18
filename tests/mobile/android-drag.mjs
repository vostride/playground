import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appId = 'dev.vostride.playground';
const activity = `${appId}/.MainActivity`;
const sourceId = 'task-card-CKB-001';
const secondId = 'task-card-CKB-002';
const destinationId = 'task-card-CKB-007';

function decodeXml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity];
  });
}

export function parseHierarchy(xml) {
  assert.match(xml, /<hierarchy\b/, 'UIAutomator returned no hierarchy');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decodeXml(value)]),
    );
    const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(attributes.bounds || '');
    return {
      ...attributes,
      bounds: match
        ? { left: +match[1], top: +match[2], right: +match[3], bottom: +match[4] }
        : null,
    };
  });
}

export function visibleBounds(node, screen) {
  if (!node?.bounds) return null;
  const bounds = {
    left: Math.max(0, node.bounds.left),
    top: Math.max(0, node.bounds.top),
    right: Math.min(screen.width, node.bounds.right),
    bottom: Math.min(screen.height, node.bounds.bottom),
  };
  return bounds.right > bounds.left && bounds.bottom > bounds.top ? bounds : null;
}

export function findById(nodes, id) {
  return nodes.find(
    (node) => node['resource-id'] === id || node['resource-id']?.endsWith(`:id/${id}`),
  );
}

export function pointIn(bounds, x = 0.5, y = 0.5) {
  assert.ok(bounds, 'Cannot target an element without visible bounds');
  return {
    x: Math.round(bounds.left + (bounds.right - bounds.left) * x),
    y: Math.round(bounds.top + (bounds.bottom - bounds.top) * y),
  };
}

export function hasOrder(nodes, screen, earlierId, laterId) {
  const earlier = visibleBounds(findById(nodes, earlierId), screen);
  const later = visibleBounds(findById(nodes, laterId), screen);
  return (
    !!earlier &&
    !!later &&
    earlier.top < later.top &&
    Math.abs(earlier.left - later.left) < (earlier.right - earlier.left) * 0.05
  );
}

export async function runAndroidDrag({
  device = process.env.ANDROID_SERIAL || 'emulator-5554',
  output = resolve(dirname(fileURLToPath(import.meta.url)), '../../maestro-reports/android/drag'),
} = {}) {
  mkdirSync(output, { recursive: true });
  const report = {
    name: 'Corkboard continuous touch drag',
    device,
    startedAt: new Date().toISOString(),
    passed: false,
    actions: [],
  };
  let originalTimeout;
  let changedTimeout = false;
  let screen;
  const adb = (args, binary = false) => {
    report.actions.push({
      at: new Date().toISOString(),
      command: ['adb', '-s', device, ...args].join(' '),
    });
    return execFileSync(process.env.ADB || 'adb', ['-s', device, ...args], {
      encoding: binary ? undefined : 'utf8',
      timeout: 30000,
      maxBuffer: 12 * 1024 * 1024,
    });
  };
  const shell = (...args) => adb(['shell', ...args]);
  const hierarchy = () => {
    shell('uiautomator', 'dump', '--compressed', '/sdcard/playground-drag.xml');
    const xml = shell('cat', '/sdcard/playground-drag.xml');
    writeFileSync(resolve(output, 'latest.xml'), xml);
    return { xml, nodes: parseHierarchy(xml) };
  };
  const capture = (name) => {
    const { xml } = hierarchy();
    writeFileSync(resolve(output, `${name}.xml`), xml);
    writeFileSync(resolve(output, `${name}.png`), adb(['exec-out', 'screencap', '-p'], true));
  };
  const waitFor = async (description, predicate) => {
    const deadline = Date.now() + 20000;
    let nodes;
    do {
      ({ nodes } = hierarchy());
      if (predicate(nodes)) return nodes;
      await new Promise((done) => setTimeout(done, 400));
    } while (Date.now() < deadline);
    throw new Error(`Timed out: ${description}`);
  };
  const tap = (node) => {
    const point = pointIn(visibleBounds(node, screen));
    shell('input', 'touchscreen', 'tap', `${point.x}`, `${point.y}`);
  };
  const drag = (start, end) => {
    // Android counts the initial long-press pause inside this total duration.
    shell(
      'input',
      'touchscreen',
      'draganddrop',
      `${start.x}`,
      `${start.y}`,
      `${end.x}`,
      `${end.y}`,
      '2000',
    );
  };
  const open = (route) =>
    shell(
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `playground://tasks${route}`,
      '-n',
      activity,
    );
  const reveal = (id, direction) => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const { nodes } = hierarchy();
      const found = findById(nodes, id);
      if (visibleBounds(found, screen)) return found;
      const scroll = nodes
        .filter((node) => node.scrollable === 'true')
        .map((node) => visibleBounds(node, screen))
        .filter(Boolean)
        .sort(
          (a, b) =>
            (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top),
        )[0];
      assert.ok(scroll, `No visible scroll area while revealing ${id}`);
      const start = pointIn(scroll, 0.5, direction === 'down' ? 0.8 : 0.25);
      const end = pointIn(scroll, 0.5, direction === 'down' ? 0.25 : 0.8);
      shell(
        'input',
        'touchscreen',
        'swipe',
        `${start.x}`,
        `${start.y}`,
        `${end.x}`,
        `${end.y}`,
        '300',
      );
    }
    throw new Error(`Unable to reveal ${id} by scrolling ${direction}`);
  };

  try {
    const size = shell('wm', 'size');
    const dimensions = [...size.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)].at(-1);
    assert.ok(dimensions, `Cannot read emulator screen dimensions: ${size}`);
    screen = { width: +dimensions[1], height: +dimensions[2] };
    report.screen = screen;
    originalTimeout = shell('settings', 'get', 'secure', 'long_press_timeout').trim();
    // The Android default is 400 ms, equal to the app's timer. A longer held
    // contact avoids racing JS delivery while leaving the app's behavior intact.
    shell('settings', 'put', 'secure', 'long_press_timeout', '800');
    changedTimeout = true;
    assert.equal(shell('settings', 'get', 'secure', 'long_press_timeout').trim(), '800');
    shell('am', 'force-stop', appId);
    assert.match(shell('pm', 'clear', appId), /Success/, 'Could not reset the native session');
    open('');
    let nodes = await waitFor('fresh board with the first two Backlog cards', (items) =>
      hasOrder(items, screen, sourceId, secondId),
    );
    capture('01-before-drag');

    drag(
      pointIn(visibleBounds(findById(nodes, sourceId), screen)),
      pointIn(visibleBounds(findById(nodes, secondId), screen), 0.5, 0.75),
    );
    nodes = await waitFor('held-finger drag moves CKB-001 below CKB-002', (items) =>
      hasOrder(items, screen, secondId, sourceId),
    );
    capture('02-reordered');
    const undo = nodes.find(
      (node) => node['content-desc'] === 'Undo last change' && node.enabled === 'true',
    );
    assert.ok(undo, 'Reordering did not create an enabled undo action');
    tap(undo);
    nodes = await waitFor('undo restores the original card order', (items) =>
      hasOrder(items, screen, sourceId, secondId),
    );
    capture('03-reorder-undone');

    const targetBounds = visibleBounds(findById(nodes, destinationId), screen);
    assert.ok(targetBounds, 'The adjacent To do card is not visible');
    // Use the left quarter of the visible adjacent column: its full card can
    // extend off-screen, and the right screen edge deliberately auto-scrolls.
    drag(
      pointIn(visibleBounds(findById(nodes, sourceId), screen)),
      pointIn(targetBounds, 0.25, 0.5),
    );
    await waitFor('cross-column drag completes', (items) =>
      items.some((node) =>
        [node.text, node['content-desc']].some((value) =>
          value?.includes('CKB-001 moved to To do'),
        ),
      ),
    );
    capture('04-moved-across');
    open('/task/CKB-001');
    await waitFor(
      'task details confirm To do status after dragging',
      (items) => findById(items, 'task-status-todo')?.selected === 'true',
    );
    capture('05-cross-column-status');
    tap(reveal('task-detail-undo', 'down'));
    reveal('task-status-backlog', 'up');
    await waitFor(
      'undo restores Backlog status',
      (items) => findById(items, 'task-status-backlog')?.selected === 'true',
    );
    capture('06-cross-column-undone');
    report.passed = true;
    console.log(
      'Android touch drag passed: reorder, undo, cross-column move, and undo verified through the native UI.',
    );
  } catch (error) {
    report.error = error instanceof Error ? error.stack : String(error);
    try {
      capture('failure');
    } catch (diagnosticError) {
      report.diagnosticError = String(diagnosticError);
    }
    throw error;
  } finally {
    if (changedTimeout) {
      try {
        if (originalTimeout === 'null') shell('settings', 'delete', 'secure', 'long_press_timeout');
        else shell('settings', 'put', 'secure', 'long_press_timeout', originalTimeout);
      } catch (error) {
        report.passed = false;
        report.cleanupError = String(error);
        process.exitCode = 1;
      }
    }
    report.finishedAt = new Date().toISOString();
    writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runAndroidDrag({
    device: process.argv[2] || process.env.ANDROID_SERIAL || 'emulator-5554',
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
