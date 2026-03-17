# KuberCoin Frequently Asked Questions (FAQ)

**Quick answers to common questions**

---

## General Questions

### What is KuberCoin?

KuberCoin is a cryptocurrency (digital currency) built on the same proven foundations as Bitcoin, with enhanced privacy:
- **Private**: Built-in privacy features (Dandelion++, peer rotation, AS diversity)
- **Secure**: Peer authentication, NAT traversal, reputation-based networking
- **Compatible**: Same 21M cap, SHA-256d PoW, 10-minute blocks as Bitcoin
- **Fair**: No pre-mine, no ICO, pure proof-of-work

### How is KuberCoin different from Bitcoin?

| Feature | KuberCoin | Bitcoin |
|---------|-----------|---------|
| Block Time | 10 minutes | 10 minutes |
| TPS | ~7 (base layer) | ~7 |
| Privacy | Enhanced (Dandelion++) | Pseudonymous |
| Supply | 21M total | 21M total |
| Algorithm | SHA-256d | SHA-256d |
| Lightning Network | ✅ Supported | ✅ Supported |

### Is KuberCoin legal?

**In most countries, yes.** Cryptocurrency is legal in:
- 🇺🇸 United States (treated as property for tax)
- 🇪🇺 European Union (legal, regulated)
- 🇨🇦 Canada (legal)
- 🇯🇵 Japan (legal, regulated)
- 🇦🇺 Australia (legal)

**Check your local laws!** Some countries restrict or ban crypto.

### How do I get KuberCoin?

**Option 1: Buy on Exchange**
- Binance, Coinbase, Kraken (if listed)
- Requires ID verification (KYC)
- Easiest for beginners

**Option 2: Mine**
- Requires powerful computer
- Earn rewards for securing network
- See [Mining Guide](MINING_GUIDE.md)

**Option 3: Accept as Payment**
- If you run a business
- Lower fees than credit cards
- See [Merchant Guide](MERCHANT_GUIDE.md)

**Option 4: Peer-to-Peer**
- LocalKubercoins.com
- Meet in person or online
- Use escrow for safety

---

## Wallet Questions

### What's a wallet?

A wallet is software that:
- Stores your private keys (like a password)
- Creates addresses to receive coins
- Signs transactions to send coins
- Shows your balance

**Types of wallets:**
- **Desktop**: Full node on your computer
- **Mobile**: App on your phone
- **Hardware**: Physical device (most secure)
- **Web**: Browser-based (least secure)
- **Paper**: Printed private keys (cold storage)

### Do I need the whole blockchain?

**Full Node (Recommended)**
- Downloads full blockchain (~50GB)
- Most secure and private
- Takes 6-24 hours initial sync

**Light Wallet (SPV)**
- Downloads only headers (~100MB)
- Less secure but faster
- Syncs in minutes

**Custodial Wallet (Not Recommended)**
- Exchange holds your coins
- Fast but not your keys = not your coins

### What's a seed phrase?

A seed phrase is 12-24 words that can restore your wallet:
```
witch collapse practice feed shame open
despair creek road again ice least
```

**Critical facts:**
- ✅ Write on paper, store in safe
- ✅ Anyone with these words controls your coins
- ❌ NEVER store digitally
- ❌ NEVER share with anyone

**If you lose it, your coins are gone forever!**

### What if I forget my password?

**If you have seed phrase:**
- Create new wallet
- Import seed phrase
- Set new password
- ✅ Coins recovered!

**If you DON'T have seed phrase:**
- Wallet is locked forever
- Coins are permanently lost
- ❌ No way to recover

**This is by design for security!**

---

## Transaction Questions

### How long does a transaction take?

**Phases:**
1. **Broadcast**: Instant (~1 second)
2. **In Mempool**: Waiting for next block
3. **First Confirmation**: ~10 minutes (one block)
4. **Safe**: ~60 minutes (6 confirmations)

**Compare to:**
- Bitcoin: ~10 minutes (same)
- Ethereum: ~15 seconds
- Bank transfer: 1-3 business days
- Wire transfer: Same day

### What are transaction fees?

**Typical Fees:**
- Fees vary with transaction size and current network conditions.
- Use the wallet's current fee recommendation when sending funds.

**Fee goes to miners** who include your transaction in a block.

**Compare to:**
- Traditional payment systems and other blockchains use different fee models.
- Check current conditions instead of relying on static price examples.

### Can I cancel a transaction?

**No, transactions are final!**

