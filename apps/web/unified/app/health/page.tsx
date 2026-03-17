'use client'
import { useState, useEffect } from 'react'
import { Globe, TrendingUp, Activity, Users, Cpu } from 'lucide-react'

interface NodeStats {
  online: boolean
  blockHeight: number | null
  mempoolSize: number | null
  peerCount: number | null
  network: string | null
  version: string | null
}

export default function HealthPage() {
  const [stats, setStats] = useState<NodeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        setLastUpdated(new Date())
      }
    } catch {
      setStats({ online: false, blockHeight: null, mempoolSize: null, peerCount: null, network: null, version: null })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30_000)
    return () => clearInterval(interval)
  }, [])

  const fmt = (v: number | null | undefined, fallback = '—') =>
    v !== null && v !== undefined ? v.toLocaleString() : fallback

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Chain Health Dashboard
          </h1>
          <div className="flex items-center gap-3">
            {stats && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                stats.online
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${stats.online ? 'bg-green-500' : 'bg-red-500'}`} />
                {stats.online ? 'Node Online' : 'Node Offline'}
              </span>
            )}
            {lastUpdated && (
              <span className="text-xs text-gray-400">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-pulse">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <Globe className="w-10 h-10 text-teal-500 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Network</h3>
              <p className="text-2xl font-bold text-teal-500">{stats?.network ?? '—'}</p>
              <p className="text-sm text-gray-500 mt-1">Node {stats?.version ?? ''}</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <TrendingUp className="w-10 h-10 text-blue-500 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Block Height</h3>
              <p className={`text-3xl font-bold ${stats?.online ? 'text-blue-500' : 'text-gray-400'}`}>
                {fmt(stats?.blockHeight)}
              </p>
              <p className="text-sm text-gray-500 mt-1">Current chain tip</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <Activity className="w-10 h-10 text-indigo-400 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Mempool</h3>
              <p className={`text-3xl font-bold ${stats?.online ? 'text-indigo-400' : 'text-gray-400'}`}>
                {fmt(stats?.mempoolSize)}
              </p>
              <p className="text-sm text-gray-500 mt-1">Pending transactions</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <Users className="w-10 h-10 text-orange-500 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Peers</h3>
              <p className={`text-3xl font-bold ${stats?.online ? 'text-orange-500' : 'text-gray-400'}`}>
                {fmt(stats?.peerCount)}
              </p>
              <p className="text-sm text-gray-500 mt-1">Connected nodes</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:col-span-2">
              <Cpu className="w-10 h-10 text-emerald-500 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Node Status</h3>
              <p className={`text-3xl font-bold ${stats?.online ? 'text-emerald-500' : 'text-red-500'}`}>
                {stats?.online ? 'Operational' : 'Unavailable'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {stats?.online
                  ? `KuberCoin ${stats.version ?? ''} — ${stats.network ?? ''} network`
                  : 'Node unreachable — check connection'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
