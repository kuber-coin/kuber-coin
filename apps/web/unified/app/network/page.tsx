'use client'
import { Network as NetworkIcon } from 'lucide-react'

export default function NetworkPage() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Network Monitor
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
          <NetworkIcon className="w-16 h-16 text-cyan-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Network Topology
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Track network topology and peer connections in real-time
          </p>
        </div>
      </div>
    </div>
  )
}
