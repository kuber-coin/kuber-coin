'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './Search.module.css';

interface SearchProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (query: string) => void;
  suggestions?: string[];
  loading?: boolean;
  className?: string;
}

export function Search({
  placeholder = 'Search...',
  value,
  onChange,
  onSearch,
  suggestions = [],
  loading = false,
  className = ''
}: SearchProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    if (!isControlled) {
      setInternalQuery(nextValue);
    }
    onChange?.(nextValue);
    setShowSuggestions(nextValue.length > 0);
    setFocusedIndex(-1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch?.(query);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isControlled) {
      setInternalQuery(suggestion);
    }
    onChange?.(suggestion);
    onSearch?.(suggestion);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[focusedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setFocusedIndex(-1);
    }
  };

  return (
    <div className={`${styles.container} ${className}`} ref={searchRef}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <span className={styles.icon}>🔍</span>
        <input
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className={styles.spinner} />}
        {query && !loading && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              if (!isControlled) {
                setInternalQuery('');
              }
              onChange?.('');
              setShowSuggestions(false);
            }}
          >
            ✕
          </button>
        )}
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`${styles.suggestion} ${index === focusedIndex ? styles.focused : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <span className={styles.suggestionIcon}>🔍</span>
              <span className={styles.suggestionText}>{suggestion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
