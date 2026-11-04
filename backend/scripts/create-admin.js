// Usage: node scripts/local.js node scripts/create-admin.js --username U --password P --name N
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

(async () => {
  const [username, password, name] = [arg('username'), arg('password'), arg('name')];
  if (!username || !password || !name || password.length < 8) {
    console.error('Usage: --username U --password P(min 8) --name N');
    process.exitCode = 2;
    return;
  }
  if (await prisma.user.count({ where: { role: 'ADMIN' } })) {
    console.log('An ADMIN already exists; nothing created.');
    return;
  }
  const u = await prisma.user.create({ data: { username, name, password: await bcrypt.hash(password, 10), role: 'ADMIN' } });
  console.log(`Created ADMIN id=${u.id}`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
