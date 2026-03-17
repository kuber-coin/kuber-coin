'use client'
import { useState, useEffect } from 'react'
import { Database, Hash, Calendar, Code } from 'lucide-react'

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  })
  const j = await res.json()
  return j.result
}

export default function GenesisPage() {
  const [genesisBlock, setGenesisBlock] = useState<{
    height: number
    hash: string
    timestamp: string
    nonce: number
    difficulty: number
    message: string
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const hash = await rpc('getblockhash', [0])
        if (!hash) return
        const block = await rpc('getblock', [hash, 2])
        if (!block) return
        const coinbaseTx = block.tx?.[0]
        const scriptSig: string = coinbaseTx?.vin?.[0]?.coinbase ?? ''
        let message = 'KuberCoin Genesis'
        try {
          const bytes = scriptSig.match(/.{1,2}/g)?.map((h: string) => parseInt(h, 16)) ?? []
          const text = String.fromCharCode(...bytes.filter((b: number) => b >= 32 && b < 127))
          if (text.trim().length > 6) message = text.trim()
        } catch { /* use default */ }
        setGenesisBlock({
          height: 0,
          hash: block.hash ?? hash,
          timestamp: block.time ? new Date(block.time * 1000).toLocaleString() : '--',
          nonce: block.nonce ?? 0,
          difficulty: block.difficulty ?? 0,
          message,
        })
      } catch { /* leave null */ }
    }
    load()
  }, [])

  const blockHash = genesisBlock?.hash ?? '--'
  const blockTimestamp = genesisBlock?.timestamp ?? '--'
  const blockDifficulty = genesisBlock?.difficulty ?? '--'
  const blockMessage = genesisBlock?.message ?? 'Not available'
  
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Genesis Block Viewer
        </h1>
        <div className="bg-gradient-to-r from-gray-700 to-gray-900 rounded-lg shadow-lg p-8 text-white mb-6">
          <h2 className="text-2xl font-bold mb-4">Block #0</h2>
          <p className="text-gray-300 mb-2">{genesisBlock ? `Mined at height 0 · ${genesisBlock.timestamp}` : 'Loading…'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div className="flex items-start pb-4 border-b border-gray-200 dark:border-gray-700">
            <Hash className="w-6 h-6 text-gray-500 mr-3 mt-1" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Block Hash</p>
              <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                {blockHash}
              </p>
            </div>
          </div>
          <div className="flex items-start pb-4 border-b border-gray-200 dark:border-gray-700">
            <Calendar className="w-6 h-6 text-gray-500 mr-3 mt-1" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Timestamp</p>
              <p className="text-gray-900 dark:text-white">{blockTimestamp}</p>
            </div>
          </div>
          <div className="flex items-start pb-4 border-b border-gray-200 dark:border-gray-700">
            <Database className="w-6 h-6 text-gray-500 mr-3 mt-1" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Difficulty</p>
              <p className="text-gray-900 dark:text-white">{blockDifficulty}</p>
            </div>
          </div>
          <div className="flex items-start">
            <Code className="w-6 h-6 text-gray-500 mr-3 mt-1" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Genesis Message</p>
              <p className="text-gray-900 dark:text-white font-semibold">{blockMessage}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
