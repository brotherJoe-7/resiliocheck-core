"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiJson } from '../utils/apiClient';

interface ThemeContextType {
  theme: string;
  mode: string;
  setTheme: (theme: string) => void;
  setMode: (mode: string) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'orange',
  mode: 'dark',
  setTheme: () => {},
  setMode: () => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState('orange');
  const [mode, setModeState] = useState('dark');

  useEffect(() => {
    // 1. Instantly apply from localStorage (fixes flicker and works for logged out users)
    const localTheme = localStorage.getItem('rc-theme') || 'orange';
    const localMode = localStorage.getItem('rc-mode') || 'dark';
    
    setThemeState(localTheme);
    setModeState(localMode);
    document.documentElement.setAttribute('data-theme', localTheme);
    document.documentElement.setAttribute('data-mode', localMode);

    // 2. Fetch from backend to sync (for logged in users)
    const fetchTheme = async () => {
      try {
        const data = await apiJson('/api/settings') as { theme?: string; mode?: string };
        if (data.theme || data.mode) {
          const t = data.theme || 'orange';
          const m = data.mode || 'dark';
          setThemeState(t);
          setModeState(m);
          document.documentElement.setAttribute('data-theme', t);
          document.documentElement.setAttribute('data-mode', m);
          localStorage.setItem('rc-theme', t);
          localStorage.setItem('rc-mode', m);
        }
      } catch {
        // If not logged in, just rely on the localStorage values we already set above.
      }
    };
    fetchTheme();
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rc-theme', newTheme);
  };

  const setMode = (newMode: string) => {
    setModeState(newMode);
    document.documentElement.setAttribute('data-mode', newMode);
    localStorage.setItem('rc-mode', newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
