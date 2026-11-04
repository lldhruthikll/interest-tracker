const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { toPaise, fromPaise, parseAmountPaise } = require('../src/lib/money');
const { ValidationError } = require('../src/lib/errors');

test('toPaise rounds half-up to integer paise', () => {
  assert.equal(toPaise('1234.5'), 123450);
  assert.equal(toPaise(999.9999), 100000);
  assert.equal(toPaise(new Prisma.Decimal('0.005')), 1);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.throws(() => toPaise('abc'));
});

test('fromPaise formats two decimals', () => {
  assert.equal(fromPaise(123450), '1234.50');
  assert.equal(fromPaise(5), '0.05');
});

test('parseAmountPaise validates API input', () => {
  assert.throws(() => parseAmountPaise('0'), ValidationError);
  assert.throws(() => parseAmountPaise('-5'), ValidationError);
  assert.throws(() => parseAmountPaise('10.123'), ValidationError);
  assert.throws(() => parseAmountPaise('abc'), ValidationError);
  assert.throws(() => parseAmountPaise(undefined), ValidationError);
  assert.equal(parseAmountPaise('25000'), 2500000);
  assert.equal(parseAmountPaise(199.99), 19999);
});

test('Decimal serialises as a JSON number', () => {
  assert.equal(JSON.stringify({ a: new Prisma.Decimal('12.50') }), '{"a":12.5}');
});
