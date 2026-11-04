const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatINR = (n) => inr.format(Number(n) || 0);

// 'YYYY-MM-DD' (or ISO prefix) parsed as parts: no timezone shift.
export function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function periodLabel(p) {
  if (!p) return '';
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
