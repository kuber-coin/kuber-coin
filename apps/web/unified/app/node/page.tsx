'use client'

import { useState, useEffect } from 'react'
import { Activity, Server, Users, Zap, HardDrive } from 'lucide-react'
import { nodeAPI } from '@/lib/api/client'

export default function NodePage() {
  const [nodeInfo, setNodeInfo] = useState<any>(null)
  const [peers, setPeers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNodeData()
    const interval = setInterval(loadNodeData, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  const loadNodeData = async () => {
    try {
      const info = await nodeAPI.getInfo()
      setNodeInfo(info)
      
      const peerInfo = await nodeAPI.getPeerInfo()
      setPeers(peerInfo)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load node data:', error)
      setLoading(false)
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}d ${hours}h ${minutes}m`
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Node Status Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitor node health, performance, and peer connections
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-8 h-8 text-green-500" />
              <span className="text-green-500 font-bold"> ONLINE</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Node Status</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              v{nodeInfo?.version || '1.0.0'}
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <Server className="w-8 h-8 text-blue-500" />
              <span className="text-sm text-gray-500">Blocks</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Block Height</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {nodeInfo?.blocks?.toLocaleString() || 0}
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-indigo-400" />
              <span className="text-sm text-gray-500">Peers</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Connections</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {peers.length}
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-8 h-8 text-yellow-500" />
              <span className="text-sm text-gray-500">H/s</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Hashrate</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {(nodeInfo?.hashrate / 1000000).toFixed(2)} MH/s
            </p>
          </div>
        </div>

        {/* Node Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Node Information
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Version</span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {nodeInfo?.version || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Protocol</span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {nodeInfo?.protocol_version || 0}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Network</span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {nodeInfo?.network || 'testnet'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Uptime</span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {formatUptime(nodeInfo?.uptime || 0)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600 dark:text-gray-400">Difficulty</span>
                <span className="text-gray-900 dark:text-white font-semibold">
                  {nodeInfo?.difficulty?.toFixed(2) || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Peer Connections */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Peer Connections
            </h2>
            {peers.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No peers connected
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {peers.map((peer, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-sm text-gray-900 dark:text-white">
                        {peer.addr}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        peer.inbound 
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                          : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      }`}>
                        {peer.inbound ? 'IN' : 'OUT'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>Height: {peer.startingheight}</span>
                      <span>Ping: {peer.ping}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
