'use client';

import React from 'react';

export interface Block {
  height: number;
  hash: string;
  timestamp?: string;
  txCount: number;
  size?: number;
  miner?: string;
  reward?: number;
}

interface BlockListProps {
  blocks: Block[];
  title?: string;
  showViewAll?: boolean;
  maxItems?: number;
  onBlockClick?: (block: Block) => void;
  onViewAll?: () => void;
}

const formatAddress = (address: string, chars = 8) => {
  if (!address || address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const formatTimeAgo = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function BlockItem({ 
  block, 
  onClick 
}: { 
  block: Block; 
  onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-4 p-4
        bg-white/[0.02] hover:bg-white/[0.05]
        border border-white/5 hover:border-blue-500/20
        rounded-xl cursor-pointer
        transition-all duration-300
        group
      `}
    >
      {/* Block Height Badge */}
      <div className="
        min-w-[80px] h-14 px-4 rounded-xl
        bg-gradient-to-br from-blue-500/20 to-blue-600/10
        border border-blue-500/20
        flex flex-col items-center justify-center
        group-hover:border-blue-500/40
        transition-all duration-300
      ">
        <span className="text-xs text-blue-400 uppercase tracking-wider">Block</span>
        <span className="text-lg font-bold text-white">#{block.height.toLocaleString()}</span>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="font-mono text-sm text-slate-300 truncate">
            {formatAddress(block.hash, 10)}
          </span>
          {block.timestamp && (
            <span className="text-xs text-slate-500">
              {formatTimeAgo(block.timestamp)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <svg className="w-4 h-4 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            {block.txCount} txs
          </span>
          {block.size && (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              {formatSize(block.size)}
            </span>
          )}
          {block.miner && (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="font-mono truncate max-w-[100px]">{formatAddress(block.miner, 4)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Reward */}
      {block.reward !== undefined && (
        <div className="text-right">
          <div className="text-lg font-bold text-cyan-300">
            +{block.reward.toLocaleString()} KBR
          </div>
          <div className="text-xs text-slate-500">Reward</div>
        </div>
      )}

      {/* Arrow */}
      <div className="text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all duration-300">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

export default function BlockList({
  blocks,
  title = 'Recent Blocks',
  showViewAll = true,
  maxItems = 5,
  onBlockClick,
  onViewAll,
}: BlockListProps) {
  const displayedBlocks = maxItems ? blocks.slice(0, maxItems) : blocks;

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">{blocks.length} blocks</p>
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

      {/* Block List */}
      <div className="space-y-3">
        {displayedBlocks.length > 0 ? (
          displayedBlocks.map((block) => (
            <BlockItem
              key={block.height}
              block={block}
              onClick={() => onBlockClick?.(block)}
            />
          ))
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">No blocks found</p>
            <p className="text-slate-500 text-sm mt-1">
              New blocks will appear here as they are mined
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
