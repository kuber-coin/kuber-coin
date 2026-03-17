# Tor Configuration

KuberCoin supports routing all outbound P2P connections through a SOCKS5 proxy,
making Tor-based operation a first-class deployment mode for nodes that need
IP-address anonymity.

## Quick Start

1. Install Tor and ensure `tor` is running (default SOCKS5 port: 9050).
2. Add the following to your `kubercoin.conf`:

```toml
# Route all outbound P2P connections through Tor
proxy_addr = "127.0.0.1:9050"

# Refuse unproxied direct connections (recommended for full anonymity)
tor_only = true

# Accept .onion peer addresses from BIP-155 AddrV2 messages
allow_onion = true
```

3. Start the node normally:

```bash
kubercoin-node --config kubercoin.conf
```

## How It Works

KuberCoin implements the SOCKS5 handshake (RFC 1928) natively — no external
library dependency is required.  When `proxy_addr` is set:

1. Each outbound connection first establishes a TCP connection to the proxy.
2. The node sends the SOCKS5 no-auth greeting (`\x05\x01\x00`).
3. A `CONNECT` command tunnels the connection to the target peer.
4. All further P2P messages flow through the tunnel transparently.

## Tor Hidden Service (Inbound Anonymity)

To accept inbound connections as a `.onion` hidden service, configure Tor
separately in `/etc/tor/torrc`:

```
HiddenServiceDir /var/lib/tor/kubercoin/
HiddenServicePort 18633 127.0.0.1:18633
```

After Tor starts, read the `.onion` address from
`/var/lib/tor/kubercoin/hostname` and share it with other node operators.

## BIP-155 AddrV2 and .onion Peer Discovery

KuberCoin already supports BIP-155 `addrv2` messages (the `SendAddrV2` and
`AddrV2` P2P message types are implemented in `core/node/src/network/message.rs`).
These messages extend the legacy `addr` message with support for:

| Network ID | Address Type | Bytes |
|-----------|-------------|-------|
| 0x01 | IPv4 | 4 |
| 0x02 | IPv6 | 16 |
| 0x04 | Tor v3 (.onion v3) | 32 |
| 0x05 | I2P | 32 |
| 0x06 | CJDNS | 16 |

With `allow_onion = true`, the node will accept and relay Tor v3 addresses
received from peers via `AddrV2` messages and attempt outbound connections to
`.onion` addresses via the configured `proxy_addr`.

## Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `proxy_addr` | `string` (optional) | — | SOCKS5 proxy address (e.g. `"127.0.0.1:9050"`) |
| `tor_only` | `bool` | `false` | Refuse direct connections; only use proxy |
| `allow_onion` | `bool` | `false` | Accept .onion addresses from BIP-155 AddrV2 |

## Security Notes

- `tor_only = true` is strongly recommended for operators who need IP anonymity.
  Without it, a single direct connection exposes your IP even if most
  connections go via Tor ("Tor + clearnet" offer weaker anonymity than pure Tor).
- Do **not** expose the SOCKS5 proxy port to the public internet — bind
  Tor's SocksPort to `127.0.0.1` only.
- Tor anonymises the transport layer but not the content of traffic.  KuberCoin's
  P2P protocol carries no persistent identity information (no IP addresses are
  embedded in block or transaction data), so content-level anonymity is strong.

## Relevant Standards

| Reference | Description |
|-----------|-------------|
| BIP-155 | `addrv2` message — Tor v3 / I2P address support |
| RFC 1928 | SOCKS Protocol Version 5 |
| BIP-324 | P2P encrypted transport (planned — see ROADMAP_BITCOIN_GRADE.md) |
