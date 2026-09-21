"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

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

// Read the persisted preference once during the initial client render.
// Guarded so the lazy initializer is a no-op during server-side rendering.
function readStored(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState(() => readStored('rc-theme', 'orange'));
  const [mode, setModeState] = useState(() => readStored('rc-mode', 'dark'));

  // Keep the <html> data attributes in sync with state. Theme is persisted
  // purely in localStorage; the backend is intentionally not consulted so a
  // refresh never overrides the user's local preference.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);
  }, [theme, mode]);

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
