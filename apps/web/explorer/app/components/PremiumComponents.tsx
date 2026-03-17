'use client';

import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'gold' | 'green' | 'purple';
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export function GlassCard({ 
  children, 
  variant = 'default', 
  className = '', 
  hover = true,
  glow = false,
  onClick 
}: GlassCardProps) {
  const baseClasses = `
    relative overflow-hidden
    bg-gradient-to-br from-[rgba(20,30,57,0.94)] via-[rgba(12,18,37,0.9)] to-[rgba(7,10,22,0.92)]
    backdrop-blur-xl
    border border-[color:var(--kc-glass-border)]
    rounded-3xl
    p-6
    transition-all duration-400 ease-out
    ${hover ? 'hover:-translate-y-1 hover:shadow-2xl hover:border-[color:rgba(124,149,255,0.34)]' : ''}
    ${glow ? 'shadow-[0_0_40px_rgba(98,126,234,0.18)]' : 'shadow-xl'}
    ${onClick ? 'cursor-pointer' : ''}
  `;

  const variantClasses = {
    default: 'hover:shadow-[0_20px_60px_rgba(98,126,234,0.18)]',
    gold: 'hover:shadow-[0_20px_60px_rgba(89,211,255,0.16)] hover:border-[color:rgba(89,211,255,0.3)]',
    green: 'hover:shadow-emerald-500/20 hover:border-emerald-500/30',
    purple: 'hover:shadow-[0_20px_60px_rgba(167,139,250,0.16)] hover:border-[color:rgba(167,139,250,0.3)]',
  };

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
    >
      {/* Top shine effect */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(124,149,255,0.45)] to-transparent" />
      {children}
    </div>
  );
}

