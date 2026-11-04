const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/lib/dates');

test('todayIST uses Asia/Kolkata', () => {
  assert.equal(d.todayIST(new Date('2026-11-03T19:00:00Z')), '2026-11-04'); // 00:30 IST
  assert.equal(d.todayIST(new Date('2026-11-04T18:29:00Z')), '2026-11-04');
  assert.equal(d.todayIST(new Date('2026-11-04T18:30:00Z')), '2026-11-05');
});

test('month helpers', () => {
  assert.equal(d.clampDay('2027-02', 31), '2027-02-28');
  assert.equal(d.clampDay('2028-02', 30), '2028-02-29');
  assert.equal(d.clampDay('2026-04', 5), '2026-04-05');
  assert.equal(d.addMonths('2026-12', 1), '2027-01');
  assert.equal(d.addMonths('2026-01', -1), '2025-12');
  assert.equal(d.daysInMonth('2026-03'), 31);
  assert.equal(d.periodOf('2026-08-29'), '2026-08');
});

test('day helpers and DB conversion', () => {
  assert.equal(d.addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(d.toDbDate('2026-08-29').toISOString(), '2026-08-29T00:00:00.000Z');
  assert.equal(d.toDateOnly(new Date('2026-08-29T00:00:00Z')), '2026-08-29');
  assert.equal(d.isValidDateStr('2026-02-29'), false);
  assert.equal(d.isValidDateStr('2028-02-29'), true);
  assert.equal(d.isValidDateStr('2026-8-1'), false);
  assert.equal(d.isValidDateStr(undefined), false);
});
