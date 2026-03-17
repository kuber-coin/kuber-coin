'use client'
import { Droplets } from 'lucide-react'
import { useState } from 'react'

export default function FaucetPage() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const faucetUrl = process.env.NEXT_PUBLIC_FAUCET_URL || ''
  
  const claimFaucet = async () => {
    if (!address) {
      alert('Please enter an address')
      return
    }
    if (!faucetUrl) {
      setError('Faucet API not configured')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${faucetUrl}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      alert('Faucet claim successful! TX: ' + data.txid)
    } catch (error) {
      setError('Faucet claim failed')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center justify-center">
          <Droplets className="w-8 h-8 mr-3 text-blue-400" />
          Testnet Faucet
        </h1>
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg shadow-lg p-8 text-white text-center mb-6">
          <h2 className="text-2xl font-bold mb-4">Get Free Testnet Coins</h2>
          <p className="mb-2">Receive 10 KBC for testing</p>
          <p className="text-sm text-blue-100">Limited to 1 claim per hour</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Your KuberCoin Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="KC1..."
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white mb-4"
          />
          <button
            onClick={claimFaucet}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 font-semibold disabled:opacity-50"
          >
            {loading ? 'Claiming...' : 'Claim Testnet Coins'}
          </button>
        </div>
      </div>
    </div>
  )
}
