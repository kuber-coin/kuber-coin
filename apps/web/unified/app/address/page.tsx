'use client'
import { useState } from 'react'
import { Activity } from 'lucide-react'

interface BalanceResult {
  address: string
  total: number
  spendable: number
  immature: number
}

export default function AddressPage() {
  const [address, setAddress] = useState('')
  const [result, setResult] = useState<BalanceResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLookup = async () => {
    const addr = address.trim()
    if (!addr) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/balance/${encodeURIComponent(addr)}`)
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText)
        setError(`Not found: ${msg}`)
      } else {
        const data = await res.json()
        setResult({ address: addr, ...data })
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Address / UTXO Explorer
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <Activity className="w-12 h-12 text-indigo-400 mb-4" />
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Enter KuberCoin address..."
              className="flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !address.trim()}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Look Up'}
            </button>
          </div>
          {error && (
            <p className="mt-4 text-red-500">{error}</p>
          )}
          {result && (
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</p>
                  <p className="text-lg font-mono font-bold text-gray-900 dark:text-white">
                    {(result.total / 1e8).toFixed(8)} KC
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Spendable</p>
                  <p className="text-lg font-mono font-bold text-green-600">
                    {(result.spendable / 1e8).toFixed(8)} KC
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Immature</p>
                  <p className="text-lg font-mono font-bold text-orange-500">
                    {(result.immature / 1e8).toFixed(8)} KC
                  </p>
                </div>
              </div>
            </div>
          )}
          {!result && !error && (
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              View address balance, transaction history, and UTXOs
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
