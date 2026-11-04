import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Chips } from '../components/ui';

const KEY = 'finledger-theme'; // keep in sync with the inline script in index.html
const MODES = [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }];
const Ctx = createContext({ mode: 'system', setMode() {} });

const readMode = () => {
  try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'dark' ? m : 'system'; } catch { return 'system'; }
};

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode);
    apply();
    if (mode !== 'system') return undefined;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
  const setMode = useCallback((m) => {
    setModeState(m);
    try { if (m === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch { /* storage unavailable */ }
  }, []);
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">Theme</p>
      <Chips options={MODES} value={mode} onChange={setMode} />
    </div>
  );
}
