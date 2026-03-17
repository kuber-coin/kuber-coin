'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { explorerAPI } from '@/lib/api/client'

export default function TransactionsPage() {
  const [txid, setTxid] = useState('')
  const [result, setResult] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    const id = txid.trim()
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      setResult(null)
      const tx = await explorerAPI.getTransaction(id)
      setResult(tx)
    } catch (err: any) {
      setError(err.message ?? 'Transaction not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Transaction Explorer
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <input
            type="text"
            value={txid}
            onChange={(e) => setTxid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter transaction ID..."
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="mt-4 bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 flex items-center disabled:opacity-50"
          >
            <Search className="w-5 h-5 mr-2" />
            {loading ? 'Searching…' : 'Search Transaction'}
          </button>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Transaction Details
            </h2>
            <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
