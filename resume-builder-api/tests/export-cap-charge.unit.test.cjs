const assert = require('node:assert/strict');
const test = require('node:test');
const { isPerDownloadChargeEnabled, isExportCapActive } = require('../dist/resume/resume.service.js');

function withEnv(env, fn) {
  const prev = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// The contract: per-download charging and the monthly export cap are mutually
// exclusive. When users pay per download, there is no "5/month" ceiling.

test('charge ON → export cap is NOT active (unlimited paid downloads)', () => {
  withEnv({ ENABLE_DOWNLOAD_CHARGE: 'true', ENFORCE_EXPORT_QUOTA: 'true' }, () => {
    assert.equal(isPerDownloadChargeEnabled(), true);
    assert.equal(isExportCapActive(), false);
  });
});

test('charge ON overrides ENFORCE_EXPORT_QUOTA=true', () => {
  withEnv({ ENABLE_DOWNLOAD_CHARGE: 'true', ENFORCE_EXPORT_QUOTA: 'true' }, () => {
    assert.equal(isExportCapActive(), false);
  });
});

test('charge OFF + quota enforced → legacy monthly cap active', () => {
  withEnv({ ENABLE_DOWNLOAD_CHARGE: undefined, ENFORCE_EXPORT_QUOTA: 'true' }, () => {
    assert.equal(isPerDownloadChargeEnabled(), false);
    assert.equal(isExportCapActive(), true);
  });
});

test('charge OFF + quota disabled → no cap', () => {
  withEnv({ ENABLE_DOWNLOAD_CHARGE: 'false', ENFORCE_EXPORT_QUOTA: 'false' }, () => {
    assert.equal(isExportCapActive(), false);
  });
});

test('charge flag is case/whitespace tolerant', () => {
  withEnv({ ENABLE_DOWNLOAD_CHARGE: '  TRUE  ' }, () => {
    assert.equal(isPerDownloadChargeEnabled(), true);
  });
});
