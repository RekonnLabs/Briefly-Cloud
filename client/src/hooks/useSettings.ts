import { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

interface Settings {
  referenceFolder: string | null;
  theme: 'light' | 'dark' | 'system';
  // Add other settings as needed
}

// Helper to normalize backend keys (snake_case) to frontend camelCase
const normalizeSettings = (data: any): Settings => {
  return {
    referenceFolder: data.referenceFolder ?? data.reference_folder ?? null,
    theme: (data.theme ?? data.theme_preference ?? 'system') as 'light' | 'dark' | 'system',
  };
};

interface UseSettingsReturn {
  settings: Settings | null;
  isLoading: boolean;
  error: Error | null;
  setReferenceFolder: (path: string) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  // Add other setting setters as needed
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch settings on component mount
  useEffect(() => {
    fetchSettings();
  }, []);

  // Function to fetch settings from the API
  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(apiUrl('/api/settings'));
      if (!response.ok) {
        throw new Error(`Failed to fetch settings: ${response.status}`);
      }
      const raw = await response.json();
      const data = normalizeSettings(raw);
      setSettings(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Function to update reference folder
  const setReferenceFolder = async (path: string): Promise<void> => {
    try {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Send both key styles for maximum compatibility
          referenceFolder: path,
          reference_folder: path,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update reference folder: ${response.status}`);
      }

      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      setError(null);
    } catch (err) {
      console.error('Error updating reference folder:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  // Function to update theme
  const setTheme = async (theme: 'light' | 'dark' | 'system'): Promise<void> => {
    try {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update theme: ${response.status}`);
      }

      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      setError(null);
    } catch (err) {
      console.error('Error updating theme:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  return {
    settings,
    isLoading,
    error,
    setReferenceFolder,
    setTheme,
  };
}
