const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { JWT_SECRET, loginLimiter } = require('../middleware/auth');
const { ValidationError, HttpError } = require('../lib/errors');

// Compared against when the user is missing/inactive so response time doesn't reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new ValidationError('Username and password are required');
  }
  if (loginLimiter.blocked(req)) throw new HttpError(429, 'Too many failed attempts, try again later');

  const user = await prisma.user.findUnique({ where: { username } });
  const usable = user && user.active;
  const ok = await bcrypt.compare(password, usable ? user.password : DUMMY_HASH);
  if (!usable || !ok) {
    loginLimiter.fail(req);
    throw new HttpError(401, 'Invalid credentials');
  }
  loginLimiter.reset(req);

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword },
  });
}

async function getProfile(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, username: true, name: true, role: true, mustChangePassword: true, createdAt: true },
  });
  res.json(user);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password))) {
    throw new HttpError(401, 'Current password is incorrect');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
  });
  res.json({ ok: true });
}

module.exports = { login, getProfile, changePassword };
