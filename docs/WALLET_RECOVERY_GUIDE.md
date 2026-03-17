# KuberCoin Wallet Recovery Guide

**CRITICAL: Read this entire guide before attempting recovery!**

## Emergency Contact

If you're panicking and need immediate help:
- Discord: https://discord.gg/kubercoin (#wallet-help)
- Email: connect@kuber-coin.com

## Table of Contents
1. [Before You Start](#before-you-start)
2. [Recovery from Seed Phrase](#recovery-from-seed-phrase)
3. [Recovery from Private Keys](#recovery-from-private-keys)
4. [Recovery from Wallet File](#recovery-from-wallet-file)
5. [Partial Recovery Scenarios](#partial-recovery-scenarios)
6. [What If I Lost Everything?](#what-if-i-lost-everything)
7. [Prevention: Never Lose Access Again](#prevention)

---

## Before You Start

### ⚠️ SAFETY FIRST

**DO:**
- ✅ Work on a clean, malware-free computer
- ✅ Disconnect from internet during recovery (if possible)
- ✅ Use official KuberCoin software only
- ✅ Double-check every word/character
- ✅ Test with small amounts first

**DON'T:**
- ❌ Enter your seed phrase on any website
- ❌ Share your seed phrase with anyone (including "support")
- ❌ Take screenshots of your seed phrase
- ❌ Store seed phrase digitally (cloud, phone, email)
- ❌ Rush - Take your time and be careful

### Scam Warning 🚨

**KUBERCOIN SUPPORT WILL NEVER:**
- Ask for your seed phrase
- Ask for your private keys
- Ask you to send coins for "verification"
- Contact you first about recovery issues
- Request remote access to your computer

If someone does this, it's a scam. Report to connect@kuber-coin.com.

---

## Recovery from Seed Phrase

### What is a Seed Phrase?

A seed phrase (also called recovery phrase or mnemonic) is 12-24 words that can restore your entire wallet.

Example: `witch collapse practice feed shame open despair creek road again ice least`

### Step 1: Verify Your Seed Phrase

Before attempting recovery, verify your seed phrase:

1. **Count the words** - Should be 12, 15, 18, 21, or 24 words
2. **Check for typos** - Common mistakes:
   - "their" vs "there"
   - "to" vs "too" vs "two"
   - "right" vs "write"
3. **Verify word order** - Order matters! Word 1 must be first, word 2 second, etc.
4. **Check wordlist** - All words must be from BIP39 wordlist (see below)

### Step 2: Restore Wallet from Seed Phrase

#### Using KuberCoin CLI

```bash
# Stop the node if running
kubercoin-cli stop

# Restore wallet
kubercoin-cli restorewallet "my-recovered-wallet" "your seed phrase here"

# Example:
kubercoin-cli restorewallet "my-wallet" "witch collapse practice feed shame open despair creek road again ice least"

# Check balance
kubercoin-cli getbalance
```

#### Using GUI Wallet

1. Open KuberCoin Wallet
2. Click "File" → "Restore Wallet"
3. Enter wallet name (e.g., "Recovered Wallet")
4. Select "From Seed Phrase"
5. Enter your 12-24 word seed phrase
6. Set a new password (don't reuse old password)
7. Click "Restore"
8. Wait for sync to complete
9. Check your balance

### Step 3: Verify Recovery

```bash
# Check if wallet restored correctly
kubercoin-cli getwalletinfo

# List addresses
kubercoin-cli listaddressgroupings

# Check balance
kubercoin-cli getbalance

# List recent transactions
kubercoin-cli listtransactions
```

If balance is zero but you know you had funds:
1. Wait for full blockchain sync
2. Try rescanning: `kubercoin-cli rescanblockchain`
3. Check derivation path (see "Advanced Recovery")

---

## Recovery from Private Keys

### What is a Private Key?

A private key is a 64-character hexadecimal string that controls a single address.

Example: `e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262`

### Step 1: Import Private Key

```bash
# Import a single private key
kubercoin-cli importprivkey "YOUR_PRIVATE_KEY_HERE" "label"

# Example:
kubercoin-cli importprivkey "e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262" "imported-address"

# Import without rescan (faster, but won't show past transactions)
kubercoin-cli importprivkey "YOUR_PRIVATE_KEY" "label" false

# Then rescan manually:
kubercoin-cli rescanblockchain
```

### Step 2: Import Multiple Private Keys

If you have many private keys:

```bash
# Create a file with one key per line
# File: private_keys.txt
e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262
a1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd
...

# Import all keys
while IFS= read -r key; do
  kubercoin-cli importprivkey "$key" "" false
done < private_keys.txt

# Rescan once after all imports
kubercoin-cli rescanblockchain
```

---

## Recovery from Wallet File

### Locate Your Wallet File

**Linux/macOS:**
```bash
~/.kubercoin/wallets/wallet.dat
```

**Windows:**
```
C:\Users\YourUsername\AppData\Roaming\KuberCoin\wallets\wallet.dat
```

### Step 1: Restore from Backup

```bash
# Stop the node
kubercoin-cli stop

# Restore wallet.dat from backup
# Linux/macOS:
cp /path/to/backup/wallet.dat ~/.kubercoin/wallets/wallet.dat

# Windows:
copy D:\backup\wallet.dat C:\Users\YourUsername\AppData\Roaming\KuberCoin\wallets\wallet.dat

# Start node
kubercoind -daemon

# Unlock wallet (if encrypted)
kubercoin-cli walletpassphrase "your-password" 600

# Check balance
kubercoin-cli getbalance
```

### Step 2: If Wallet is Encrypted

If you forgot your wallet password:

**Option A: Try common passwords**
- Old passwords you've used
- Variations with numbers/symbols
- Check password managers

**Option B: Brute force (last resort)**
```bash
# Use btcrecover tool (may take days/weeks)
# https://github.com/gurnec/btcrecover
python3 btcrecover.py --wallet wallet.dat --passwordlist passwords.txt
```

**⚠️ WARNING:** If you lose your wallet password AND seed phrase, funds are unrecoverable!

---

## Partial Recovery Scenarios

### Scenario 1: Missing One Word from Seed Phrase

If you have 11 of 12 words (or 23 of 24):

```bash
# Use btcrecover to brute force missing word
python3 seedrecover.py --mnemonic "word1 word2 word3 %w word5..." --wallet kubercoin
```

There are only 2048 possible words, so this usually works in minutes.

### Scenario 2: Words Out of Order

If you have all words but wrong order:

```bash
# Use seedrecover with --disorder option
python3 seedrecover.py --mnemonic "word1 word2 word3..." --disorder 3
```

**Warning:** Testing all permutations of 12 words takes years! Only feasible if you know most positions are correct.

### Scenario 3: Typos in Multiple Words

If you have typos in 1-2 words:

```bash
# Seedrecover can fix typos
python3 seedrecover.py --mnemonic "wihch colapse..." --typos 2
```

### Scenario 4: Know Address but Lost Keys

If you still have the address but lost private keys:

**You can monitor the balance but CANNOT spend without keys!**

```bash
# Watch-only wallet
kubercoin-cli importaddress "kube1youraddress" "watch-label" false

# Check balance (view-only)
kubercoin-cli getreceivedbyaddress "kube1youraddress"
```

**Recovery options:**
1. Find backup of seed phrase/private keys
2. Check old computers, USBs, paper wallets
3. If funds are lost, they're gone forever (by design)

---

## What If I Lost Everything?

### If You Lost Seed Phrase AND Private Keys AND Wallet File...

**I'm sorry, but your funds are unrecoverable.**

This is a feature, not a bug. The security of Bitcoin-style cryptocurrencies depends on this being impossible.

### What You CAN Do:

1. **Check old backups**
   - Old computers
   - External hard drives
   - USB drives
   - Cloud storage (risky but check)
   - Old phones
   - Email drafts (if you were careless)

2. **Check physical locations**
   - Safe deposit box
   - Paper wallet in safe
   - Written on paper (check notebooks, files)
   - Given to trusted person for safekeeping

3. **Try professional recovery services**
   - **Only as last resort**
   - **Only for large amounts** (services charge $1000+)
   - **Verify legitimacy** (many are scams)
   - Reputable: Dave Bitcoin, Wallet Recovery Services

4. **Accept the loss**
   - Don't send more money trying to recover
   - Don't fall for recovery scams
   - Learn from the mistake
   - Move on

---

## Prevention: Never Lose Access Again

### Backup Your Seed Phrase (3-2-1 Rule)

**3 copies, 2 different media types, 1 offsite**

#### Copy 1: Paper (Primary)
- Write on acid-free paper with pencil (not pen)
- Store in waterproof/fireproof container
- Keep in home safe or locked drawer
- Never photograph!

#### Copy 2: Metal (Fireproof)
- Stamp or engrave on metal plate
- Survives house fire
- Products: Cryptosteel, Billfodl
- Store in different location than Copy 1

#### Copy 3: Bank Safe Deposit Box (Offsite)
- Paper or metal backup
- In bank safe deposit box
- Or at trusted family member's house
- NOT in the cloud!

### What NOT to Do ❌

- ❌ Store in cloud (Google Drive, iCloud, Dropbox)
- ❌ Store in email
- ❌ Store on phone/computer
- ❌ Take screenshot
- ❌ Save in password manager (controversial)
- ❌ Tell anyone your seed phrase
- ❌ Store online in any form

### Additional Security

**1. Use Passphrase (25th word)**
```bash
# Restore with passphrase
kubercoin-cli restorewallet "wallet" "12 word seed" "optional-passphrase"
```

Benefits:
- Adds extra security layer
- Different passphrase = different wallet
- Even if seed is stolen, funds are safe

**Risks:**
- Lose passphrase = lose funds (even with seed)
- Must backup passphrase separately

**2. Multi-Signature Wallet**
```bash
# Require 2-of-3 keys to spend
kubercoin-cli createmultisig 2 '["pubkey1", "pubkey2", "pubkey3"]'
```

Benefits:
- Lose one key, funds still safe
- Can distribute keys to trusted parties
- Better for large amounts

**3. Hardware Wallet**
- Ledger or Trezor
- Keeps private keys offline
- Protects against malware
- Still need to backup seed phrase!

---

## Recovery Checklist

Use this checklist when recovering your wallet:

- [ ] Computer is malware-free (run antivirus)
- [ ] Downloaded software from official source only
- [ ] Verified checksums/signatures
- [ ] Disconnected from internet (optional but safer)
- [ ] Have seed phrase written down physically
- [ ] Verified all words are on BIP39 wordlist
- [ ] Verified word order is correct
- [ ] Verified no typos
- [ ] Created new wallet with seed phrase
- [ ] Wallet is syncing blockchain
- [ ] Balance appeared (or waiting for sync)
- [ ] Tested with small amount first
- [ ] Created NEW backups of recovered wallet
- [ ] Stored backups in 3 secure locations
- [ ] Deleted recovery files from computer
- [ ] Never reused seed phrase digitally

---

## BIP39 Wordlist

Your seed phrase words must be from this list. If a word is not on this list, it's misspelled or invalid.

[Full BIP39 English wordlist: https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt]

Common misspellings:
- "their" (correct) vs "there"
- "witch" (correct) vs "which"
- "write" (correct) vs "right"

---

## Advanced Recovery

### Custom Derivation Paths

If standard recovery doesn't find funds, try different derivation paths:

```bash
# Standard path (default)
m/44'/0'/0'/0

# Legacy paths
m/44'/0'/0'    # BIP44
m/49'/0'/0'    # BIP49 (SegWit)
m/84'/0'/0'    # BIP84 (Native SegWit)

# Try different paths
kubercoin-cli restorewallet "wallet" "seed" --derivation-path "m/44'/0'/0'/0"
```

### Recover from Extended Keys (xprv/xpub)

```bash
# Import extended private key
kubercoin-cli importwallet "xprv..."

# Import extended public key (watch-only)
kubercoin-cli importwallet "xpub..."
```

---

## Emergency Contacts

**For Recovery Help:**
- Discord: #wallet-help channel
- Email: connect@kuber-coin.com
- Forum: https://forum.kubercoin.org

**For Security Issues:**
- Email: connect@kuber-coin.com (DO NOT share seed phrase!)

---

## Legal Disclaimer

KuberCoin is non-custodial. We cannot:
- Reset your password
- Recover your seed phrase
- Access your funds
- Reverse transactions

You are responsible for your own funds. Keep backups safe!

---

**Last Updated:** March 13, 2026  
**Version:** 1.0

**Remember: Your seed phrase is your money. Protect it like your life depends on it.**
