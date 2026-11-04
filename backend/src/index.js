const { assertSafeDatabaseUrl } = require('./lib/dbGuard');
assertSafeDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);

const { createApp } = require('./app');
const PORT = process.env.PORT || 5000;

createApp().listen(PORT, () => {
  console.log(`Interest Manager Backend API running on port ${PORT}`);
});
