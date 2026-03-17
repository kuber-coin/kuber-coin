'use client'
import { useState, useEffect } from 'react'
import { Zap, DollarSign } from 'lucide-react'
import { explorerAPI } from '@/lib/api/client'

export default function MempoolPage() {
  const [mempoolInfo, setMempoolInfo] = useState<any>(null)
  const [transactions, setTransactions] = useState<string[]>([])

  useEffect(() => {
    loadMempool()
    const interval = setInterval(loadMempool, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadMempool = async () => {
    try {
      const info = await explorerAPI.getMempoolInfo()
      setMempoolInfo(info)
      const txs = await explorerAPI.getRawMempool()
      setTransactions(txs.slice(0, 20))
    } catch (error) {
      console.error('Failed to load mempool:', error)
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Mempool Viewer
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <Zap className="w-8 h-8 text-yellow-500 mb-2" />
            <p className="text-gray-600 dark:text-gray-400 text-sm">Pending Txs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {mempoolInfo?.size || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <DollarSign className="w-8 h-8 text-green-500 mb-2" />
            <p className="text-gray-600 dark:text-gray-400 text-sm">Total Fees</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(mempoolInfo?.total_fee || 0).toFixed(8)} KBC
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400 text-sm">Memory Usage</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {((mempoolInfo?.bytes || 0) / 1024).toFixed(2)} KB
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Unconfirmed Transactions
          </h2>
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No pending transactions</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((txid, idx) => (
                <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700 rounded font-mono text-sm">
                  {txid}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
