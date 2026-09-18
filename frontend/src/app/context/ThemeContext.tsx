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

    // 2. We remove backend fetching for theme to prevent overwriting user's local preference on refresh.
    // The theme is now fully persistent via localStorage instantly.
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
