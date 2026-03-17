# KuberCoin Wallet - Developer Guide

Complete technical documentation for developers building with or contributing to KuberCoin Wallet.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Getting Started](#getting-started)
3. [Project Structure](#project-structure)
4. [Services API Reference](#services-api-reference)
5. [Component Library](#component-library)
6. [State Management](#state-management)
7. [Testing](#testing)
8. [Contributing](#contributing)

---

## Architecture Overview

### Technology Stack

- **Framework**: Next.js 15.1.10 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 3.4.17 + CSS Modules
- **Charts**: Recharts
- **Testing**: Playwright (E2E), Vitest (Unit)
- **Build**: Turbopack
- **Deployment**: Docker + Kubernetes

### System Architecture

```text
┌─────────────────────────────────────────┐
│          User Interface (React)          │
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ Wallet │  │  Send  │  │Receive │   │
│  └────────┘  └────────┘  └────────┘   │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│        Services Layer (Business Logic)   │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐│
│  │ Wallet   │ │ MultirSig│ │ Staking ││
│  │ Service  │ │ Service  │ │ Service ││
│  └──────────┘ └──────────┘ └─────────┘│
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      Data Persistence (localStorage)     │
│  ┌──────────────────────────────────┐  │
│  │ Encrypted Wallet Data            │  │
│  │ Transaction History              │  │
│  │ Settings & Preferences           │  │
│  └──────────────────────────────────┘  │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│    Blockchain Node (REST API)            │
│  ┌──────────────────────────────────┐  │
│  │ Block Data                       │  │
│  │ Transaction Submission           │  │
│  │ UTXO Queries                     │  │
│  └──────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Design Patterns

1. **Service Layer Pattern**: Business logic separated from UI
2. **Singleton Pattern**: Single instance of each service
3. **Observer Pattern**: Real-time updates via useEffect
4. **Factory Pattern**: Wallet creation abstracted
5. **Repository Pattern**: Data access abstracted
6. **Strategy Pattern**: Multiple encryption strategies

---

## Getting Started

### Prerequisites

```bash
# Required
Node.js >= 18.0.0
npm >= 9.0.0
Git

# Optional
Docker >= 20.0.0
Kubernetes >= 1.25.0
```

### Installation

```bash
# Clone repository
git clone https://github.com/kubercoin/wallet-web.git
cd wallet-web

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration

# Run development server
npm run dev

# Open browser
# http://localhost:3250
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_NODE_URL=http://localhost:8332
NEXT_PUBLIC_EXPLORER_URL=http://localhost:3200
NEXT_PUBLIC_API_KEY=your_api_key_here
NEXT_PUBLIC_NETWORK=mainnet
```

---

## Project Structure

```text
wallet-web/
├── app/                    # Next.js App Router
│   ├── wallet/            # Wallet application
│   │   ├── dashboard/     # Main dashboard
│   │   ├── send/          # Send transactions
│   │   ├── receive/       # Receive addresses
│   │   ├── history/       # Transaction history
│   │   ├── multisig/      # Multi-signature
│   │   ├── staking/       # Staking interface
│   │   ├── defi/          # DeFi dashboard
│   │   ├── nfts/          # NFT gallery
│   │   └── settings/      # Settings page
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   └── services/          # Business logic services
│       ├── wallet.ts      # Wallet management
│       ├── multisig.ts    # Multi-sig operations
│       ├── staking.ts     # Staking operations
│       ├── defi.ts        # DeFi operations
│       ├── api.ts         # Blockchain API
│       ├── security.ts    # Encryption/security
│       └── ...
├── tests/
│   ├── e2e/              # End-to-end tests
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── performance/      # Performance tests
├── public/               # Static assets
├── docs/                 # Documentation
├── .github/              # GitHub workflows
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## Services API Reference

### Wallet Service (`src/services/wallet.ts`)

Core wallet management service.

#### `generateWallet(label: string): Promise<WalletInfo>`

Creates a new wallet with generated private key.

```typescript
const wallet = await walletService.generateWallet('My Wallet');
console.log(wallet.address); // KC1abc...
```

**Parameters**:
- `label` (string): Display name for wallet

**Returns**: `Promise<WalletInfo>`
```typescript
interface WalletInfo {
  address: string;
  label: string;
  balance: number;
  privateKey: string;
  createdAt: number;
  watchOnly?: boolean;
}
```

**Throws**: Error if label is empty

---

#### `importWallet(privateKey: string, label: string): Promise<WalletInfo>`

Imports wallet from private key.

```typescript
const wallet = await walletService.importWallet(
  'private_key_here',
  'Imported Wallet'
);
```

**Parameters**:
- `privateKey` (string): Wallet private key
- `label` (string): Display name

**Returns**: `Promise<WalletInfo>`

**Throws**: 
- Error if private key invalid
- Error if private key already imported

---

#### `getWallets(): WalletInfo[]`

Returns all wallets.

```typescript
const wallets = walletService.getWallets();
console.log(`You have ${wallets.length} wallets`);
```

**Returns**: `WalletInfo[]`

---

#### `getWallet(address: string): WalletInfo | null`

Gets wallet by address.

```typescript
const wallet = walletService.getWallet('KC1abc123');
if (wallet) {
  console.log(`Balance: ${wallet.balance} KC`);
}
```

**Parameters**:
- `address` (string): Wallet address

**Returns**: `WalletInfo | null`

---

#### `deleteWallet(address: string): boolean`

Deletes a wallet.

```typescript
const deleted = walletService.deleteWallet('KC1abc123');
if (deleted) {
  console.log('Wallet deleted');
}
```

**Parameters**:
- `address` (string): Wallet address

**Returns**: `boolean` (true if deleted)

**Side Effects**:
- Removes wallet from localStorage
- Updates active wallet if deleted was active

---

#### `setActiveWallet(address: string): void`

Sets the active wallet.

```typescript
walletService.setActiveWallet('KC1abc123');
const active = walletService.getActiveWallet();
```

**Parameters**:
- `address` (string): Wallet address

**Throws**: Error if address not found

---

#### `getActiveWallet(): WalletInfo | null`

Gets currently active wallet.

```typescript
const active = walletService.getActiveWallet();
if (active) {
  console.log(`Active: ${active.label}`);
}
```

**Returns**: `WalletInfo | null`

---

#### `updateWalletBalance(address: string, balance?: number): Promise<void>`

Updates wallet balance.

```typescript
// Fetch from blockchain
await walletService.updateWalletBalance('KC1abc123');

// Set manually
await walletService.updateWalletBalance('KC1abc123', 100.5);
```

**Parameters**:
- `address` (string): Wallet address
- `balance` (number, optional): New balance (if not provided, fetches from API)

**Returns**: `Promise<void>`

---

#### `getTransactionHistory(address: string, limit?: number): Promise<UTXO[]>`

Gets transaction history for address.

```typescript
const history = await walletService.getTransactionHistory('KC1abc123', 100);
console.log(`${history.length} transactions`);
```

**Parameters**:
- `address` (string): Wallet address
- `limit` (number, optional): Max results (default: 50)

**Returns**: `Promise<UTXO[]>`

---

#### `exportWallet(address: string): string | null`

Exports wallet as JSON.

```typescript
const json = walletService.exportWallet('KC1abc123');
if (json) {
  // Download or save json
  console.log('Wallet exported');
}
```

**Parameters**:
- `address` (string): Wallet address

**Returns**: `string | null` (JSON string or null if not found)

---

#### `getTotalBalance(): number`

Gets total balance across all wallets.

```typescript
const total = walletService.getTotalBalance();
console.log(`Total: ${total} KC`);
```

**Returns**: `number`

---

### Multi-Sig Service (`src/services/multisig.ts`)

Multi-signature wallet operations.

#### `createMultisigWallet(name: string, requiredSignatures: number, signers: string[]): MultisigWallet`

Creates new multi-sig wallet.

```typescript
const wallet = multisigService.createMultisigWallet(
  'Company Wallet',
  2,  // 2-of-3
  ['signer1_pubkey', 'signer2_pubkey', 'signer3_pubkey']
);
```

**Parameters**:
- `name` (string): Wallet name
- `requiredSignatures` (number): Signatures needed
- `signers` (string[]): Public keys of signers

**Returns**: `MultisigWallet`

**Throws**: Error if requiredSignatures > signers.length

---

#### `createTransaction(walletId: string, recipient: string, amount: number): PendingTransaction`

Creates transaction requiring signatures.

```typescript
const tx = multisigService.createTransaction(
  wallet.id,
  'KC1recipient',
  10.5
);
```

**Returns**: `PendingTransaction`

---

#### `signTransaction(txId: string, signerKey: string): boolean`

Signs a pending transaction.

```typescript
const signed = multisigService.signTransaction(
  tx.id,
  'signer1'
);
```

**Returns**: `boolean` (true if signature added)

---

#### `isTransactionComplete(txId: string): boolean`

Checks if transaction has enough signatures.

```typescript
if (multisigService.isTransactionComplete(tx.id)) {
  console.log('Ready to broadcast');
}
```

**Returns**: `boolean`

---

### Staking Service (`src/services/staking.ts`)

Staking pool operations.

#### `getStakingPools(): StakingPool[]`

Returns available staking pools.

```typescript
const pools = stakingService.getStakingPools();
pools.forEach(pool => {
  console.log(`${pool.name}: ${pool.apy}% APY`);
});
```

**Returns**: `StakingPool[]`

---

#### `stake(poolId: string, amount: number, autoCompound: boolean): StakingPosition`

Stakes tokens in a pool.

```typescript
const position = stakingService.stake(
  pool.id,
  100,  // 100 KC
  true  // auto-compound
);
```

**Parameters**:
- `poolId` (string): Pool identifier
- `amount` (number): Amount to stake
- `autoCompound` (boolean): Auto-compound rewards

**Returns**: `StakingPosition`

**Throws**: Error if amount < pool.minStake

---

#### `calculateRewards(positionId: string): void`

Calculates current rewards for position.

```typescript
stakingService.calculateRewards(position.id);
const updated = stakingService.getPositions().find(p => p.id === position.id);
console.log(`Rewards: ${updated.rewards} KC`);
```

**Side Effects**: Updates position rewards

---

#### `claimRewards(positionId: string): number`

Claims accumulated rewards.

```typescript
const claimed = stakingService.claimRewards(position.id);
console.log(`Claimed ${claimed} KC`);
```

**Returns**: `number` (amount claimed)

---

#### `unstake(positionId: string): boolean`

Unstakes position (after lock period).

```typescript
try {
  stakingService.unstake(position.id);
  console.log('Unstaked successfully');
} catch (error) {
  console.error('Still locked');
}
```

**Returns**: `boolean`

**Throws**: Error if still locked

---

### DeFi Service (`src/services/defi.ts`)

DeFi protocol operations.

#### `lend(protocol: string, asset: string, amount: number, apy: number): LendingPosition`

Lends assets to protocol.

```typescript
const position = defiService.lend(
  'KuberLend',
  'KC',
  100,
  8.5  // 8.5% APY
);
```

**Returns**: `LendingPosition`

---

#### `borrow(protocol: string, borrowedAsset: string, borrowedAmount: number, collateralAsset: string, collateralAmount: number, interestRate: number): BorrowPosition`

Borrows with collateral.

```typescript
const position = defiService.borrow(
  'KuberLend',
  'USDC',
  100,
  'KC',
  200,
  5  // 5% interest
);
console.log(`Health Factor: ${position.healthFactor}`);
```

**Returns**: `BorrowPosition`

**Throws**: Error if health factor < 1.2

---

#### `addLiquidity(poolId: string, token0Amount: number, token1Amount: number): LiquidityPosition`

Adds liquidity to pool.

```typescript
const position = defiService.addLiquidity(
  pool.id,
  100,  // 100 KC
  100   // 100 USDC
);
console.log(`LP Tokens: ${position.lpTokens}`);
```

**Returns**: `LiquidityPosition`

---

[Continue with remaining services: NFT Manager, Privacy Tools, Mobile Sync, Audit Log...]

---

## Component Library

### Button Component

```typescript
import Button from '@/components/Button';

<Button
  variant="primary"
  size="medium"
  onClick={() => console.log('Clicked')}
  disabled={false}
  loading={false}
>
  Click Me
</Button>
```

**Props**:
- `variant`: 'primary' | 'secondary' | 'danger'
- `size`: 'small' | 'medium' | 'large'
- `onClick`: () => void
- `disabled`: boolean
- `loading`: boolean

---

### Card Component

```typescript
import Card from '@/components/Card';
import CardBody from '@/components/CardBody';

<Card>
  <CardBody>
    <h2>Title</h2>
    <p>Content</p>
  </CardBody>
</Card>
```

---

### Modal Component

```typescript
import Modal from '@/components/Modal';

<Modal
  isOpen={isOpen}
>
  <p>Are you sure?</p>
  <Button onClick={handleConfirm}>Confirm</Button>
</Modal>
```
---

## State Management

### React Hooks Pattern

```typescript
'use client';

import { useState, useEffect } from 'react';
import walletService from '@/services/wallet';

export default function MyComponent() {
  const [wallets, setWallets] = useState(walletService.getWallets());
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch data
      await walletService.updateAllBalances();
      setWallets(walletService.getWallets());
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      {loading ? 'Loading...' : wallets.map(w => <div key={w.address}>{w.label}</div>)}
    </div>
  );
}
```

### Real-Time Updates

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    // Update data every 5 seconds
    setData(service.getData());
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

---

## Testing

### Running Tests

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance

# All tests
npm test
```

### Writing Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import walletService from '@/services/wallet';

describe('Wallet Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  
  it('should create wallet', async () => {
    const wallet = await walletService.generateWallet('Test');
    expect(wallet.label).toBe('Test');
    expect(wallet.address).toMatch(/^KC/);
  });
});
```

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('should send transaction', async ({ page }) => {
  await page.goto('http://localhost:3250/wallet/send');
  
  await page.fill('input[placeholder*="address"]', 'KC1abc123');
  await page.fill('input[placeholder*="amount"]', '10');
  await page.click('button:has-text("Send")');
  
  await expect(page.locator('text=Transaction sent')).toBeVisible();
});
```

---

## Contributing

### Development Workflow

1. Fork repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes
4. Write tests
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Create Pull Request

### Code Style

```typescript
// Use TypeScript strict mode
// Prefer const over let
// Use async/await over promises
// Add JSDoc comments
// Follow naming conventions

/**
 * Generates a new wallet with the given label
 * @param label - Display name for the wallet
 * @returns Promise resolving to wallet info
 * @throws Error if label is empty
 */
async function generateWallet(label: string): Promise<WalletInfo> {
  if (!label) throw new Error('Label required');
  // ...
}
```

### Pull Request Guidelines

- Clear title and description
- Link related issues
- Include tests
- Update documentation
- Pass all CI checks

---

**Version**: 1.0.0  
**Last Updated**: February 3, 2026  

For questions: connect@kuber-coin.com
