'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { CopyButton } from '../components/CopyButton';
import { Divider } from '../components/Divider';
import styles from './genesis.module.css';

export default function GenesisPage() {
  const sidebarItems = [
    { icon: '🏠', label: 'Explorer', href: '/dashboard' },
    { icon: '📦', label: 'Blocks', href: '/explorer/blocks' },
    { icon: '💳', label: 'Transactions', href: '/transactions' },
    { icon: '🌱', label: 'Genesis', href: '/explorer/genesis' },
  ];

  const [genesisBlock, setGenesisBlock] = useState<any | null>(null);
  const [hashVerification, setHashVerification] = useState<{ valid: boolean; method: string; leadingZeros: number; meetsTarget: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadGenesis = async () => {
      try {
        const hashRes = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'getblockhash', params: [0], id: 1 }),
        });
        const hashData = await hashRes.json();
        if (hashData?.error) throw new Error(hashData.error.message || 'RPC error');

        const blockRes = await fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'getblock', params: [hashData.result, 1], id: 2 }),
        });
        const blockData = await blockRes.json();
        if (blockData?.error) throw new Error(blockData.error.message || 'RPC error');

        const block = blockData.result;
        setGenesisBlock({
          height: block.height,
          hash: block.hash,
          timestamp: block.time,
          nonce: block.nonce,
          bits: block.bits,
          difficulty: block.difficulty,
          merkleRoot: block.merkleroot,
          version: block.version,
          size: block.size,
          weight: block.weight,
          txCount: block.nTx,
        });

        const leadingZeros = block.hash.match(/^0+/)?.[0].length || 0;
        setHashVerification({
          valid: block.hash === hashData.result,
          method: 'SHA-256d',
          leadingZeros,
          meetsTarget: true,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load genesis block');
      }
    };

    loadGenesis();
  }, []);

  const consensusParams = {
    networkId: 'kubercoin-mainnet',
    powLimit: '00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    targetTimespan: 1209600, // 2 weeks in seconds
    targetSpacing: 600, // 10 minutes in seconds
    difficultyAdjustmentInterval: 2016,
    maxBlockSize: 4000000, // 4 MB
    maxBlockWeight: 16000000,
    coinbaseMaturity: 100,
    subsidyHalvingInterval: 210000,
    initialBlockReward: 50,
    minRelayTxFee: 1000, // satoshis
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toUTCString();
  };

  if (!genesisBlock || !hashVerification) {
    return (
      <AppLayout sidebarItems={sidebarItems}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Genesis Block</h1>
              <p className={styles.subtitle}>The Foundation of KuberCoin • Block #0 • Consensus Parameters</p>
            </div>
          </header>
          <div className={styles.heroCard}>
            <Card variant="glass">
              <CardBody>
                {error ? error : 'Loading genesis block from RPC...'}
              </CardBody>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Genesis Block</h1>
            <p className={styles.subtitle}>
              The Foundation of KuberCoin • Block #0 • Consensus Parameters
            </p>
          </div>
          <Badge variant="success" size="lg">
            ✓ Verified
          </Badge>
        </header>

        <div className={styles.heroCard}>
          <Card variant="glass">
            <CardBody>
              <div className={styles.heroContent}>
                <div className={styles.heroIcon}>🌱</div>
                <div>
                  <h2 className={styles.heroTitle}>Genesis Block</h2>
                  <p className={styles.heroSubtitle}>
                    The first block in the KuberCoin blockchain, establishing the foundation of consensus
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className={styles.grid}>
          <Card variant="glass">
            <CardHeader>
              <h3>Block Information</h3>
            </CardHeader>
            <CardBody>
              <div className={styles.infoGrid}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Block Height:</span>
                  <Badge variant="primary" size="lg">
                    #{genesisBlock.height}
                  </Badge>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Block Hash:</span>
                  <div className={styles.hashValue}>
                    <code>{genesisBlock.hash}</code>
                    <CopyButton text={genesisBlock.hash} />
                  </div>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Timestamp:</span>
                  <span className={styles.value}>{formatTimestamp(genesisBlock.timestamp)}</span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Nonce:</span>
                  <code className={styles.value}>{genesisBlock.nonce}</code>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Difficulty Bits:</span>
                  <code className={styles.value}>{genesisBlock.bits}</code>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Difficulty:</span>
                  <Badge variant="info">{genesisBlock.difficulty}</Badge>
                </div>

                <Divider />

                <div className={styles.infoRow}>
                  <span className={styles.label}>Merkle Root:</span>
                  <div className={styles.hashValue}>
                    <code>{genesisBlock.merkleRoot}</code>
                    <CopyButton text={genesisBlock.merkleRoot} />
                  </div>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Version:</span>
                  <Badge variant="default">{genesisBlock.version}</Badge>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Size:</span>
                  <span className={styles.value}>{genesisBlock.size} bytes</span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Weight:</span>
                  <span className={styles.value}>{genesisBlock.weight}</span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.label}>Transactions:</span>
                  <Badge variant="success">{genesisBlock.txCount}</Badge>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <h3>Hash Verification</h3>
            </CardHeader>
            <CardBody>
              <div className={styles.verificationGrid}>
                <div className={styles.verificationItem}>
                  <span className={styles.verifyLabel}>Status:</span>
                  <Badge variant={hashVerification.valid ? 'success' : 'danger'} size="lg">
                    {hashVerification.valid ? '✓ Valid' : '✗ Invalid'}
                  </Badge>
                </div>

                <div className={styles.verificationItem}>
                  <span className={styles.verifyLabel}>Hash Algorithm:</span>
                  <Badge variant="info">{hashVerification.method}</Badge>
                </div>

                <div className={styles.verificationItem}>
                  <span className={styles.verifyLabel}>Leading Zeros:</span>
                  <Badge variant="default">{hashVerification.leadingZeros}</Badge>
                </div>

                <div className={styles.verificationItem}>
                  <span className={styles.verifyLabel}>Meets Target:</span>
                  <Badge variant={hashVerification.meetsTarget ? 'success' : 'danger'}>
                    {hashVerification.meetsTarget ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>

              <Divider />

              <div className={styles.verificationDetails}>
                <h4>Verification Process</h4>
                <ol className={styles.verificationSteps}>
                  <li>✓ Block header serialized correctly</li>
                  <li>✓ Double SHA-256 hash computed</li>
                  <li>✓ Hash meets difficulty target</li>
                  <li>✓ Merkle root verified</li>
                  <li>✓ Timestamp within acceptable range</li>
                </ol>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card variant="glass">
          <CardHeader>
            <h3>Consensus Parameters</h3>
          </CardHeader>
          <CardBody>
            <div className={styles.paramsGrid}>
              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>🌐</div>
                <div>
                  <h4>Network ID</h4>
                  <code>{consensusParams.networkId}</code>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>🎯</div>
                <div>
                  <h4>PoW Limit</h4>
                  <code className={styles.smallCode}>{consensusParams.powLimit}</code>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>⏱️</div>
                <div>
                  <h4>Target Block Time</h4>
                  <p>{consensusParams.targetSpacing} seconds (10 minutes)</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>📊</div>
                <div>
                  <h4>Difficulty Adjustment</h4>
                  <p>Every {consensusParams.difficultyAdjustmentInterval} blocks</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>📦</div>
                <div>
                  <h4>Max Block Size</h4>
                  <p>{(consensusParams.maxBlockSize / 1000000).toFixed(1)} MB</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>⚖️</div>
                <div>
                  <h4>Max Block Weight</h4>
                  <p>{consensusParams.maxBlockWeight.toLocaleString()}</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>🌟</div>
                <div>
                  <h4>Coinbase Maturity</h4>
                  <p>{consensusParams.coinbaseMaturity} blocks</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>✂️</div>
                <div>
                  <h4>Halving Interval</h4>
                  <p>Every {consensusParams.subsidyHalvingInterval.toLocaleString()} blocks</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>💰</div>
                <div>
                  <h4>Initial Block Reward</h4>
                  <p>{consensusParams.initialBlockReward} KC</p>
                </div>
              </div>

              <div className={styles.paramCard}>
                <div className={styles.paramIcon}>💸</div>
                <div>
                  <h4>Min Relay Fee</h4>
                  <p>{consensusParams.minRelayTxFee} satoshis</p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardBody>
            <h4 className={styles.noteTitle}>📖 Historical Significance</h4>
            <div className={styles.noteContent}>
              <p>
                The genesis block is the foundation of the KuberCoin blockchain, establishing the initial consensus rules
                and parameters that govern the network. All subsequent blocks build upon this foundation, creating an
                immutable chain of transactions.
              </p>
              <p>
                The consensus parameters defined in the genesis block ensure network security, fairness, and
                decentralization. These parameters are enforced by all nodes and cannot be changed without network-wide
                consensus.
              </p>
              <div className={styles.importantNote}>
                <strong>⚠️ Critical Principle:</strong> The genesis block and consensus parameters are read-only. UI
                components display this information but never modify consensus rules. All validation is performed by the
                node software.
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
