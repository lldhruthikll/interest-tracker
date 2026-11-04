const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');
const { _resetLoginLimiter } = require('../src/middleware/auth');

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });
test.beforeEach(async () => { await resetDb(); _resetLoginLimiter(); });

const mk = (username, role, extra = {}) =>
  prisma.user.create({ data: { username, password: bcrypt.hashSync('password1', 4), name: username, role, ...extra } });
const login = (username, password = 'password1') =>
  api(srv.url, '/api/auth/login', { method: 'POST', body: { username, password } });

test('wrong password -> 401; 11th failed attempt -> 429', async () => {
  await mk('a', 'ADMIN');
  for (let i = 0; i < 10; i++) assert.equal((await login('a', 'bad')).status, 401);
  assert.equal((await login('a', 'bad')).status, 429);
  assert.equal((await login('a')).status, 429);
});

test('successful login resets limiter and returns user shape', async () => {
  await mk('a', 'ADMIN');
  for (let i = 0; i < 5; i++) await login('a', 'bad');
  const r = await login('a');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.user).sort(), ['id', 'mustChangePassword', 'name', 'role', 'username']);
  assert.equal(jwt.decode(r.body.token).userId, r.body.user.id);
});

test('no admin/admin123 auto-creation on empty DB', async () => {
  assert.equal((await login('admin', 'admin123')).status, 401);
  assert.equal(await prisma.user.count(), 0);
});

test('new member must change password before owner routes', async () => {
  await mk('boss', 'ADMIN');
  const t = (await login('boss')).body.token;
  const c = await api(srv.url, '/api/admin/members', { method: 'POST', token: t, body: { username: 'mem', name: 'Mem', password: 'temp12345' } });
  assert.equal(c.status, 201);
  assert.equal(c.body.password, undefined);
  const m = (await login('mem', 'temp12345')).body;
  assert.equal(m.user.mustChangePassword, true);
  const blocked = await api(srv.url, '/api/borrowers', { token: m.token });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await api(srv.url, '/api/auth/profile', { token: m.token })).status, 200);
  const short = await api(srv.url, '/api/auth/change-password', { method: 'POST', token: m.token, body: { currentPassword: 'temp12345', newPassword: 'short' } });
  assert.equal(short.status, 400);
  const wrong = await api(srv.url, '/api/auth/change-password', { method: 'POST', token: m.token, body: { currentPassword: 'nope', newPassword: 'newpass123' } });
  assert.equal(wrong.status, 401);
  const ok = await api(srv.url, '/api/auth/change-password', { method: 'POST', token: m.token, body: { currentPassword: 'temp12345', newPassword: 'newpass123' } });
  assert.equal(ok.status, 200);
  assert.equal((await api(srv.url, '/api/borrowers', { token: m.token })).status, 200);
});

test('duplicate username -> 409; MEMBER on /admin/members -> 403', async () => {
  await mk('boss', 'ADMIN');
  await mk('mem', 'MEMBER');
  const t = (await login('boss')).body.token;
  const d = await api(srv.url, '/api/admin/members', { method: 'POST', token: t, body: { username: 'mem', name: 'x', password: 'temp12345' } });
  assert.equal(d.status, 409);
  const mt = (await login('mem')).body.token;
  assert.equal((await api(srv.url, '/api/admin/members', { token: mt })).status, 403);
});

test('admin disables member -> existing token 401; PUT only targets MEMBER', async () => {
  const boss = await mk('boss', 'ADMIN');
  const mem = await mk('mem', 'MEMBER');
  const t = (await login('boss')).body.token;
  const mt = (await login('mem')).body.token;
  assert.equal((await api(srv.url, '/api/auth/profile', { token: mt })).status, 200);
  const u = await api(srv.url, `/api/admin/members/${mem.id}`, { method: 'PUT', token: t, body: { active: false } });
  assert.equal(u.status, 200);
  assert.equal((await api(srv.url, '/api/auth/profile', { token: mt })).status, 401);
  assert.equal((await api(srv.url, `/api/admin/members/${boss.id}`, { method: 'PUT', token: t, body: { active: false } })).status, 404);
  const r = await api(srv.url, `/api/admin/members/${mem.id}`, { method: 'PUT', token: t, body: { password: 'reset12345' } });
  assert.equal(r.status, 200);
  assert.equal((await prisma.user.findUnique({ where: { id: mem.id } })).mustChangePassword, true);
  const list = await api(srv.url, '/api/admin/members', { token: t });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].password, undefined);
});

test('disabled PAYER token -> 401', async () => {
  const p = await mk('tenant', 'PAYER', { payerId: 1 });
  const tok = (await login('tenant')).body.token;
  assert.equal((await api(srv.url, '/api/auth/profile', { token: tok })).status, 200);
  await prisma.user.update({ where: { id: p.id }, data: { active: false } });
  assert.equal((await api(srv.url, '/api/auth/profile', { token: tok })).status, 401);
});

test('legacy token with extra claims still verifies', async () => {
  const u = await mk('boss', 'ADMIN');
  const tok = jwt.sign({ userId: u.id, username: 'boss', name: 'x' }, process.env.JWT_SECRET);
  assert.equal((await api(srv.url, '/api/auth/profile', { token: tok })).status, 200);
});
