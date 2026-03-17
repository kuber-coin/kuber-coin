'use client';

import { Card } from '@/components/Card';

interface EventMonitorProps {
  events: any[];
  onRefreshAction: () => void;
}

export function EventMonitor({ events, onRefreshAction }: EventMonitorProps) {
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Contract Events</h3>
        <button
          onClick={onRefreshAction}
          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          🔄 Refresh
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📡</div>
          <p>No events detected</p>
          <p className="text-sm mt-1">Events will appear here as they occur</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {events.map((event) => (
            <Card key={event.id} className="p-4 bg-gray-50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📢</span>
                  <h4 className="font-semibold">{event.eventName}</h4>
                </div>
                <span className="text-xs text-gray-500">
                  Block #{event.blockNumber}
                </span>
              </div>

              <div className="space-y-1 text-sm">
                {Object.entries(event.data).map(([key, value]) => (
                  <div key={key} className="flex">
                    <span className="text-gray-600 w-20">{key}:</span>
                    <span className="font-mono text-xs break-all flex-1">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                {formatTimestamp(event.timestamp)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
