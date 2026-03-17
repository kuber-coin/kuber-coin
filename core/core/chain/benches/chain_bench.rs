//! Criterion benchmarks for KuberCoin hot paths:
//! block header hashing, merkle root computation, UTXO set lookup/insert.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

use chain::block::Block;
use chain::header::BlockHeader;
use chain::utxo::{UtxoSet, UTXO};
use tx::{OutPoint, Transaction, TxOutput};

// ── Helpers ─────────────────────────────────────────────────────────────

fn sample_header() -> BlockHeader {
    BlockHeader::new([0xab; 32], [0xcd; 32], 1_700_000_000, 0x1d00ffff, 42)
}

fn coinbase_tx(height: u64) -> Transaction {
    Transaction::new_coinbase(height, 50_0000_0000, vec![0x76, 0xa9, 0x14])
}

fn many_txs(n: usize) -> Vec<Transaction> {
    (0..n as u64).map(|i| coinbase_tx(i + 1)).collect()
}

fn populated_utxo_set(n: usize) -> (UtxoSet, Vec<OutPoint>) {
    let mut set = UtxoSet::new();
    let mut points = Vec::with_capacity(n);
    for i in 0..n {
        let mut txid = [0u8; 32];
        txid[..8].copy_from_slice(&(i as u64).to_le_bytes());
        let op = OutPoint::new(txid, 0);
        let utxo = UTXO::new(TxOutput::new(1000, vec![0x00, 0x14]), 1, false);
        set.add_utxo(op, utxo);
        points.push(op);
    }
    (set, points)
}

// ── Benchmarks ──────────────────────────────────────────────────────────

fn bench_header_hash(c: &mut Criterion) {
    let header = sample_header();
    c.bench_function("header_hash_sha256d", |b| {
        b.iter(|| black_box(header.hash()));
    });
}

fn bench_block_hash(c: &mut Criterion) {
    let block = Block::new(sample_header(), vec![coinbase_tx(1)]);
    c.bench_function("block_hash", |b| {
        b.iter(|| black_box(block.hash()));
    });
}

fn bench_merkle_root(c: &mut Criterion) {
    let mut group = c.benchmark_group("merkle_root");
    for &count in &[1, 10, 100, 1000] {
        let txs = many_txs(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &txs, |b, txs| {
            b.iter(|| black_box(Block::calculate_merkle_root(txs)));
        });
    }
    group.finish();
}

fn bench_utxo_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("utxo_lookup");
    for &size in &[1_000, 10_000, 100_000] {
        let (set, points) = populated_utxo_set(size);
        let mid = &points[size / 2];
        group.bench_with_input(BenchmarkId::from_parameter(size), mid, |b, op| {
            b.iter(|| black_box(set.get_utxo(op)));
        });
    }
    group.finish();
}

fn bench_utxo_insert(c: &mut Criterion) {
    c.bench_function("utxo_insert_1000", |b| {
        b.iter_with_setup(
            || {
                let set = UtxoSet::new();
                let entries: Vec<_> = (0..1000u64)
                    .map(|i| {
                        let mut txid = [0u8; 32];
                        txid[..8].copy_from_slice(&i.to_le_bytes());
                        (
                            OutPoint::new(txid, 0),
                            UTXO::new(TxOutput::new(500, vec![0x00, 0x14]), 1, false),
                        )
                    })
                    .collect();
                (set, entries)
            },
            |(mut set, entries)| {
                for (op, utxo) in entries {
                    set.add_utxo(op, utxo);
                }
                black_box(&set);
            },
        );
    });
}

fn bench_txid(c: &mut Criterion) {
    let tx = coinbase_tx(1);
    c.bench_function("txid_sha256d", |b| {
        b.iter(|| black_box(tx.txid()));
    });
}

criterion_group!(
    benches,
    bench_header_hash,
    bench_block_hash,
    bench_merkle_root,
    bench_utxo_lookup,
    bench_utxo_insert,
    bench_txid,
);
criterion_main!(benches);
