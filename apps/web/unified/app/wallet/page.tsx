'use client'

import { useState, useEffect } from 'react'
import { Wallet, Send, QrCode, Copy, Plus } from 'lucide-react'
import { walletAPI } from '@/lib/api/client'

export default function WalletPage() {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<any[]>([])
  const [recipientAddress, setRecipientAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [showQR, setShowQR] = useState(false)

  useEffect(() => {
    const storedAddress = localStorage.getItem('wallet_address')
    if (storedAddress) {
      setAddress(storedAddress)
      loadWalletData(storedAddress)
    }
  }, [])

  const loadWalletData = async (addr: string) => {
    try {
      const bal = await walletAPI.getBalance(addr)
      setBalance(bal)
      
      const txs = await walletAPI.listTransactions(addr, 20)
      setTransactions(txs)
    } catch (error) {
      console.error('Failed to load wallet data:', error)
    }
  }

  const createNewWallet = () => {
    alert('Wallet creation requires a configured wallet backend.')
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(address)
    alert('Address copied to clipboard!')
  }

  const sendTransaction = async () => {
    if (!recipientAddress || !amount) {
      alert('Please enter recipient address and amount')
      return
    }

    alert('Sending transactions requires a configured wallet backend.')
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Web Wallet
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your KuberCoin wallet and transactions
          </p>
        </div>

        {!address ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <Wallet className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              No Wallet Found
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create a new wallet to get started
            </p>
            <button
              onClick={createNewWallet}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 flex items-center mx-auto"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create New Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Balance Card */}
            <div className="bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 rounded-lg shadow-lg p-8 text-white">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-blue-100/80 mb-2">Total Balance</p>
                  <h2 className="text-4xl font-bold">{balance.toFixed(8)} KBC</h2>
                </div>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="bg-white/20 hover:bg-white/30 p-3 rounded-lg"
                >
                  <QrCode className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex items-center bg-white/10 rounded p-3 mt-4">
                <span className="flex-1 font-mono text-sm truncate">{address}</span>
                <button onClick={copyAddress} className="ml-2 hover:bg-white/20 p-2 rounded">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Send Transaction */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
                <Send className="w-5 h-5 mr-2 text-orange-500" />
                Send KuberCoin
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white"
                    placeholder="KC1..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Amount (KBC)
                  </label>
                  <input
                    type="number"
                    step="0.00000001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white"
                    placeholder="0.00000000"
                  />
                </div>
                
                <button
                  onClick={sendTransaction}
                  className="w-full bg-orange-500 text-white py-3 rounded-lg hover:bg-orange-600 font-semibold"
                >
                  Send Transaction
                </button>
              </div>
            </div>

            {/* Transaction History */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Recent Transactions
              </h3>
              
              {transactions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <p className="font-mono text-sm text-gray-900 dark:text-white">
                          {tx.txid.substring(0, 16)}...
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(tx.timestamp * 1000).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {tx.value > 0 ? '+' : ''}{tx.value} KBC
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {tx.confirmations} confirmations
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
