const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSchedule } = require('../src/services/schedule');

test('buildSchedule', () => {
  const base = { dueDay: 5, timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED', endDate: null,
    rates: [{ effectiveFrom: '2026-03', amountPaise: 3100000 }], startDate: '2026-03-25' };
  // spec §7 example
  assert.deepEqual(buildSchedule(base, '2026-04-05'), [
    { period: '2026-03', dueDate: '2026-03-25', amountPaise: 700000 },
    { period: '2026-04', dueDate: '2026-04-05', amountPaise: 3100000 }]);
  assert.deepEqual(buildSchedule({ ...base, timing: 'IN_ARREARS' }, '2026-05-05').map((d) => [d.period, d.dueDate, d.amountPaise]),
    [['2026-03', '2026-04-05', 700000], ['2026-04', '2026-05-05', 3100000]]);
  assert.equal(buildSchedule({ ...base, firstMonthRule: 'FULL' }, '2026-03-31')[0].amountPaise, 3100000);
  assert.equal(buildSchedule({ ...base, firstMonthRule: 'FREE' }, '2026-04-05')[0].period, '2026-04');
  // due day 31 in Feb, start on the 1st (not partial)
  assert.equal(buildSchedule({ ...base, startDate: '2027-01-01', dueDay: 31, rates: [{ effectiveFrom: '2027-01', amountPaise: 100000 }] }, '2027-03-01')[1].dueDate, '2027-02-28');
  // rate change from June
  const rc = buildSchedule({ ...base, startDate: '2026-04-01', rates: [{ effectiveFrom: '2026-04', amountPaise: 100000 }, { effectiveFrom: '2026-06', amountPaise: 120000 }] }, '2026-07-05');
  assert.deepEqual(rc.map((d) => d.amountPaise), [100000, 100000, 120000, 120000]);
  // move-out Jun 10, prorated (30-day month), all periods through end
  const mo = buildSchedule({ ...base, startDate: '2026-04-01', endDate: '2026-06-10', rates: [{ effectiveFrom: '2026-04', amountPaise: 300000 }] }, null);
  assert.deepEqual(mo.map((d) => d.amountPaise), [300000, 300000, 100000]);
  assert.equal(buildSchedule({ ...base, startDate: '2026-04-01', endDate: '2026-06-10', lastMonthRule: 'FULL', rates: [{ effectiveFrom: '2026-04', amountPaise: 300000 }] }, null)[2].amountPaise, 300000);
  assert.equal(buildSchedule({ ...base, startDate: '2026-04-01', endDate: '2026-06-10', lastMonthRule: 'FREE', rates: [{ effectiveFrom: '2026-04', amountPaise: 300000 }] }, null).length, 2);
  // same-month start and end: Mar 10–19 (10 days of 31), prorated
  assert.equal(buildSchedule({ ...base, startDate: '2026-03-10', endDate: '2026-03-19' }, null)[0].amountPaise, 1000000);
  assert.throws(() => buildSchedule(base, null));
});
