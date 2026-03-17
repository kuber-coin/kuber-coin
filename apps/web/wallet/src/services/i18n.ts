export type Locale = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'ru' | 'pt' | 'ar';

export interface I18nConfig {
  defaultLocale: Locale;
  locales: Locale[];
  rtlLocales: Locale[];
}

export const i18nConfig: I18nConfig = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ru', 'pt', 'ar'],
  rtlLocales: ['ar'], // Right-to-left languages
};

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '简体中文',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  pt: 'Português',
  ar: 'العربية',
};

class I18n {
  private currentLocale: Locale = i18nConfig.defaultLocale;
  private translations: Record<string, any> = {};
  private readonly LOCALE_KEY = 'preferred_locale';

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadLocale(this.getPreferredLocale());
    }
  }

  private getPreferredLocale(): Locale {
    // Check localStorage
    const stored = localStorage.getItem(this.LOCALE_KEY);
    if (stored && i18nConfig.locales.includes(stored as Locale)) {
      return stored as Locale;
    }

    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    if (i18nConfig.locales.includes(browserLang as Locale)) {
      return browserLang as Locale;
    }

    return i18nConfig.defaultLocale;
  }

  async loadLocale(locale: Locale): Promise<void> {
    try {
      const translations = await import(`./locales/${locale}.json`);
      this.translations = translations.default || translations;
      this.currentLocale = locale;
      
      // Save preference
      localStorage.setItem(this.LOCALE_KEY, locale);
      
      // Update document direction for RTL languages
      if (i18nConfig.rtlLocales.includes(locale)) {
        document.documentElement.dir = 'rtl';
      } else {
        document.documentElement.dir = 'ltr';
      }
      
      // Update document language
      document.documentElement.lang = locale;
    } catch (error) {
      console.error(`Failed to load locale ${locale}:`, error);
    }
  }

  t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: any = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key if translation not found
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Replace parameters
    if (params) {
      Object.entries(params).forEach(([param, val]) => {
        value = value.replace(`{${param}}`, String(val));
      });
    }

    return value;
  }

  getCurrentLocale(): Locale {
    return this.currentLocale;
  }

  getAvailableLocales(): Locale[] {
    return i18nConfig.locales;
  }

  isRTL(): boolean {
    return i18nConfig.rtlLocales.includes(this.currentLocale);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.currentLocale, options).format(value);
  }

  formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat(this.currentLocale, {
      style: 'currency',
      currency,
    }).format(value);
  }

  formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.currentLocale, options).format(d);
  }

  formatRelativeTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(this.currentLocale, { numeric: 'auto' });

    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, 'second');
    } else if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    } else if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    } else if (diffInSeconds < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
    } else if (diffInSeconds < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
    }
  }
}

const i18n = new I18n();
export default i18n;
