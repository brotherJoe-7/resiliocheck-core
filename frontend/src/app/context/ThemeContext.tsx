"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiJson } from '../utils/apiClient';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'orange',
  setTheme: () => {},
  isLoading: true,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState('orange');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch initial theme from settings API
    const fetchTheme = async () => {
      try {
        const data = await apiJson('/api/settings');
        if (data.theme) {
          setThemeState(data.theme);
          document.documentElement.setAttribute('data-theme', data.theme);
        }
      } catch (err) {
        console.error('Failed to fetch theme settings', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTheme();
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
