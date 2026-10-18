import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInterpolations } from './interpolation.mjs';

test('rejects the tab-selector expression Maestro would treat as literal text', () => {
  assert.throws(
    () => checkInterpolations({ env: { UI_TAB: "${({shop:'^Komazon$'})[APP]}" } }, 'navigation'),
    /unsupported Maestro interpolation/,
  );
});

test('rejects a dollar anchor assembled inside an evalScript expression', () => {
  assert.throws(
    () =>
      checkInterpolations(
        [{ evalScript: "${output.rate = '^' + maestro.copiedText + '$'}" }],
        'logs',
      ),
    /unsupported Maestro interpolation/,
  );
});

test('accepts strict anchors outside interpolation and literal currency selectors', () => {
  assert.doesNotThrow(() =>
    checkInterpolations(
      {
        env: { UI_TAB: "${({shop:'Komazon',flights:'Looking'})[APP]}" },
        commands: [
          { tapOn: '^${UI_TAB}$' },
          { evalScript: '${output.rate = maestro.copiedText}' },
          { assertVisible: '^${output.rate}$' },
          { assertVisible: '\\$53\\.00' },
          { tapOn: '${FIRST}-${SECOND}' },
        ],
      },
      'valid',
    ),
  );
});

test('rejects an unfinished expression in nested helper parameters', () => {
  assert.throws(
    () => checkInterpolations([{ runFlow: { env: { LINK: '${LINK' } } }], 'helper'),
    /unsupported Maestro interpolation/,
  );
});
