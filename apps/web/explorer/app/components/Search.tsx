'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './Search.module.css';

interface SearchProps {
  placeholder?: string;
  value?: string;
  onChange?: (query: string) => void;
  onSearch?: (query: string) => void;
  suggestions?: string[];
  loading?: boolean;
  className?: string;
}

export function Search({
  placeholder = 'Search...',
  value,
  onSearch,
  onChange,
  suggestions = [],
  loading = false,
  className = ''
}: Readonly<SearchProps>) {
  const [internalQuery, setInternalQuery] = useState('');
  const isControlled = value !== undefined;
  const query = isControlled ? value : internalQuery;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

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
    if (!isControlled) setInternalQuery(nextValue);
    onChange?.(nextValue);
    setShowSuggestions(nextValue.length > 0);
    setFocusedIndex(-1);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch?.(query);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isControlled) setInternalQuery(suggestion);
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
    <div className={`${styles.container} ${className}`} ref={searchRef} role="search">
      <form onSubmit={handleSubmit} className={styles.form}>
        <span className={styles.icon} aria-hidden="true">🔍</span>
        <input
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-activedescendant={focusedIndex >= 0 ? `search-suggestion-${focusedIndex}` : undefined}
          role="combobox"
        />
        {loading && <span className={styles.spinner} aria-label="Loading" role="status" />}
        {query && !loading && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              if (!isControlled) setInternalQuery('');
              onChange?.('');
              setShowSuggestions(false);
            }}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className={styles.suggestions} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              id={`search-suggestion-${index}`}
              type="button"
              className={`${styles.suggestion} ${index === focusedIndex ? styles.focused : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
              role="option"
              aria-selected={index === focusedIndex}
            >
              <span className={styles.suggestionIcon} aria-hidden="true">🔍</span>
              <span className={styles.suggestionText}>{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
