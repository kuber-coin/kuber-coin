'use client';

import React, { useState } from 'react';
import '../premium-ui.css';

export interface Transaction {
  txid: string;
  type?: 'send' | 'receive' | 'mining' | 'unknown';
  amount: number;
  timestamp?: string;
  confirmations?: number;
  status?: 'confirmed' | 'pending' | 'failed';
  from?: string;
  to?: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  title?: string;
  showViewAll?: boolean;
  maxItems?: number;
  onTransactionClick?: (tx: Transaction) => void;
  onViewAll?: () => void;
}

const formatAddress = (address: string, chars = 8) => {
  if (!address || address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const formatDate = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than 1 minute
  if (diff < 60000) return 'Just now';
  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  // Less than 24 hours
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  // Less than 7 days
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
};

export function TransactionItem({ 
  tx, 
  onClick 
}: { 
  tx: Transaction; 
  onClick?: () => void;
}) {
  const getTypeConfig = (type?: string) => {
    switch (type) {
      case 'send':
        return {
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ),
          iconBg: 'from-rose-500/20 to-rose-600/10',
          iconBorder: 'border-rose-500/20',
          iconColor: 'text-rose-400',
          label: 'Sent',
          amountColor: 'text-rose-400',
          prefix: '-'
        };
      case 'receive':
        return {
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          ),
          iconBg: 'from-emerald-500/20 to-emerald-600/10',
          iconBorder: 'border-emerald-500/20',
          iconColor: 'text-emerald-400',
          label: 'Received',
          amountColor: 'text-emerald-400',
          prefix: '+'
        };
      case 'mining':
        return {
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          ),
          iconBg: 'from-amber-500/20 to-amber-600/10',
          iconBorder: 'border-amber-500/20',
          iconColor: 'text-amber-400',
          label: 'Mining Reward',
          amountColor: 'text-amber-400',
          prefix: '+'
        };
      default:
        return {
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          ),
          iconBg: 'from-blue-500/20 to-blue-600/10',
          iconBorder: 'border-blue-500/20',
          iconColor: 'text-blue-400',
          label: 'Transaction',
          amountColor: 'text-white',
          prefix: ''
        };
    }
  };

  const config = getTypeConfig(tx.type);
  const statusColor = tx.status === 'confirmed' 
    ? 'text-emerald-400' 
    : tx.status === 'failed' 
      ? 'text-red-400' 
      : 'text-amber-400';

  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-4 p-4
        bg-white/[0.02] hover:bg-white/[0.05]
        border border-white/5 hover:border-white/10
        rounded-xl cursor-pointer
        transition-all duration-300
        group
      `}
    >
      {/* Icon */}
      <div className={`
        w-12 h-12 rounded-xl
        bg-gradient-to-br ${config.iconBg}
        border ${config.iconBorder}
        flex items-center justify-center
        ${config.iconColor}
        group-hover:scale-105
        transition-transform duration-300
      `}>
        {config.icon}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white">{config.label}</span>
          {tx.status && (
            <span className={`text-xs ${statusColor} capitalize`}>
              • {tx.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="font-mono truncate">{formatAddress(tx.txid, 12)}</span>
          {tx.timestamp && (
            <>
              <span>•</span>
              <span>{formatDate(tx.timestamp)}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="text-right">
        <div className={`text-lg font-bold ${config.amountColor}`}>
          {config.prefix}{tx.amount.toLocaleString()} KBR
        </div>
        {tx.confirmations !== undefined && (
          <div className="text-xs text-slate-500">
            {tx.confirmations} {tx.confirmations === 1 ? 'confirmation' : 'confirmations'}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div className="text-slate-600 group-hover:text-slate-400 group-hover:translate-x-1 transition-all duration-300">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

export default function TransactionList({
  transactions,
  title = 'Recent Transactions',
  showViewAll = true,
  maxItems = 5,
  onTransactionClick,
  onViewAll,
}: TransactionListProps) {
  const displayedTransactions = maxItems ? transactions.slice(0, maxItems) : transactions;

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">{transactions.length} total</p>
          </div>
        </div>
        
        {showViewAll && onViewAll && (
          <button 
            onClick={onViewAll}
            className="btn-premium btn-ghost text-sm px-4 py-2"
          >
            View All
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Transaction List */}
      <div className="space-y-3">
        {displayedTransactions.length > 0 ? (
          displayedTransactions.map((tx, index) => (
            <TransactionItem
              key={tx.txid || index}
              tx={tx}
              onClick={() => onTransactionClick?.(tx)}
            />
          ))
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">No transactions yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Transactions will appear here when you send or receive KuberCoin
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
