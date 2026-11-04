// Usage: node scripts/local.js [--test] <cmd> [...args]
// Loads .env.local (or .env.test), overrides DATABASE_URL, guards, then runs cmd.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const { assertSafeDatabaseUrl } = require('../src/lib/dbGuard');

const args = process.argv.slice(2);
const isTest = args[0] === '--test';
if (isTest) args.shift();
const [cmd, ...cmdArgs] = args;
if (!cmd) {
  console.error('Usage: node scripts/local.js [--test] <cmd> [...args]');
  process.exit(2);
}

const file = path.join(__dirname, '..', isTest ? '.env.test' : '.env.local');
if (!fs.existsSync(file)) {
  console.error(`Missing ${path.basename(file)} (copy from ${path.basename(file)}.example)`);
  process.exit(2);
}
const env = { ...process.env, ...dotenv.parse(fs.readFileSync(file)), NODE_ENV: isTest ? 'test' : 'development' };
assertSafeDatabaseUrl(env.DATABASE_URL, env.NODE_ENV);

const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
