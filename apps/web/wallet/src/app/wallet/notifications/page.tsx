'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import notificationCenter, { Notification, NotificationPreferences, NotificationType } from '@/services/notificationCenter';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all');

  useEffect(() => {
    loadData();
    
    // Request notification permission
    notificationCenter.requestPermission();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    setNotifications(notificationCenter.getNotifications());
    setPreferences(notificationCenter.getPreferences());
  };

  const handleMarkRead = (id: string) => {
    notificationCenter.markAsRead(id);
    loadData();
  };

  const handleMarkUnread = (id: string) => {
    notificationCenter.markAsUnread(id);
    loadData();
  };

  const handleMarkAllRead = () => {
    notificationCenter.markAllAsRead();
    loadData();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this notification?')) {
      notificationCenter.deleteNotification(id);
      loadData();
    }
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all notifications?')) {
      notificationCenter.clearAll();
      loadData();
    }
  };

  const handleUpdatePreferences = (updates: Partial<NotificationPreferences>) => {
    if (!preferences) return;
    
    const newPrefs = { ...preferences, ...updates };
    notificationCenter.updatePreferences(newPrefs);
    setPreferences(newPrefs);
  };

  const getTypeIcon = (type: NotificationType): string => {
    const icons: Record<NotificationType, string> = {
      transaction: '💸',
      price: '📈',
      portfolio: '💼',
      security: '🔒',
      staking: '⛏️',
      system: '⚙️',
    };
    return icons[type];
  };

  const getTypeColor = (type: NotificationType): string => {
    const colors: Record<NotificationType, string> = {
      transaction: 'bg-green-100 text-green-800',
      price: 'bg-blue-100 text-blue-800',
      portfolio: 'bg-purple-100 text-purple-800',
      security: 'bg-red-100 text-red-800',
      staking: 'bg-yellow-100 text-yellow-800',
      system: 'bg-gray-100 text-gray-800',
    };
    return colors[type];
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filterType !== 'all' && notif.type !== filterType) return false;
    if (filterRead === 'read' && !notif.read) return false;
    if (filterRead === 'unread' && notif.read) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-500 text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowPreferencesModal(true)} variant="secondary">
            ⚙️ Preferences
          </Button>
          {unreadCount > 0 && (
            <Button onClick={handleMarkAllRead} variant="secondary">
              ✓ Mark All Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button onClick={handleClearAll} variant="secondary">
              🗑️ Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Total</div>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Unread</div>
            <div className="text-2xl font-bold text-red-600">{unreadCount}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">Today</div>
            <div className="text-2xl font-bold">
              {notifications.filter(n => {
                const today = new Date();
                const notifDate = new Date(n.timestamp);
                return notifDate.toDateString() === today.toDateString();
              }).length}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-gray-600">This Week</div>
            <div className="text-2xl font-bold">
              {notifications.filter(n => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return new Date(n.timestamp) > weekAgo;
              }).length}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg ${
                  filterType === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All Types
              </button>
              {(['transaction', 'price', 'portfolio', 'security', 'staking', 'system'] as NotificationType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-4 py-2 rounded-lg capitalize ${
                    filterType === type
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {getTypeIcon(type)} {type}
                </button>
              ))}
            </div>
            <div className="border-l border-gray-300 mx-2"></div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterRead('all')}
                className={`px-4 py-2 rounded-lg ${
                  filterRead === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterRead('unread')}
                className={`px-4 py-2 rounded-lg ${
                  filterRead === 'unread'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Unread
              </button>
              <button
                onClick={() => setFilterRead('read')}
                className={`px-4 py-2 rounded-lg ${
                  filterRead === 'read'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Read
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔔</div>
              <h2 className="text-xl font-semibold mb-2">No notifications</h2>
              <p className="text-gray-600">
                {filterType !== 'all' || filterRead !== 'all'
                  ? 'No notifications match your filters'
                  : "You're all caught up!"}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map(notif => (
            <Card key={notif.id}>
              <CardBody>
                <div className={`flex items-start gap-4 ${!notif.read ? 'font-semibold' : ''}`}>
                  <div className="text-3xl">{getTypeIcon(notif.type)}</div>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg">{notif.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs ${getTypeColor(notif.type)}`}>
                          {notif.type}
                        </span>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(notif.timestamp).toLocaleString()}
                      </div>
                    </div>
                    
                    <p className={`text-sm mb-3 ${!notif.read ? 'text-gray-900' : 'text-gray-600'}`}>
                      {notif.message}
                    </p>

                    {notif.actionUrl && (
                      <a
                        href={notif.actionUrl}
                        className="text-sm text-blue-600 hover:text-blue-800 mb-3 inline-block"
                      >
                        {notif.actionText || 'View Details'} →
                      </a>
                    )}

                    <div className="flex gap-2">
                      {!notif.read ? (
                        <button
                          onClick={() => handleMarkRead(notif.id)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Mark as Read
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkUnread(notif.id)}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Mark as Unread
                        </button>
                      )}
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => handleDelete(notif.id)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Preferences Modal */}
      {showPreferencesModal && preferences && (
        <Modal
          isOpen={showPreferencesModal}
          onCloseAction={() => setShowPreferencesModal(false)}
          title="Notification Preferences"
        >
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Desktop Notifications</h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.desktopNotifications}
                  onChange={(e) => handleUpdatePreferences({ desktopNotifications: e.target.checked })}
                />
                <span>Enable desktop notifications</span>
              </label>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Sound</h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => handleUpdatePreferences({ soundEnabled: e.target.checked })}
                />
                <span>Play sound for notifications</span>
              </label>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Email Notifications</h3>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications}
                  onChange={(e) => handleUpdatePreferences({ emailNotifications: e.target.checked })}
                />
                <span>Send email notifications</span>
              </label>
              <input
                type="email"
                value={preferences.email || ''}
                onChange={(e) => handleUpdatePreferences({ email: e.target.value })}
                placeholder="your@email.com"
                className="w-full px-3 py-2 border rounded-lg"
                disabled={!preferences.emailNotifications}
              />
            </div>

            <div>
              <h3 className="font-semibold mb-3">Notification Types</h3>
              <div className="space-y-2">
                {Object.entries(preferences.types).map(([type, enabled]) => (
                  <label key={type} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => handleUpdatePreferences({
                        types: { ...preferences.types, [type]: e.target.checked }
                      })}
                    />
                    <span className="capitalize">{getTypeIcon(type as NotificationType)} {type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Price Alerts</h3>
              {preferences.priceAlerts.map((alert, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <select
                    value={alert.condition}
                    onChange={(e) => {
                      const newAlerts = [...preferences.priceAlerts];
                      newAlerts[index].condition = e.target.value as 'above' | 'below';
                      handleUpdatePreferences({ priceAlerts: newAlerts });
                    }}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  <input
                    type="number"
                    value={alert.price}
                    onChange={(e) => {
                      const newAlerts = [...preferences.priceAlerts];
                      newAlerts[index].price = parseFloat(e.target.value);
                      handleUpdatePreferences({ priceAlerts: newAlerts });
                    }}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    placeholder="Price (USD)"
                  />
                  <button
                    onClick={() => {
                      const newAlerts = preferences.priceAlerts.filter((_, i) => i !== index);
                      handleUpdatePreferences({ priceAlerts: newAlerts });
                    }}
                    className="px-3 py-2 bg-red-500 text-white rounded-lg"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                onClick={() => {
                  handleUpdatePreferences({
                    priceAlerts: [...preferences.priceAlerts, { condition: 'above', price: 50000 }]
                  });
                }}
                variant="secondary"
              >
                ➕ Add Price Alert
              </Button>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Portfolio Alerts</h3>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={preferences.portfolioAlerts.enabled}
                  onChange={(e) => handleUpdatePreferences({
                    portfolioAlerts: { ...preferences.portfolioAlerts, enabled: e.target.checked }
                  })}
                />
                <span>Alert on portfolio changes</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={preferences.portfolioAlerts.changePercent}
                  onChange={(e) => handleUpdatePreferences({
                    portfolioAlerts: { ...preferences.portfolioAlerts, changePercent: parseFloat(e.target.value) }
                  })}
                  className="w-32 px-3 py-2 border rounded-lg"
                  disabled={!preferences.portfolioAlerts.enabled}
                />
                <span className="py-2">% change in 24h</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button onClick={() => setShowPreferencesModal(false)} variant="secondary">
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
