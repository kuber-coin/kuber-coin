# E2E Test Migration Summary

## Current Status: 20/93 Tests Passing (21.5%)

### Tests Successfully Migrated ✅
The following 20 tests are passing:
- Navigation tests (home, wallet pages that don't require active wallets)
- UI component tests (dashboard structure, settings tabs, manage page structure)
- Tests that check page existence and basic layout

### Failing Tests Categories 📊

#### 1. Dialog UI Failures (5 tests) - Broken Application Code
**Problem**: The create/import wallet dialogs don't open when buttons are clicked.
- `should create new wallet successfully`
- `should import wallet from private key`
- `should display wallet balance` (tries to create wallet first)
- `should switch between wallets` (tries to create wallets first)
- `should delete wallet with confirmation` (tries to create wallet first)

**Root Cause**: React state management issue in `/wallet/manage` page. Clicking `create-wallet-button` fires `onClick` but `setShowCreateDialog(true)` doesn't update state.

**Evidence**: Tested 4 different timing strategies (waitForTimeout, waitForLoadState, waitForSelector). Button is found and clicked successfully, but dialog never appears.

**Fix Needed**: Debug React component state in `app/wallet/manage/page.tsx` around line where `setShowCreateDialog` is called.

#### 2. Missing Active Wallet Errors (55+ tests) - Test Infrastructure Issue
**Problem**: Pages throw errors and show error boundary when no active wallet exists.

Tests failing:
- All `Send & Receive Transactions` tests (6 tests)
- All `Transaction History` tests (8+ tests) 
- All `UTXO Management` tests (6+ tests)
- All `Address Book` tests (6+ tests)
- All `Backup & Restore` tests (6+ tests)
- All `Settings & Configuration` tests (4+ tests)
- Most `Advanced Features` tests (40+ tests)

**Root Cause**: Pages like `/wallet/send`, `/wallet/history`, `/wallet/utxos`, etc. call `walletService.getActiveWallet()` during render. When it returns null, pages throw errors instead of showing "No wallet" state.

**Attempted Solutions**:
1. ✗ **Dialog-based wallet creation**: Dialogs broken (see above)
2. ✗ **localStorage injection after page load**: WalletService already initialized
3. ✗ **localStorage injection with page reload**: Same issue, plus adds complexity
4. ✗ **about:blank localStorage**: Security error, can't access localStorage on about:blank
5. ✗ **addInitScript**: Currently implemented but WalletService singleton doesn't reload

**Current Helper Implementation**:
```typescript
async function createActiveWallet(page: Page, label: string = 'Test Wallet') {
  await page.addInitScript((walletLabel) => {
    const randomStr = Math.random().toString(36).substring(2, 15);
    const address = `KC1test${randomStr}`;
    
    const wallet = {
      address: address,
      label: walletLabel,
      balance: 100.5,
      unconfirmedBalance: 0,
      createdAt: Date.now(),
      publicKey: 'test_pub_' + randomStr,
      watchOnly: false
    };
    
    const walletsMap: Record<string, any> = {};
    walletsMap[address] = wallet;
    
    localStorage.setItem('kubercoin_wallets', JSON.stringify(walletsMap));
    localStorage.setItem('kubercoin_active_wallet', address);
  }, label);
}
```

**Why It's Not Working**: The `WalletService` singleton (in `src/services/wallet.ts`) is created once at module load time. It loads from localStorage in the constructor, which happens before `addInitScript` runs. Even though localStorage has the data, the service instance already has empty state.

#### 3. Missing Test IDs (10-15 tests) - Easy to Fix
Some tests fail because UI elements are missing `data-testid` attributes:
- Send form inputs
- History filters
- UTXO list elements
- Address book buttons
- Backup/restore buttons

**Fix**: Add data-testid attributes to the respective page components.

#### 4. Test Logic Issues (2-3 tests) - Easy to Fix
- `should be keyboard navigable`: Test logic error (expects wrong value)
- `should handle network errors gracefully`: Offline mode breaks navigation
- `Performance Tests › should handle rapid navigation`: Requires active wallet

### Recommended Solutions 🔧

#### Option A: Fix Application Error Handling (Preferred)
**Impact**: Would fix 55+ failing tests
**Effort**: Medium (1-2 hours per page)

Modify wallet pages to handle null wallet gracefully instead of throwing errors:

```typescript
// Example for send page
const loadWallets = async () => {
  const active = walletService.getActiveWallet();
  if (!active) {
    // Show "No wallet" message instead of throwing
    setError('Please create or import a wallet first');
    setActiveWallet(null);
    return;
  }
  setActiveWallet(active);
  // ... rest of loading logic
};
```

Pages to fix:
- `/wallet/send`
- `/wallet/history`
- `/wallet/utxos`
- `/wallet/address-book`
- `/wallet/settings` (backup/restore tabs)
- All advanced features pages (multisig, cold storage, swaps, etc.)

#### Option B: Add WalletService.reload() Method
**Impact**: Would fix 55+ failing tests
**Effort**: Low (30 minutes)

Add a public `reload()` method to `WalletService`:

```typescript
// In src/services/wallet.ts
public reload(): void {
  this.loadWalletsFromStorage();
}
```

Then update helper:
```typescript
async function createActiveWallet(page: Page, label: string = 'Test Wallet') {
  await page.evaluate((walletLabel) => {
    // Set localStorage...
    
    // @ts-ignore - accessing internal service for testing
    if (window.walletService) {
      window.walletService.reload();
    }
  }, label);
}
```

#### Option C: Mock WalletService in Tests
**Impact**: Would fix 55+ failing tests  
**Effort**: Medium-High (requires test refactoring)

Replace real WalletService with a mock that returns test data:
```typescript
await page.addInitScript(() => {
  // Mock the entire WalletService
  window.walletService = {
    getActiveWallet: () => ({ /* test wallet */ }),
    getWallets: () => [/* test wallets */],
    // ... other methods
  };
});
```

#### Option D: Accept Current State & Document
**Impact**: 0 additional tests fixed
**Effort**: Minimal (already done)

Document that wallet-dependent tests cannot run until:
1. Dialog UI is fixed, OR
2. Application adds proper error handling for missing wallets

### Migration Progress Tracking 📈

| Category | Total Tests | Passing | Failing | % Complete |
|----------|------------|---------|---------|------------|
| Navigation | 10 | 10 | 0 | 100% |
| Wallet Management | 5 | 0 | 5 | 0% (dialogs broken) |
| Send/Receive | 6 | 0 | 6 | 0% (needs wallet) |
| History | 8 | 0 | 8 | 0% (needs wallet) |
| UTXO Management | 6 | 0 | 6 | 0% (needs wallet) |
| Address Book | 6 | 0 | 6 | 0% (needs wallet) |
| Backup/Restore | 6 | 0 | 6 | 0% (needs wallet) |
| Settings | 8 | 5 | 3 | 62.5% |
| Error Handling | 3 | 0 | 3 | 0% (needs wallet) |
| Accessibility | 2 | 0 | 2 | 0% (test logic issues) |
| Performance | 1 | 0 | 1 | 0% (needs wallet) |
| Advanced Features | 40 | 0 | 40 | 0% (needs wallet) |
| **TOTAL** | **93** | **20** | **73** | **21.5%** |

### Files Modified During Migration ✏️

1. **tests/e2e/wallet-core.spec.ts**: 
   - Added `createActiveWallet()` helper function (7 iterations)
   - Updated ~33 tests to call helper
   - Currently uses `addInitScript` approach

2. **tests/e2e/advanced-features.spec.ts**:
   - Added `createActiveWallet()` helper function (matching wallet-core)
   - Updated ~8 tests to call helper

3. **app/wallet/settings/page.tsx**:
   - Added data-testid attributes to 5 tab buttons (lines 153, 163, 173, 183, 193)

### Next Steps 🚀

**Immediate (to reach 50% pass rate)**:
1. Implement Option A or B above to handle missing wallets
2. Add missing data-testid attributes to form inputs
3. Fix 2-3 test logic issues

**Short Term (to reach 75% pass rate)**:
1. Fix dialog UI in wallet management page
2. Update wallet creation/import tests
3. Add data-testid to all remaining UI elements

**Long Term (to reach 90%+ pass rate)**:
1. Mock API responses for tests that hit real endpoints
2. Add test fixtures for realistic blockchain data
3. Improve test reliability with better waiting strategies

### Test Execution Time ⏱️
- Full suite: ~4.5 minutes
- Per test average: ~3 seconds
- Timeout per test: 30 seconds

### Developer Notes 💡

**Why localStorage approach doesn't work**:
The WalletService is a JavaScript module-level singleton that gets instantiated once when the module is first imported. By the time Playwright's `addInitScript` or `page.evaluate` runs, the module has already been loaded and the constructor has already called `this.loadWalletsFromStorage()` when localStorage was still empty.

**Timeline of events**:
1. Test navigates to page
2. Next.js loads JavaScript bundles
3. `wallet.ts` module is imported
4. `const walletService = new WalletService()` runs (constructor loads from empty localStorage)
5. addInitScript runs and sets localStorage (too late!)
6. Page components call `walletService.getActiveWallet()` → returns null
7. Pages throw errors → error boundary shows "Server Error"

**The core architectural issue**:
Pages should be resilient to missing wallet state, showing appropriate UI rather than crashing. This is both a UX issue (users shouldn't see error boundaries for expected states) and a testability issue.
