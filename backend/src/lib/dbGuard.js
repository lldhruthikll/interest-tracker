const LOCAL_HOSTS = ['localhost', '127.0.0.1', 'postgres'];

function assertSafeDatabaseUrl(url, nodeEnv) {
  if (nodeEnv === 'production') return;
  let host;
  try { host = new URL(url).hostname; } catch { host = null; }
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error('Refusing non-local DATABASE_URL outside production');
  }
}

module.exports = { assertSafeDatabaseUrl };
