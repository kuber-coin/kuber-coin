'use client'
import { GitFork, AlertTriangle, RefreshCw } from 'lucide-react'

export default function ForksPage() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <GitFork className="w-8 h-8 mr-3 text-violet-500" />
          Fork & Reorganization Monitor
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <RefreshCw className="w-10 h-10 text-blue-500 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Reorganizations
            </h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">0</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Last 24 hours</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <GitFork className="w-10 h-10 text-violet-500 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Active Forks
            </h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">0</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Currently detected</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <AlertTriangle className="w-10 h-10 text-orange-500 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Chain Quality
            </h3>
            <p className="text-3xl font-bold text-green-500">Stable</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">No issues detected</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Recent Events
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No fork or reorganization events detected
          </p>
        </div>
      </div>
    </div>
  )
}
