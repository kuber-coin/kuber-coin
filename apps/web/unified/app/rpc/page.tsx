'use client'
import { useState } from 'react'
import { Server, Play } from 'lucide-react'

export default function RPCPage() {
  const [method, setMethod] = useState('getinfo')
  const [params, setParams] = useState('[]')
  const [result, setResult] = useState('')
  
  const executeRPC = async () => {
    try {
      const response = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: JSON.parse(params)
        })
      })
      const data = await response.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult('Error: ' + error)
    }
  }
  
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <Server className="w-8 h-8 mr-3 text-indigo-500" />
          RPC Status Console
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Method
            </label>
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Parameters (JSON Array)
            </label>
            <input
              type="text"
              value={params}
              onChange={(e) => setParams(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            onClick={executeRPC}
            className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 flex items-center"
          >
            <Play className="w-5 h-5 mr-2" />
            Execute RPC Call
          </button>
          {result && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Response
              </label>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto font-mono text-sm">
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
