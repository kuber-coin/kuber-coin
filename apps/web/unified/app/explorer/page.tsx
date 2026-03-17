'use client'

import { useState, useEffect, useCallback } from 'react'
import { Database, Search, Box, Clock } from 'lucide-react'
import { explorerAPI } from '@/lib/api/client'
import type { Block } from '@/lib/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function ExplorerPage() {
  const router = useRouter()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    loadBlocks()
  }, [])

  const loadBlocks = async () => {
    try {
      setLoading(true)
      const latestBlocks = await explorerAPI.getLatestBlocks(15)
      setBlocks(latestBlocks)
    } catch (error) {
      console.error('Failed to load blocks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearchError(null)
    try {
      if (/^\d+$/.test(q)) {
        const block = await explorerAPI.getBlock(parseInt(q))
        router.push(`/block/${block.hash ?? q}`)
      } else if (q.length === 64) {
        // Could be block hash or txid — try block first
        try {
          await explorerAPI.getBlock(q)
          router.push(`/block/${q}`)
        } catch {
          router.push(`/tx/${q}`)
        }
      } else {
        setSearchError('Enter a block height, block hash, or transaction ID')
      }
    } catch {
      setSearchError('Not found')
    }
  }, [searchQuery, router])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Block Explorer
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Browse blocks and explore the KuberCoin blockchain
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by block height, hash, or transaction ID..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={handleSearch}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 flex items-center"
            >
              <Search className="w-5 h-5 mr-2" />
              Search
            </button>
          </div>
          {searchError && (
            <p className="mt-3 text-sm text-red-500">{searchError}</p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Latest Block</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {blocks[0]?.height || 0}
                </p>
              </div>
              <Box className="w-10 h-10 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Difficulty</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {blocks[0]?.difficulty.toFixed(2) || 0}
                </p>
              </div>
              <Database className="w-10 h-10 text-indigo-400" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Transactions</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {blocks[0]?.transactions.length || 0}
                </p>
              </div>
              <Search className="w-10 h-10 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Block Time</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">--</p>
              </div>
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
          </div>
        </div>

        {/* Recent Blocks Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recent Blocks
            </h2>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-4">Loading blocks...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Height
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Hash
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Txs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Difficulty
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {blocks.map((block) => (
                    <tr key={block.hash} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/block/${block.hash}`} className="text-blue-500 hover:text-blue-600 font-semibold">
                          {block.height}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900 dark:text-white">
                        {block.hash.substring(0, 16)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(block.timestamp * 1000).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {block.transactions.length}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {block.difficulty.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
