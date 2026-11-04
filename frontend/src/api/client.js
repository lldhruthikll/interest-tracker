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

  if (response.status === 401 && endpoint !== '/auth/login') {
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
    a.download = `Interest_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
