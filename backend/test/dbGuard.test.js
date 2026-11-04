const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeDatabaseUrl } = require('../src/lib/dbGuard');

test('allows local hosts', () => {
  for (const h of ['localhost', '127.0.0.1', 'postgres'])
    assert.doesNotThrow(() => assertSafeDatabaseUrl(`postgresql://u:p@${h}:5436/db`, 'development'));
});
test('rejects neon outside production', () => {
  assert.throws(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db?sslmode=require', 'development'), /non-local/);
  assert.throws(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db', undefined), /non-local/);
});
test('production skips the check', () => {
  assert.doesNotThrow(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db', 'production'));
});
