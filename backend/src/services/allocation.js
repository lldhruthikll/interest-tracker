// Pure FIFO plan in integer paise. `dues` must be sorted oldest first.
function planFifo(dues, amountPaise) {
  let left = amountPaise;
  const allocations = [];
  for (const due of dues) {
    if (left <= 0) break;
    const take = Math.min(left, due.amountPaise - due.paidPaise);
    if (take <= 0) continue;
    allocations.push({ dueId: due.id, amountPaise: take });
    left -= take;
  }
  return { allocations, leftoverPaise: left };
}

module.exports = { planFifo };
