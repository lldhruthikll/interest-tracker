import { todayIST } from '../lib/format';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (response.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/change-password') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403 && errorData.error === 'PASSWORD_CHANGE_REQUIRED') {
      if (window.location.pathname !== '/change-password') window.location.assign('/change-password');
      throw new Error('Password change required');
    }
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  // Handle blob responses (e.g. Excel export)
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('spreadsheetml')) {
    return response.blob();
  }

  return response.json();
}

export const api = {
  login: (credentials) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getProfile: () => apiFetch('/auth/profile'),
  changePassword: (data) =>
    apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  getCategories: () => apiFetch('/categories'),
  getAllCategories: () => apiFetch('/categories?all=1'),
  getCategory: (id) => apiFetch(`/categories/${id}`),
  createCategory: (d) => apiFetch('/categories', { method: 'POST', body: JSON.stringify(d) }),
  updateCategory: (id, d) => apiFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteCategory: (id) => apiFetch(`/categories/${id}`, { method: 'DELETE' }),
  createPlace: (catId, d) => apiFetch(`/categories/${catId}/places`, { method: 'POST', body: JSON.stringify(d) }),
  updatePlace: (id, d) => apiFetch(`/places/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  createUnit: (placeId, d) => apiFetch(`/places/${placeId}/units`, { method: 'POST', body: JSON.stringify(d) }),
  updateUnit: (id, d) => apiFetch(`/units/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  getOverview: (month, months = 12) => apiFetch(`/overview?months=${months}${month ? `&month=${month}` : ''}`),
  getCalendar: (from, to, ledger = '') =>
    apiFetch(`/calendar?from=${from}&to=${to}${ledger ? `&ledger=${encodeURIComponent(ledger)}` : ''}`),
  getCategoryDashboard: (id, placeId, month) => {
    const q = new URLSearchParams();
    if (placeId) q.set('placeId', placeId);
    if (month) q.set('month', month);
    return apiFetch(`/categories/${id}/dashboard${q.toString() ? `?${q}` : ''}`);
  },
  exportCategory: async (id, name) => {
    const blob = await apiFetch(`/categories/${id}/export`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_${todayIST()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  getPayers: (search = '') => apiFetch(`/payers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getPayer: (id) => apiFetch(`/payers/${id}`),
  createPayer: (d) => apiFetch('/payers', { method: 'POST', body: JSON.stringify(d) }),
  updatePayer: (id, d) => apiFetch(`/payers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  createPayerLogin: (id, d) => apiFetch(`/payers/${id}/login`, { method: 'POST', body: JSON.stringify(d) }),
  updatePayerLogin: (id, d) => apiFetch(`/payers/${id}/login`, { method: 'PUT', body: JSON.stringify(d) }),
  getMembers: () => apiFetch('/admin/members'),
  createMember: (d) => apiFetch('/admin/members', { method: 'POST', body: JSON.stringify(d) }),
  updateMember: (id, d) => apiFetch(`/admin/members/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  previewAgreement: (d) => apiFetch('/agreements/preview', { method: 'POST', body: JSON.stringify(d) }),
  createAgreement: (d) => apiFetch('/agreements', { method: 'POST', body: JSON.stringify(d) }),
  getAgreement: (id) => apiFetch(`/agreements/${id}`),
  updateBilling: (id, d) => apiFetch(`/agreements/${id}/billing`, { method: 'PUT', body: JSON.stringify(d) }),
  addRate: (id, d) => apiFetch(`/agreements/${id}/rates`, { method: 'POST', body: JSON.stringify(d) }),
  addAdvance: (id, d) => apiFetch(`/agreements/${id}/advance`, { method: 'POST', body: JSON.stringify(d) }),
  previewMoveOut: (id, d) => apiFetch(`/agreements/${id}/move-out/preview`, { method: 'POST', body: JSON.stringify(d) }),
  moveOut: (id, d) => apiFetch(`/agreements/${id}/move-out`, { method: 'POST', body: JSON.stringify(d) }),
  createRecurringPayment: (d) => apiFetch('/recurring-payments', { method: 'POST', body: JSON.stringify(d) }),
  updateRecurringPayment: (id, d) => apiFetch(`/recurring-payments/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteRecurringPayment: (id) => apiFetch(`/recurring-payments/${id}`, { method: 'DELETE' }),
  getPortalMe: () => apiFetch('/portal/me'),

  getDashboard: () => apiFetch('/dashboard'),

  getMonthlyAnalytics: (year, month) =>
    apiFetch(`/analytics/monthly?year=${year}${month ? `&month=${month}` : ''}`),


  getBorrowers: (search = '') =>
    apiFetch(`/borrowers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getBorrowerById: (id) => apiFetch(`/borrowers/${id}`),
  createBorrower: (data) =>
    apiFetch('/borrowers', { method: 'POST', body: JSON.stringify(data) }),
  updateBorrower: (id, data) =>
    apiFetch(`/borrowers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBorrower: (id) => apiFetch(`/borrowers/${id}`, { method: 'DELETE' }),

  createLoan: (data) =>
    apiFetch('/loans', { method: 'POST', body: JSON.stringify(data) }),
  updateLoan: (id, data) =>
    apiFetch(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateLoanStatus: (id, status) =>
    apiFetch(`/loans/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  deleteLoan: (id) => apiFetch(`/loans/${id}`, { method: 'DELETE' }),

  clearInterestRecord: (id) =>
    apiFetch(`/interest-records/${id}/clear`, { method: 'PUT' }),

  recordPayment: (data) =>
    apiFetch('/payments', { method: 'POST', body: JSON.stringify(data) }),
  getPayments: (params = '') => apiFetch(`/payments${params}`),
  updatePayment: (id, data) =>
    apiFetch(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePayment: (id) => apiFetch(`/payments/${id}`, { method: 'DELETE' }),

  downloadExcelReport: async () => {
    const blob = await apiFetch('/reports/excel');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Interest_Report_${todayIST()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
