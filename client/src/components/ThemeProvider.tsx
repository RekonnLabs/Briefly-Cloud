import React, { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

interface ThemeProviderProps {
  children: React.ReactNode;
}

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextType>({
  theme: 'system',
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>('system');

  // Initialize theme from settings or localStorage
  useEffect(() => {
    const initializeTheme = async () => {
      try {
        // Try to get theme from API settings first
        const response = await fetch(apiUrl('/api/settings'));
        if (response.ok) {
          const settings = await response.json();
          if (settings.theme) {
            setTheme(settings.theme);
            return;
          }
        }
      } catch (error) {
        console.error('Error fetching theme from settings:', error);
      }

      // Fallback to localStorage
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme) {
        setTheme(savedTheme);
      }
    };

    initializeTheme();
  }, []);

  // Update document class when theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    
    // Save to localStorage
    localStorage.setItem('theme', theme);
    
    // Try to save to API settings
    fetch(apiUrl('/api/settings'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ theme }),
    }).catch(error => {
      console.error('Error saving theme to settings:', error);
    });
  }, [theme]);

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme(prevTheme => {
      if (prevTheme === 'light') return 'dark';
      if (prevTheme === 'dark') return 'system';
      return 'light';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeProvider;
