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
    const fetchTheme = async () => {
      try {
        const data = await apiJson('/api/settings') as { theme?: string; mode?: string };
        const t = data.theme || 'orange';
        const m = data.mode || 'dark';
        setThemeState(t);
        setModeState(m);
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-mode', m);
      } catch {
        // Not logged in yet — apply defaults silently
        document.documentElement.setAttribute('data-theme', 'orange');
        document.documentElement.setAttribute('data-mode', 'dark');
      }
    };
    fetchTheme();
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const setMode = (newMode: string) => {
    setModeState(newMode);
    document.documentElement.setAttribute('data-mode', newMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
