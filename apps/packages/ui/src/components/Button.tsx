'use client';

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses = {
  primary: 'bg-[linear-gradient(135deg,#7277ff_0%,#8791ff_48%,#a8b5ff_100%)] text-white shadow-[0_18px_38px_rgba(109,114,255,0.28)] hover:-translate-y-0.5 hover:shadow-[0_24px_44px_rgba(109,114,255,0.34)]',
  secondary: 'bg-white/85 border border-[rgba(124,140,255,0.14)] text-[var(--kc-text-bright)] hover:bg-white hover:border-[rgba(124,140,255,0.28)]',
  ghost: 'text-[var(--kc-muted-strong)] hover:bg-[rgba(109,114,255,0.08)] hover:text-[var(--kc-text-bright)]',
  danger: 'bg-[linear-gradient(135deg,#df6882_0%,#d94d6c_48%,#ef7b93_100%)] text-white shadow-[0_18px_38px_rgba(217,77,108,0.22)] hover:-translate-y-0.5 hover:shadow-[0_24px_44px_rgba(217,77,108,0.28)]',
  outline: 'bg-transparent border border-[rgba(109,114,255,0.35)] text-[var(--kc-accent)] hover:bg-[rgba(109,114,255,0.06)]',
  success: 'bg-[linear-gradient(135deg,#4db89b_0%,#67c7af_48%,#99e0d0_100%)] text-white shadow-[0_16px_36px_rgba(77,184,155,0.24)] hover:-translate-y-0.5 hover:shadow-[0_24px_42px_rgba(77,184,155,0.3)]',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5',
  lg: 'px-7 py-3 text-lg',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon, fullWidth = false, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}

export default Button;