Once broadcasted:
- Can't be canceled
- Can't be reversed
- Can't be modified

**Always double-check:**
- ✅ Recipient address is correct
- ✅ Amount is correct
- ✅ You trust the recipient

### What if I sent to wrong address?

**If the address exists:**
- Coins are gone to whoever owns it
- You can ask them nicely to return
- No guarantee they will

**If the address is invalid:**
- Transaction won't broadcast
- Wallet will show error
- Coins stay in your wallet

**Prevention:**
- Always copy-paste addresses (don't type)
- Send small test transaction first
- Verify first few and last few characters

### Why is my transaction stuck?

**Possible reasons:**
1. **Fee too low** - Miners prioritize higher fees
2. **Network congested** - Many transactions pending
3. **Double-spend attempt** - Conflicting transaction
4. **Node issue** - Your node not connected

**Solutions:**
- Wait longer (may take hours if low fee)
- RBF (Replace-By-Fee) with higher fee
- CPFP (Child-Pays-For-Parent) bump fee
- Contact recipient if urgent

---

## Security Questions

### Is KuberCoin secure?

**Network Security: Yes!**
- Same algorithm as Bitcoin (SHA-256d)
- Secured by proof-of-work
- Would cost millions to attack

**Wallet Security: Depends on you!**
- ✅ Secure if you follow best practices
- ❌ Insecure if you store seed phrase digitally

### Can KuberCoin be hacked?

**The blockchain: No**
- Protected by cryptography
- Would require breaking SHA-256 (impossible with current tech)
- Or controlling 51% of mining power (extremely expensive)

**Your wallet: Maybe**
- If malware steals your seed phrase
- If someone hacks your computer
- If you fall for phishing

**Protection:**
- Use hardware wallet (Ledger, Trezor)
- Keep software updated
- Don't click suspicious links
- Use antivirus

### What about quantum computers?

**Current quantum computers:**
- Can't break SHA-256
- Can't break secp256k1 (ECDSA)
- Would need millions more qubits

**Future-proofing:**
- Post-quantum cryptography planned
- Will upgrade before quantum threat
- Estimated 10+ years before concern

### How do I protect large amounts?

**Use multiple layers:**

**1. Cold Storage (Best)**
- Hardware wallet (Ledger, Trezor)
- Paper wallet (printed keys)
- Keep offline, in safe

**2. Multi-Signature**
- Require 2-of-3 or 3-of-5 keys to spend
- Distribute keys to trusted parties
- Protects against single point of failure

**3. Splitting**
- Don't keep all coins in one wallet
- 90% cold storage, 10% hot wallet
- Like keeping cash in bank vs wallet

**4. Insurance**
- Some custodians offer insurance
- Protects against theft/loss
- Expensive but worth it for large amounts

---

## Mining Questions

### Can I mine KuberCoin?

**Yes, but...**

**Requirements:**
- Powerful hardware (GPU or ASIC)
- Competitive electricity pricing
- Technical knowledge
- Hardware and infrastructure budget

**Profitability depends on:**
- Hardware efficiency
- Electricity cost
- Network difficulty
- KUBE price

Use mining calculator: https://kubercoin.org/mining-calc

### What's mining difficulty?

**Difficulty adjusts automatically** to keep blocks at ~10 minutes.

- More miners = Higher difficulty
- Fewer miners = Lower difficulty

**Why?** Prevents blocks from coming too fast or slow.

### Solo mining vs pool mining?

**Solo Mining:**
- ✅ Keep all rewards (if you find block)
- ❌ Very rare to find blocks (like lottery)
- Recommended only if you have >1% of network hashrate

**Pool Mining:**
- ✅ Steady payouts (every few hours/days)
- ❌ Pay pool fee (1-3%)
- Recommended for most miners

### What's the block reward?

**Current: 50 KUBER per block**

**Halving schedule:**
- Block 0-210,000: 50 KUBER
- Block 210,000-420,000: 25 KUBER
- Block 420,000-630,000: 12.5 KUBER
- And so on...

**Plus transaction fees** (goes to miner)

---

## Privacy Questions

### Is KuberCoin anonymous?

**No, it's pseudonymous.**

- Addresses don't have names
- But all transactions are public
- Can be traced with analysis

**For privacy, use:**
- CoinJoin (built-in mixer)
- New address for each transaction
- Tor for network privacy
- Dandelion++ for transaction privacy

### What's CoinJoin?

**CoinJoin mixes multiple transactions together**:

Without CoinJoin:
```
Alice → Bob (1 KUBE)  [Easy to trace]
```

With CoinJoin:
```
Alice, Carol, Dave → Bob, Eve, Frank
[Which output belongs to whom? Hard to tell!]
```

**How to use:**
1. Open wallet
2. Click "Privacy" tab
3. Click "Mix Coins"
4. Wait 10-30 minutes
5. Coins are now mixed

**Trade-offs:**
- Takes time (10-30 min)
- Small fee (0.1%)
- Requires other users mixing too

### Can government trace my transactions?

**Yes, potentially.**

- IRS, FBI, etc. have blockchain analysis tools
- Can trace most transactions
- Especially if you use exchanges (KYC data)

**For strongest privacy:**
- Buy with cash (no KYC)
- Use CoinJoin always
- Never reuse addresses
- Use Tor
- Use Monero instead (more private)

**Remember:** Privacy != illegal. You have right to privacy!

---

## Technical Questions

### What's the max supply?

**21,000,000 KUBER (21 million)**

**Current supply:** Check https://kubercoin.org/supply

**Inflation:**
- Block reward starts at 50 KUBER, halves every 210,000 blocks
- Decreases over time, approaching zero

**Tail emission:**
- 0.6 KUBE per block forever
- Ensures mining remains profitable
- ~3.15M KUBE per year minimum

### What's the block size?

**Maximum: 4 MB**

Compare to:
- Bitcoin: 1 MB (4 MB with SegWit)
- Bitcoin Cash: 32 MB
- Ethereum: Variable (gas limit)

**4 MB allows:**
- 50-1200 transactions per second
- Depends on transaction size
- SegWit can increase further

### Does KuberCoin have smart contracts?

**No, intentionally.**

**Why not?**
- Complexity = bugs = hacks
- Ethereum lost $billions to smart contract bugs
- KuberCoin focuses on currency, not programming platform

**Alternative:**
- Use sidechains for smart contracts
- Use Layer 2 (Lightning Network)
- Use specialized platforms (Ethereum) for DeFi

### What's the Lightning Network?

**Lightning = Layer 2 payment channels**

**Benefits:**
- ⚡ Instant transactions (<1 second)
- 💰 Tiny fees (<$0.001)
- 🚀 Millions of TPS possible
- 🔒 More private

**How it works:**
1. Open channel (on-chain transaction)
2. Make unlimited off-chain transactions
3. Close channel (on-chain transaction)

**Use cases:**
- Micropayments (tip $0.01)
- Streaming payments (pay per second)
- Gaming (buy items instantly)
- Remittances (send money globally)

**Status:** Coming soon (requires SegWit + HTLCs)

---

## Troubleshooting

### My wallet shows zero balance

**Possible causes:**
1. **Not synced** - Wait for full sync
2. **Wrong network** - Check you're on mainnet (not testnet)
3. **Wrong wallet** - Opened different wallet file

**Solutions:**
1. Check sync status (should be 100%)
2. Click "Help" → "Rescan Blockchain"
3. Verify seed phrase matches original wallet

### Wallet won't open/crashes

**Try:**
1. Restart computer
2. Update to latest version
3. Check antivirus (might be blocking)
4. Delete peers.dat file
5. Run with `-reindex` flag

**Still broken?**
- Ask in Discord: https://discord.gg/kubercoin
- Email support: connect@kuber-coin.com

### Transaction shows "unconfirmed" for hours

**Possible causes:**
1. Fee too low
2. Network congested
3. Double-spend attempt

**Solutions:**
1. Wait longer (can take 24 hours)
2. Use RBF to bump fee
3. Contact recipient

---

## Getting Help

**Need more help?**

### Documentation
- 📖 [User Guide](USER_GUIDE.md)
- 🎓 [Getting Started](GETTING_STARTED.md)
- 💾 [Wallet Recovery Guide](WALLET_RECOVERY_GUIDE.md)

### Community
- 💬 [Discord](https://discord.gg/kubercoin) - Fastest responses
- 📱 [Forum](https://forum.kubercoin.org) - Detailed discussions
- 🐦 [Twitter](https://twitter.com/kubercoin) - News and updates
- 📺 [YouTube](https://youtube.com/kubercoin) - Video tutorials

### Support
- ✉️ connect@kuber-coin.com
- 🌐 https://kubercoin.org/support

---

**Can't find your question?**

Ask in [Discord](https://discord.gg/kubercoin) - we're here to help!

---

**Last Updated:** March 13, 2026  
**Version:** 1.0
