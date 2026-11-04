const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set');

// ponytail: in-memory limiter, per-process; move to DB/redis if multiple instances
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map(); // "username|ip" -> { count, resetAt }
const key = (req) => `${req.body?.username}|${req.ip}`;
const loginLimiter = {
  blocked(req) {
    const e = fails.get(key(req));
    if (e && e.resetAt <= Date.now()) { fails.delete(key(req)); return false; }
    return !!e && e.count >= MAX_FAILS;
  },
  fail(req) {
    const e = fails.get(key(req));
    if (e && e.resetAt > Date.now()) e.count++;
    else fails.set(key(req), { count: 1, resetAt: Date.now() + WINDOW_MS });
  },
  reset(req) { fails.delete(key(req)); },
};
const _resetLoginLimiter = () => fails.clear();

async function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = { id: user.id, role: user.role, payerId: user.payerId, mustChangePassword: user.mustChangePassword };
    next();
  } catch (e) { next(e); }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

const requirePasswordChanged = (req, res, next) =>
  req.user.mustChangePassword ? res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' }) : next();

module.exports = { authenticate, requireRole, requirePasswordChanged, loginLimiter, _resetLoginLimiter, JWT_SECRET };