interface PremiumButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'gold' | 'success' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export function PremiumButton({ 
  children, 
  variant = 'primary', 
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
  icon,
  onClick,
  type = 'button'
}: PremiumButtonProps) {
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm rounded-lg',
    md: 'px-6 py-3 text-base rounded-xl',
    lg: 'px-8 py-4 text-lg rounded-2xl',
  };

  const variantClasses = {
    primary: `
      bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400
      text-white font-semibold
      shadow-lg shadow-indigo-500/30
      hover:shadow-xl hover:shadow-indigo-500/40
      hover:-translate-y-0.5
      active:translate-y-0
    `,
    gold: `
      bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-300
      text-white font-semibold
      shadow-lg shadow-cyan-500/25
      hover:shadow-xl hover:shadow-cyan-500/35
      hover:-translate-y-0.5
    `,
    success: `
      bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400
      text-white font-semibold
      shadow-lg shadow-emerald-500/30
      hover:shadow-xl hover:shadow-emerald-500/40
      hover:-translate-y-0.5
    `,
    danger: `
      bg-gradient-to-r from-red-600 via-red-500 to-orange-500
      text-white font-semibold
      shadow-lg shadow-red-500/30
      hover:shadow-xl hover:shadow-red-500/40
      hover:-translate-y-0.5
    `,
    ghost: `
      bg-[rgba(16,24,48,0.62)] border border-[color:var(--kc-glass-border)]
      text-[color:var(--kc-text)] font-medium
      hover:bg-[rgba(21,31,61,0.82)] hover:border-[color:rgba(124,149,255,0.28)]
      hover:-translate-y-0.5
    `,
    outline: `
      bg-transparent border-2 border-[color:var(--kc-accent)]
      text-[color:var(--kc-accent-blue)] font-semibold
      hover:bg-[rgba(98,126,234,0.12)]
      hover:shadow-lg hover:shadow-indigo-500/20
      hover:-translate-y-0.5
    `,
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center gap-2
        transition-all duration-300 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        overflow-hidden
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {/* Shine effect on hover */}
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-full transition-transform duration-700" />
      
      {loading ? (
        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : icon}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

interface StatCardPremiumProps {
  icon: string | React.ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string; direction: 'up' | 'down' };
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  className?: string;
}

export function StatCardPremium({ 
  icon, 
  label, 
  value, 
  trend, 
  variant = 'blue',
  className = '' 
}: StatCardPremiumProps) {
  const gradients = {
    blue: 'from-indigo-500 via-blue-400 to-cyan-400',
    gold: 'from-sky-500 via-cyan-400 to-blue-300',
    green: 'from-emerald-500 via-emerald-400 to-teal-400',
    purple: 'from-violet-500 via-indigo-400 to-blue-300',
  };

  const iconBgs = {
    blue: 'from-indigo-500/20 to-blue-500/5 border-indigo-500/20',
    gold: 'from-sky-500/20 to-cyan-500/5 border-cyan-500/20',
    green: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
    purple: 'from-violet-500/20 to-indigo-500/5 border-violet-500/20',
  };

  return (
    <div className={`
      relative bg-gradient-to-br from-[rgba(16,24,48,0.9)] to-[rgba(8,12,26,0.86)]
      backdrop-blur-lg
      border border-[color:var(--kc-glass-border)]
      rounded-2xl p-6
      overflow-hidden
      transition-all duration-400 ease-out
      hover:-translate-y-1 hover:scale-[1.02]
      hover:border-[color:rgba(124,149,255,0.3)]
      hover:shadow-xl hover:shadow-indigo-500/10
      ${className}
    `}>
      {/* Top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradients[variant]}`} />
      
      {/* Icon */}
      <div className={`
        w-14 h-14 rounded-2xl mb-4
        flex items-center justify-center
        bg-gradient-to-br ${iconBgs[variant]}
        border text-2xl
      `}>
        {icon}
      </div>
      
      {/* Value */}
      <div className="text-3xl font-bold text-[color:var(--kc-text-bright)] mb-1">
        {value}
      </div>
      
      {/* Label */}
      <div className="text-sm text-[color:var(--kc-muted)] uppercase tracking-wide">
        {label}
      </div>
      
      {/* Trend */}
      {trend && (
        <div className={`
          inline-flex items-center gap-1 mt-3
          px-3 py-1 rounded-full text-xs font-semibold
          ${trend.direction === 'up' 
            ? 'bg-emerald-500/15 text-emerald-400' 
            : 'bg-red-500/15 text-red-400'}
        `}>
          <span>{trend.direction === 'up' ? '↑' : '↓'}</span>
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'purple';
  pulse?: boolean;
  className?: string;
}

export function Badge({ 
  children, 
  variant = 'primary', 
  pulse = false,
  className = '' 
}: BadgeProps) {
  const variants = {
    primary: 'from-indigo-500/20 to-blue-500/10 text-blue-300 border-indigo-500/30',
    success: 'from-emerald-500/20 to-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warning: 'from-sky-500/20 to-cyan-500/10 text-cyan-300 border-cyan-500/30',
    danger: 'from-red-500/20 to-red-500/10 text-red-400 border-red-500/30',
    purple: 'from-violet-500/20 to-indigo-500/10 text-violet-300 border-violet-500/30',
  };

  return (
    <span className={`
      inline-flex items-center gap-1.5
      px-3 py-1.5
      bg-gradient-to-r ${variants[variant]}
      border rounded-full
      text-xs font-semibold uppercase tracking-wide
      ${className}
    `}>
      {pulse && (
        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({ 
  value, 
  max = 100, 
  variant = 'blue',
  size = 'md',
  showLabel = false,
  className = '' 
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const gradients = {
    blue: 'from-indigo-600 via-blue-500 to-cyan-400',
    gold: 'from-sky-600 via-cyan-500 to-blue-300',
    green: 'from-emerald-600 via-emerald-500 to-teal-400',
    purple: 'from-violet-600 via-indigo-500 to-blue-300',
  };

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  return (
    <div className={`w-full ${className}`}>
      <div className={`
        w-full ${sizes[size]} 
        bg-white/10 rounded-full overflow-hidden
      `}>
        <div 
          className={`
            h-full rounded-full
            bg-gradient-to-r ${gradients[variant]}
            transition-all duration-500 ease-out
            relative overflow-hidden
          `}
          style={{ width: `${percentage}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      {showLabel && (
        <div className="text-right mt-1 text-sm text-slate-400">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}

interface TransactionItemProps {
  txid: string;
  amount?: string | number;
  type?: 'send' | 'receive';
  timestamp?: string;
  confirmations?: number;
  onClick?: () => void;
  className?: string;
}

export function TransactionItem({
  txid,
  amount,
  type = 'send',
  timestamp,
  confirmations,
  onClick,
  className = ''
}: TransactionItemProps) {
  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-4 p-4
        bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(98,126,234,0.12)]
        border border-white/5 hover:border-[rgba(124,149,255,0.2)]
        rounded-xl
        cursor-pointer
        transition-all duration-300 ease-out
        hover:translate-x-1
        ${className}
      `}
    >
      {/* Icon */}
      <div className={`
        w-11 h-11 rounded-xl
        flex items-center justify-center
        text-lg
        ${type === 'receive' 
          ? 'bg-emerald-500/20 text-emerald-400' 
          : 'bg-blue-500/20 text-blue-400'}
      `}>
        {type === 'receive' ? '↓' : '↑'}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-[color:var(--kc-text)] truncate">
          {txid}
        </div>
        {timestamp && (
          <div className="text-xs text-[color:var(--kc-muted)] mt-0.5">
            {timestamp}
          </div>
        )}
      </div>
      
      {/* Amount & Status */}
      <div className="text-right">
        {amount && (
          <div className={`font-semibold ${type === 'receive' ? 'text-emerald-400' : 'text-blue-300'}`}>
            {type === 'receive' ? '+' : '-'}{amount}
          </div>
        )}
        {confirmations !== undefined && (
          <div className={`text-xs mt-0.5 ${confirmations > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {confirmations > 0 ? `${confirmations} conf` : 'Pending'}
          </div>
        )}
      </div>
      
      {/* Arrow */}
      <div className="text-[color:var(--kc-muted)]">
        →
      </div>
    </div>
  );
}

// Export shimmer animation keyframes
export const shimmerKeyframes = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;
