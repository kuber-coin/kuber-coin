'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge } from '../../components/Badge';
import { Tabs } from '../../components/Tabs';
import { Dropdown } from '../../components/Dropdown';
import { CopyButton } from '../../components/CopyButton';
import styles from './rpc.module.css';

interface RPCMethod {
  name: string;
  category: string;
  description: string;
  params: string[];
  requiresAuth: boolean;
}

interface RequestLogEntry {
  method: string;
  params: string;
  timestamp: string;
  status: 'success' | 'error';
}

export default function RPCConsolePage() {
  const [activeTab, setActiveTab] = useState('execute');
  const [selectedMethod, setSelectedMethod] = useState('getblockchaininfo');
  const [params, setParams] = useState('');
  const [response, setResponse] = useState('');
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
  const requestLogNewestFirst = requestLog.toReversed();
  const [authToken, setAuthToken] = useState('');

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '🔌', label: 'RPC Console', href: '/ops/rpc' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '🚨', label: 'Alerts', href: '/alerts' },
    { icon: '🌐', label: 'Network', href: '/network' },
  ];

  const rpcMethods: RPCMethod[] = [
    {
      name: 'getblockchaininfo',
      category: 'blockchain',
      description: 'Returns an object containing various state info regarding blockchain processing',
      params: [],
      requiresAuth: false,
    },
    {
      name: 'getblock',
      category: 'blockchain',
      description: 'Returns an Object with information about block <hash>',
      params: ['hash', 'verbosity'],
      requiresAuth: false,
    },
    {
      name: 'getblockcount',
      category: 'blockchain',
      description: 'Returns the number of blocks in the longest blockchain',
      params: [],
      requiresAuth: false,
    },
    {
      name: 'getmempoolinfo',
      category: 'blockchain',
      description: 'Returns details on the active state of the TX memory pool',
      params: [],
      requiresAuth: false,
    },
    {
      name: 'gettransaction',
      category: 'wallet',
      description: 'Get detailed information about in-wallet transaction',
      params: ['txid', 'include_watchonly'],
      requiresAuth: true,
    },
    {
      name: 'sendtoaddress',
      category: 'wallet',
      description: 'Send an amount to a given address',
      params: ['address', 'amount', 'comment'],
      requiresAuth: true,
    },
    {
      name: 'getpeerinfo',
      category: 'network',
      description: 'Returns data about each connected network node',
      params: [],
      requiresAuth: false,
    },
    {
      name: 'getnetworkinfo',
      category: 'network',
      description: 'Returns an object containing various state info regarding P2P networking',
      params: [],
      requiresAuth: false,
    },
  ];

  const executeRPC = async () => {
    const method = rpcMethods.find(m => m.name === selectedMethod);
    if (!method) return;

    try {
      const parsedParams = params ? JSON.parse(params) : [];
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/rpc', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', method: selectedMethod, params: parsedParams, id: Date.now() }),
      });
      const data = await res.json();
      if (data?.error) {
        throw new Error(data.error.message || 'RPC error');
      }

      setResponse(JSON.stringify(data, null, 2));
      setRequestLog([
        ...requestLog,
        {
          method: selectedMethod,
          params: params || '[]',
          timestamp: new Date().toISOString(),
          status: 'success',
        },
      ]);
    } catch (err: any) {
      setResponse(JSON.stringify({ error: err.message || 'RPC error' }, null, 2));
      setRequestLog([
        ...requestLog,
        {
          method: selectedMethod,
          params: params || '[]',
          timestamp: new Date().toISOString(),
          status: 'error',
        },
      ]);
    }
  };

  const categories = ['all', 'blockchain', 'wallet', 'network', 'mining', 'util'];
  const filteredMethods = rpcMethods.filter(
    m => activeTab === 'all' || m.category === activeTab
  );

  const formatCategoryLabel = (category: string) => {
    if (category === 'all') {
      return `All (${rpcMethods.length})`;
    }

    const count = rpcMethods.filter((m) => m.category === category).length;
    return `${category.charAt(0).toUpperCase() + category.slice(1)} (${count})`;
  };

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>RPC Status Console</h1>
            <p className={styles.subtitle}>
              Execute RPC Methods • Method Documentation • Request/Response Inspection
            </p>
          </div>
          <div className={styles.badges}>
            <Badge variant="default">Status unknown</Badge>
            <Badge variant="default">Rate limit not configured</Badge>
          </div>
        </header>

        <div className={styles.grid}>
          <div className={styles.mainColumn}>
            <Card variant="glass">
              <CardHeader>
                <h3>Execute RPC Method</h3>
              </CardHeader>
              <CardBody>
                <Dropdown
                  label="Select RPC Method"
                  value={selectedMethod}
                  onChange={setSelectedMethod}
                  options={filteredMethods.map(m => ({
                    value: m.name,
                    label: m.name,
                  }))}
                />

                {rpcMethods.find(m => m.name === selectedMethod)?.requiresAuth && (
                  <div className={styles.authWarning}>
                    <span className={styles.warningIcon}>🔒</span>
                    <span>This method requires authentication</span>
                  </div>
                )}

                <div className={styles.methodInfo}>
                  <h4>Description</h4>
                  <p>{rpcMethods.find(m => m.name === selectedMethod)?.description}</p>
                </div>

                {rpcMethods.find(m => m.name === selectedMethod)?.params.length! > 0 && (
                  <>
                    <div className={styles.paramsInfo}>
                      <h4>Parameters</h4>
                      <div className={styles.paramsList}>
                        {rpcMethods.find(m => m.name === selectedMethod)?.params.map(param => (
                          <Badge key={param} variant="default" size="sm">
                            {param}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Input
                      label="Parameters (JSON array)"
                      value={params}
                      onChange={(e) => setParams(e.target.value)}
                      placeholder='["param1", "param2"]'
                    />
                    <p className={styles.helperText}>Enter parameters as JSON array</p>
                  </>
                )}

                <Button variant="primary" size="lg" fullWidth onClick={executeRPC}>
                  ▶ Execute Method
                </Button>
              </CardBody>
            </Card>

            {response && (
              <Card variant="glass">
                <CardHeader>
                  <div className={styles.responseHeader}>
                    <h3>Response</h3>
                    <CopyButton text={response} />
                  </div>
                </CardHeader>
                <CardBody>
                  <pre className={styles.responseCode}>{response}</pre>
                </CardBody>
              </Card>
            )}

            <Card variant="glass">
              <CardHeader>
                <h3>Request Log</h3>
              </CardHeader>
              <CardBody>
                <div className={styles.logContainer}>
                  {requestLog.length === 0 ? (
                    <p className={styles.emptyLog}>No requests yet</p>
                  ) : (
                    requestLogNewestFirst.map((log) => (
                      <div key={`${log.method}-${log.timestamp}`} className={styles.logEntry}>
                        <div className={styles.logHeader}>
                          <code className={styles.logMethod}>{log.method}</code>
                          <Badge variant={log.status === 'success' ? 'success' : 'error'}>
                            {log.status}
                          </Badge>
                        </div>
                        <div className={styles.logDetails}>
                          <span className={styles.logTime}>{log.timestamp}</span>
                          <span className={styles.logParams}>Params: {log.params}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className={styles.sideColumn}>
            <Card variant="glass">
              <CardHeader>
                <h3>Authentication</h3>
              </CardHeader>
              <CardBody>
                <Input
                  label="API Token"
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Enter your API token"
                />
                <div className={styles.authStatus}>
                  {authToken ? (
                    <>
                      <Badge variant="success">✓ Authenticated</Badge>
                      <p className={styles.authText}>Wallet methods available</p>
                    </>
                  ) : (
                    <>
                      <Badge variant="warning">⚠ Not Authenticated</Badge>
                      <p className={styles.authText}>Read-only access</p>
                    </>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <h3>Available Methods</h3>
              </CardHeader>
              <CardBody>
                <Tabs
                  tabs={categories.map(cat => ({
                    id: cat,
                    label: formatCategoryLabel(cat),
                  }))}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  variant="pills"
                />

                <div className={styles.methodsList}>
                  {filteredMethods.map((method) => (
                    <button
                      key={method.name}
                      className={`${styles.methodItem} ${selectedMethod === method.name ? styles.selected : ''}`}
                      onClick={() => setSelectedMethod(method.name)}
                      type="button"
                    >
                      <div className={styles.methodName}>
                        {method.name}
                        {method.requiresAuth && (
                          <Badge variant="warning" size="sm">🔒</Badge>
                        )}
                      </div>
                      <p className={styles.methodDesc}>{method.description}</p>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardBody>
                <h4 className={styles.infoTitle}>⚡ Rate Limits</h4>
                <div className={styles.rateLimitInfo}>
                  <div className={styles.limitRow}>
                    <span>Current:</span>
                    <Badge variant="success">15/100</Badge>
                  </div>
                  <div className={styles.limitRow}>
                    <span>Window:</span>
                    <span>1 minute</span>
                  </div>
                  <div className={styles.limitRow}>
                    <span>Reset:</span>
                    <span>45 seconds</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
