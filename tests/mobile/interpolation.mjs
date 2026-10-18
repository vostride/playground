import assert from 'node:assert/strict';

// Keep this in sync with Maestro cli-2.11.0's Env.evaluateScripts pattern.
// A dollar sign inside an expression causes Maestro to leave it as literal text.
export function checkInterpolations(value, source) {
  if (typeof value === 'string') {
    const remaining = value.replace(/\$\{([^$]*)\}/g, '');
    assert.ok(
      !remaining.includes('${'),
      `${source}: unsupported Maestro interpolation; keep regex dollar anchors outside expressions`,
    );
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) checkInterpolations(child, source);
  }
}
