'use client'
import { AlertCircle, Bell, CheckCircle, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Alert {
  id: number
  type: 'info' | 'warning' | 'success' | 'error'
  message: string
  time: Date
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    const evaluate = async () => {
      try {
        const res = await fetch('/api/health')
        if (!res.ok) {
          setAlerts([{ id: 1, type: 'error', message: 'Node unreachable — could not connect to /api/health', time: new Date() }])
          return
        }
        const data = await res.json()
        const generated: Alert[] = []
        let id = 1
        if (data.status === 'ok') {
          generated.push({ id: id++, type: 'success', message: `Node healthy at block height ${data.height ?? '--'}`, time: new Date() })
        } else {
          generated.push({ id: id++, type: 'error', message: `Node status: ${data.status}`, time: new Date() })
        }
        if ((data.peer_count ?? 0) === 0) {
          generated.push({ id: id++, type: 'warning', message: 'No peers connected — node may be isolated', time: new Date() })
        } else {
          generated.push({ id: id++, type: 'info', message: `Node connected to ${data.peer_count} peer(s)`, time: new Date() })
        }
        if ((data.mempool_size ?? 0) > 1000) {
          generated.push({ id: id++, type: 'warning', message: `High mempool size: ${data.mempool_size} unconfirmed transactions`, time: new Date() })
        }
        setAlerts(generated)
      } catch {
        setAlerts([{ id: 1, type: 'error', message: 'Failed to reach node health endpoint', time: new Date() }])
      }
    }
    evaluate()
    const interval = setInterval(evaluate, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
          <Bell className="w-8 h-8 mr-3 text-orange-500" />
          Alert & Incident Panel
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className="p-4 border rounded-lg">
                <div className="flex items-center">
                  {alert.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-500 mr-2" />}
                  {alert.type === 'warning' && <XCircle className="w-5 h-5 text-yellow-500 mr-2" />}
                  {alert.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500 mr-2" />}
                  <span className="font-medium">{alert.message}</span>
                  <span className="ml-auto text-sm text-gray-500">{alert.time.toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}