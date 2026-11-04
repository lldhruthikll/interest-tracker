const test = require('node:test');
const assert = require('node:assert/strict');
const { planFifo } = require('../src/services/allocation');

test('planFifo fills oldest dues first', () => {
  const r = planFifo([{ id: 1, amountPaise: 1000, paidPaise: 400 }, { id: 2, amountPaise: 1000, paidPaise: 0 }], 1500);
  assert.deepEqual(r, { allocations: [{ dueId: 1, amountPaise: 600 }, { dueId: 2, amountPaise: 900 }], leftoverPaise: 0 });
});

test('planFifo leftover and skips fully paid dues', () => {
  assert.equal(planFifo([], 500).leftoverPaise, 500);
  assert.deepEqual(planFifo([{ id: 1, amountPaise: 1000, paidPaise: 1000 }, { id: 2, amountPaise: 300, paidPaise: 0 }], 500),
    { allocations: [{ dueId: 2, amountPaise: 300 }], leftoverPaise: 200 });
});
