const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { ValidationError, NotFound } = require('../lib/errors');

const safe = { id: true, username: true, name: true, role: true, active: true, mustChangePassword: true, createdAt: true };
const minPw = (p) => {
  if (typeof p !== 'string' || p.length < 8) throw new ValidationError('Password must be at least 8 characters');
};

async function listMembers(req, res) {
  res.json(await prisma.user.findMany({ where: { role: 'MEMBER' }, select: safe, orderBy: { id: 'asc' } }));
}

async function createMember(req, res) {
  const { username, name, password } = req.body || {};
  if (![username, name].every((s) => typeof s === 'string' && s.trim())) throw new ValidationError('username and name are required');
  minPw(password);
  const user = await prisma.user.create({
    data: { username: username.trim(), name: name.trim(), password: await bcrypt.hash(password, 10), role: 'MEMBER', mustChangePassword: true },
    select: safe,
  }); // duplicate username -> P2002 -> 409
  res.status(201).json(user);
}

async function updateMember(req, res) {
  const id = Number(req.params.id);
  const { password, active } = req.body || {};
  const data = {};
  if (password !== undefined) { minPw(password); data.password = await bcrypt.hash(password, 10); data.mustChangePassword = true; }
  if (active !== undefined) {
    if (typeof active !== 'boolean') throw new ValidationError('active must be boolean');
    data.active = active;
  }
  const r = await prisma.user.updateMany({ where: { id, role: 'MEMBER' }, data });
  if (!r.count) throw new NotFound('Member not found');
  res.json(await prisma.user.findUnique({ where: { id }, select: safe }));
}

module.exports = { listMembers, createMember, updateMember };
