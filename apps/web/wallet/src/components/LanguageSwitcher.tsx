'use client';

import React from 'react';
import i18n, { localeNames, type Locale } from '@/services/i18n';

export default function LanguageSwitcher() {
  const [currentLocale, setCurrentLocale] = React.useState<Locale>(i18n.getCurrentLocale());
  const [isOpen, setIsOpen] = React.useState(false);

  const handleLocaleChange = async (locale: Locale) => {
    await i18n.loadLocale(locale);
    setCurrentLocale(locale);
    setIsOpen(false);
    // Reload page to apply translations throughout the app
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="text-xl">🌐</span>
        <span className="font-medium">{localeNames[currentLocale]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-300 rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            {i18n.getAvailableLocales().map((locale) => (
              <button
                key={locale}
                onClick={() => handleLocaleChange(locale)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  locale === currentLocale ? 'bg-blue-50 font-semibold' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{localeNames[locale]}</span>
                  {locale === currentLocale && (
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
