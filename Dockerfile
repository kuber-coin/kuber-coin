# Kubercoin Node Dockerfile
# Multi-stage build for minimal production image

# Stage 1: Builder
# Pin Rust version for reproducible builds
FROM rust:1.88.0 AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/kubercoin

# Pin toolchain via rust-toolchain.toml (must match host pinning)
COPY rust-toolchain.toml ./

# Set SOURCE_DATE_EPOCH for reproducible embedded timestamps
ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}

# Copy manifests
COPY Cargo.toml Cargo.lock ./
COPY core/core/chain/Cargo.toml ./core/core/chain/
COPY core/core/consensus/Cargo.toml ./core/core/consensus/
COPY core/core/tx/Cargo.toml ./core/core/tx/
COPY core/core/testnet/Cargo.toml ./core/core/testnet/
COPY core/core/storage/Cargo.toml ./core/core/storage/
COPY core/node/Cargo.toml ./core/node/
COPY core/mining/miner/Cargo.toml ./core/mining/miner/
COPY core/services/faucet/Cargo.toml ./core/services/faucet/
COPY core/services/lightning/Cargo.toml ./core/services/lightning/

# Create dummy source files to cache dependencies
RUN mkdir -p core/core/chain/src core/core/consensus/src core/core/tx/src \
    core/core/testnet/src core/core/storage/src \
    core/node/src core/node/src/bin \
    core/mining/miner/src core/services/faucet/src core/services/lightning/src && \
    echo "pub fn dummy() {}" > core/node/src/lib.rs && \
    echo "fn main() {}" > core/node/src/main.rs && \
    echo "fn main() {}" > core/node/src/bin/kubercoin-cli.rs && \
    echo "fn main() {}" > core/node/src/bin/kubercoin-tui.rs && \
    echo "fn main() {}" > core/node/src/bin/kubercoin-gov.rs && \
    echo "pub fn dummy() {}" > core/core/chain/src/lib.rs && \
    echo "pub fn dummy() {}" > core/core/consensus/src/lib.rs && \
    echo "pub fn dummy() {}" > core/core/tx/src/lib.rs && \
    echo "pub fn dummy() {}" > core/core/testnet/src/lib.rs && \
    echo "pub fn dummy() {}" > core/core/storage/src/lib.rs && \
    echo "pub fn dummy() {}" > core/mining/miner/src/lib.rs && \
    echo "pub fn dummy() {}" > core/services/faucet/src/lib.rs && \
    echo "pub fn dummy() {}" > core/services/lightning/src/lib.rs

# Build dependencies (cached layer)
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release --bin kubercoin-node && \
    rm -rf target/release/.fingerprint/kubercoin-node-* && \
    rm -rf target/release/.fingerprint/chain-* && \
    rm -rf target/release/.fingerprint/consensus-* && \
    rm -rf target/release/.fingerprint/tx-* && \
    rm -rf target/release/.fingerprint/testnet-* && \
    rm -rf target/release/.fingerprint/storage-* && \
    rm -rf target/release/.fingerprint/miner-* && \
    rm -rf target/release/.fingerprint/faucet-* && \
    rm -rf target/release/.fingerprint/lightning-*

# Copy real source code
COPY core ./core

# Build application
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release --bin kubercoin-node

# Stage 2: Runtime
FROM debian:bookworm-slim

# Install runtime deps + curl (for healthcheck) + create user + create data dir
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash kubercoin \
    && mkdir -p /data/kubercoin \
    && chown -R kubercoin:kubercoin /data/kubercoin

# Copy binary from builder
COPY --from=builder /usr/src/kubercoin/target/release/kubercoin-node /usr/local/bin/kubercoin-node

# Switch to non-root user
USER kubercoin

# Set working directory
WORKDIR /home/kubercoin

# Expose ports
# 8633: P2P network
# 8332: RPC API
# 8080: REST API
# 9090: WebSocket
# 9091: Prometheus metrics
EXPOSE 8633 8332 8080 9090 9091

# Set data directory as volume
VOLUME ["/data/kubercoin"]

# Environment (mainnet by default; override for testnet/regtest)
ENV KUBERCOIN_NETWORK=mainnet

# Health check — verify the RPC port is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://127.0.0.1:8332/api/health || exit 1

# Default command — listens on 0.0.0.0:8332 so docker-compose port mapping works
ENTRYPOINT ["kubercoin-node"]
# RPC/P2P addresses are configured via env vars (KUBERCOIN_RPC_ADDR, KUBERCOIN_P2P_ADDR) in docker-compose
