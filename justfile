# KuberCoin development commands

# Build all crates
build:
    cargo build --workspace

# Run all tests
test:
    cargo test --workspace

# Run tests with output
test-verbose:
    cargo test --workspace -- --nocapture

# Run the node
run:
    cargo run --bin kubercoin-node

# Mine blocks locally — use generatetoaddress via RPC instead
mine-local:
    @echo "Use JSON-RPC: generatetoaddress <nblocks> <address>"

# Check code without building
check:
    cargo check --workspace

# Format code
fmt:
    cargo fmt --all

# Run clippy lints
lint:
    cargo clippy --workspace -- -D warnings

# Clean build artifacts
clean:
    cargo clean
