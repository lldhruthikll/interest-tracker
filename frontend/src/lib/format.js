const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatINR = (n) => {
  const v = Number(n) || 0;
  return (Number.isInteger(v) ? inr0 : inr2).format(v);
};

// 'YYYY-MM-DD' (or ISO prefix) parsed as parts: no timezone shift.
export function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function periodLabel(p) {
  if (!p) return '';
  if (p === '0000-00') return 'Previous balance'; // owed before the tenant was entered (backend OPENING)
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Payment.paymentDate is an ISO timestamp; date-only fields are 'YYYY-MM-DD'. Both -> 'YYYY-MM-DD' in IST.
const ist = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export const toDateInput = (s) => {
  if (!s) return '';
  const t = String(s);
  return t.length <= 10 ? t : ist.format(new Date(t));
};
export const todayIST = () => ist.format(new Date());
export const formatAnyDate = (s) => formatDate(toDateInput(s));
