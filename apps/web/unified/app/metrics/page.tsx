'use client'
import { BarChart3, TrendingUp, Activity } from 'lucide-react'

export default function MetricsPage() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Metrics Dashboard
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
              <BarChart3 className="w-6 h-6 mr-2 text-pink-500" />
              Hashrate History
            </h2>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
              <p className="text-gray-500">Chart will render here</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
              <TrendingUp className="w-6 h-6 mr-2 text-blue-500" />
              Difficulty Trend
            </h2>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
              <p className="text-gray-500">Chart will render here</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
              <Activity className="w-6 h-6 mr-2 text-green-500" />
              Transaction Volume
            </h2>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
              <p className="text-gray-500">Chart will render here</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Block Time Distribution
            </h2>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
              <p className="text-gray-500">Chart will render here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
