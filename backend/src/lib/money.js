// Money is Decimal(12,2) in the DB; all arithmetic happens in integer paise.
const { Prisma } = require('@prisma/client');
const { ValidationError } = require('./errors');

// Keep API JSON as plain numbers (the frontend expects numbers, not strings).
Prisma.Decimal.prototype.toJSON = function () { return this.toNumber(); };

const MAX_PAISE = 999999999999; // Decimal(12,2) max = 9,999,999,999.99

function toPaise(v) {
  const d = new Prisma.Decimal(v); // throws on non-numeric strings
  if (!d.isFinite()) throw new Error(`Not a money value: ${v}`);
  return d.times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

function fromPaise(p) {
  const abs = Math.abs(p);
  return `${p < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function parseAmountPaise(input) {
  const s = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new ValidationError('Amount must be a positive number with at most 2 decimals');
  const p = toPaise(s);
  if (p <= 0) throw new ValidationError('Amount must be greater than zero');
  if (p > MAX_PAISE) throw new ValidationError('Amount is too large');
  return p;
}

module.exports = { toPaise, fromPaise, parseAmountPaise };
