import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (globalThis.window === undefined) {
      return initialValue;
    }
    try {
      const item = globalThis.window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = typeof value === 'function' ? (value as (val: T) => T)(storedValue) : value;
      setStoredValue(valueToStore);
      if (globalThis.window !== undefined) {
        globalThis.window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error saving localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
