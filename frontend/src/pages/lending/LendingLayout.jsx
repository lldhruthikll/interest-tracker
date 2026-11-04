import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Chips } from '../../components/ui';

const TABS = [
  { value: '/lending', label: 'Dashboard' },
  { value: '/lending/borrowers', label: 'Borrowers' },
  { value: '/lending/reports', label: 'Reports' },
];

export default function LendingLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = TABS.slice().reverse().find((t) => pathname.startsWith(t.value))?.value;
  return (
    <div className="space-y-6">
      <nav aria-label="Lending"><Chips options={TABS} value={current} onChange={navigate} /></nav>
      <Outlet />
    </div>
  );
}
