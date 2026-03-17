//! Payment routing through the Lightning network

use serde::{Deserialize, Serialize};
use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;

use crate::{LightningError, Result};

/// A single hop in a payment route
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteHop {
    /// Node pubkey
    pub pubkey: String,
    /// Channel ID to use
    pub channel_id: [u8; 32],
    /// Amount to forward (satoshis)
    pub amount: u64,
    /// Fee for this hop (satoshis)
    pub fee: u64,
    /// CLTV expiry delta
    pub cltv_delta: u32,
}

/// A complete payment route
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    /// Route hops from sender to recipient
    pub hops: Vec<RouteHop>,
    /// Total amount including fees
    pub total_amount: u64,
    /// Total fees
    pub total_fees: u64,
    /// Total CLTV delta
    pub total_cltv_delta: u32,
}

impl Route {
    /// Create a new route
    pub fn new(hops: Vec<RouteHop>) -> Self {
        let total_fees: u64 = hops.iter().map(|h| h.fee).sum();
        let total_cltv_delta: u32 = hops.iter().map(|h| h.cltv_delta).sum();
        let total_amount = hops.first().map(|h| h.amount).unwrap_or(0);
        
        Self {
            hops,
            total_amount,
            total_fees,
            total_cltv_delta,
        }
    }
    
    /// Get number of hops
    pub fn num_hops(&self) -> usize {
        self.hops.len()
    }
    
    /// Check if route is valid
    pub fn is_valid(&self) -> bool {
        !self.hops.is_empty() && self.hops.len() <= 20
    }
}

/// Network graph node
#[derive(Debug, Clone)]
pub struct GraphNode {
    pub pubkey: String,
    pub alias: String,
    pub channels: Vec<[u8; 32]>,
    /// Last gossip update timestamp (UNIX seconds).
    pub last_update: u64,
}

/// Network graph channel
#[derive(Debug, Clone)]
pub struct GraphChannel {
    pub channel_id: [u8; 32],
    pub node1: String,
    pub node2: String,
    pub capacity: u64,
    pub fee_base_msat: u32,
    pub fee_rate_millionths: u32,
    pub cltv_delta: u16,
    pub enabled: bool,
}

impl GraphChannel {
    /// Calculate fee for amount (overflow-safe)
    pub fn calculate_fee(&self, amount: u64) -> u64 {
        let base = (self.fee_base_msat / 1000) as u64;
        // Use u128 intermediate to prevent overflow on multiply before divide
        let proportional = ((amount as u128) * (self.fee_rate_millionths as u128) / 1_000_000) as u64;
        base.saturating_add(proportional)
    }
}

/// Network graph for pathfinding
#[derive(Debug, Default)]
pub struct NetworkGraph {
    nodes: HashMap<String, GraphNode>,
    channels: HashMap<[u8; 32], GraphChannel>,
    /// Node pubkey -> list of connected channel IDs
    adjacency: HashMap<String, Vec<[u8; 32]>>,
}

impl NetworkGraph {
    pub fn new() -> Self {
        Self::default()
    }
    
    /// Add a node
    pub fn add_node(&mut self, node: GraphNode) {
        self.adjacency.entry(node.pubkey.clone()).or_default();
        self.nodes.insert(node.pubkey.clone(), node);
    }
    
    /// Add a channel
    pub fn add_channel(&mut self, channel: GraphChannel) {
        let id = channel.channel_id;
        
        self.adjacency.entry(channel.node1.clone())
            .or_default()
            .push(id);
        self.adjacency.entry(channel.node2.clone())
            .or_default()
            .push(id);
        
        self.channels.insert(id, channel);
    }
    
    /// Remove a channel
    pub fn remove_channel(&mut self, channel_id: &[u8; 32]) {
        if let Some(channel) = self.channels.remove(channel_id) {
            if let Some(adj) = self.adjacency.get_mut(&channel.node1) {
                adj.retain(|id| id != channel_id);
            }
            if let Some(adj) = self.adjacency.get_mut(&channel.node2) {
                adj.retain(|id| id != channel_id);
            }
        }
    }

    /// Mutable reference to a channel by ID.
    pub fn get_channel_mut(&mut self, id: &[u8; 32]) -> Option<&mut GraphChannel> {
        self.channels.get_mut(id)
    }

    /// Mutable reference to a node by pubkey.
    pub fn get_node_mut(&mut self, pubkey: &str) -> Option<&mut GraphNode> {
        self.nodes.get_mut(pubkey)
    }

    /// Find route from source to destination
    pub fn find_route(
        &self,
        source: &str,
        dest: &str,
        amount: u64,
        max_hops: usize,
    ) -> Result<Route> {
        if source == dest {
            return Err(LightningError::RoutingFailed("source equals destination".into()));
        }
        
        if !self.nodes.contains_key(source) {
            return Err(LightningError::RoutingFailed("source not in graph".into()));
        }
        
        if !self.nodes.contains_key(dest) {
            return Err(LightningError::RoutingFailed("destination not in graph".into()));
        }
        
        // Dijkstra's algorithm for shortest path (by fees)
        let mut dist: HashMap<String, u64> = HashMap::new();
        let mut prev: HashMap<String, (String, [u8; 32])> = HashMap::new();
        let mut heap = BinaryHeap::new();
        
        dist.insert(source.to_string(), 0);
        heap.push(PathState {
            cost: 0,
            node: source.to_string(),
            hops: 0,
        });
        
        while let Some(PathState { cost, node, hops }) = heap.pop() {
            if node == dest {
                // Reconstruct path
                return self.reconstruct_route(source, dest, &prev, amount);
            }
            
            if hops >= max_hops {
                continue;
            }
            
            if cost > *dist.get(&node).unwrap_or(&u64::MAX) {
                continue;
            }
            
            let Some(adjacent) = self.adjacency.get(&node) else {
                continue;
            };
            
            for channel_id in adjacent {
                let Some(channel) = self.channels.get(channel_id) else {
                    continue;
                };
                
                if !channel.enabled || channel.capacity < amount {
                    continue;
                }
                
                let neighbor = if channel.node1 == node {
                    &channel.node2
                } else {
                    &channel.node1
                };
                
                let fee = channel.calculate_fee(amount);
                let new_cost = cost + fee;
                
                if new_cost < *dist.get(neighbor).unwrap_or(&u64::MAX) {
                    dist.insert(neighbor.clone(), new_cost);
                    prev.insert(neighbor.clone(), (node.clone(), *channel_id));
                    heap.push(PathState {
                        cost: new_cost,
                        node: neighbor.clone(),
                        hops: hops + 1,
                    });
                }
            }
        }
        
        Err(LightningError::RoutingFailed("no route found".into()))
    }
    
    fn reconstruct_route(
        &self,
        source: &str,
        dest: &str,
        prev: &HashMap<String, (String, [u8; 32])>,
        amount: u64,
    ) -> Result<Route> {
        let mut hops = Vec::new();
        let mut current = dest.to_string();
        let mut current_amount = amount;
        
        while current != source {
            let (prev_node, channel_id) = prev.get(&current)
                .ok_or_else(|| LightningError::RoutingFailed("broken path".into()))?;
            
            let channel = self.channels.get(channel_id)
                .ok_or_else(|| LightningError::RoutingFailed("channel not found".into()))?;
            
            let fee = channel.calculate_fee(current_amount);
            
            hops.push(RouteHop {
                pubkey: current.clone(),
                channel_id: *channel_id,
                amount: current_amount,
                fee,
                cltv_delta: channel.cltv_delta as u32,
            });
            
            current_amount += fee;
            current = prev_node.clone();
        }
        
        hops.reverse();
        Ok(Route::new(hops))
    }
    
    /// Get node count
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
    
    /// Get channel count
    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }

    /// Find multiple paths for a multi-path payment (MPP).
    ///
    /// Splits the total `amount` across up to `max_parts` independent paths.
    /// Each path is found by temporarily reducing channel capacities after
    /// each successful route is found.
    pub fn find_multi_path_route(
        &self,
        source: &str,
        dest: &str,
        amount: u64,
        max_hops: usize,
        max_parts: usize,
    ) -> Result<Vec<Route>> {
        if max_parts == 0 {
            return Err(LightningError::RoutingFailed("max_parts must be > 0".into()));
        }

        // Try single path first
        if let Ok(route) = self.find_route(source, dest, amount, max_hops) {
            return Ok(vec![route]);
        }

        // Split into parts — start by trying to divide evenly
        let part_amount = amount / (max_parts as u64);
        if part_amount == 0 {
            return Err(LightningError::RoutingFailed("amount too small to split".into()));
        }

        // Build a mutable capacity map to track remaining capacity
        let mut remaining_capacity: HashMap<[u8; 32], u64> = self
            .channels
            .iter()
            .map(|(id, ch)| (*id, ch.capacity))
            .collect();

        let mut routes = Vec::new();
        let mut remaining_amount = amount;

        for _ in 0..max_parts {
            if remaining_amount == 0 {
                break;
            }

            let try_amount = remaining_amount.min(part_amount.max(1));

            // Find a path using current remaining capacities
            match self.find_route_with_capacities(
                source,
                dest,
                try_amount,
                max_hops,
                &remaining_capacity,
            ) {
                Ok(route) => {
                    // Reduce capacities along the found path
                    for hop in &route.hops {
                        if let Some(cap) = remaining_capacity.get_mut(&hop.channel_id) {
                            *cap = cap.saturating_sub(hop.amount + hop.fee);
                        }
                    }
                    remaining_amount = remaining_amount.saturating_sub(try_amount);
                    routes.push(route);
                }
                Err(_) => break,
            }
        }

        if remaining_amount > 0 {
            return Err(LightningError::RoutingFailed(
                format!(
                    "could only route {} of {} across {} paths",
                    amount - remaining_amount,
                    amount,
                    routes.len()
                ),
            ));
        }

        Ok(routes)
    }

    /// Internal: find route using a custom capacity map instead of channel.capacity.
    fn find_route_with_capacities(
        &self,
        source: &str,
        dest: &str,
        amount: u64,
        max_hops: usize,
        capacities: &HashMap<[u8; 32], u64>,
    ) -> Result<Route> {
        if source == dest {
            return Err(LightningError::RoutingFailed("source equals destination".into()));
        }

        let mut dist: HashMap<String, u64> = HashMap::new();
        let mut prev: HashMap<String, (String, [u8; 32])> = HashMap::new();
        let mut heap = BinaryHeap::new();

        dist.insert(source.to_string(), 0);
        heap.push(PathState {
            cost: 0,
            node: source.to_string(),
            hops: 0,
        });

        while let Some(PathState { cost, node, hops }) = heap.pop() {
            if node == dest {
                return self.reconstruct_route(source, dest, &prev, amount);
            }

            if hops >= max_hops {
                continue;
            }

            if cost > *dist.get(&node).unwrap_or(&u64::MAX) {
                continue;
            }

            let Some(adjacent) = self.adjacency.get(&node) else {
                continue;
            };

            for channel_id in adjacent {
                let Some(channel) = self.channels.get(channel_id) else {
                    continue;
                };

                let cap = capacities.get(channel_id).copied().unwrap_or(0);
                if !channel.enabled || cap < amount {
                    continue;
                }

                let neighbor = if channel.node1 == node {
                    &channel.node2
                } else {
                    &channel.node1
                };

                let fee = channel.calculate_fee(amount);
                let new_cost = cost + fee;

                if new_cost < *dist.get(neighbor).unwrap_or(&u64::MAX) {
                    dist.insert(neighbor.clone(), new_cost);
                    prev.insert(neighbor.clone(), (node.clone(), *channel_id));
                    heap.push(PathState {
                        cost: new_cost,
                        node: neighbor.clone(),
                        hops: hops + 1,
                    });
                }
            }
        }

        Err(LightningError::RoutingFailed("no route found".into()))
    }
}

/// State for Dijkstra priority queue
#[derive(Debug, Clone, Eq, PartialEq)]
struct PathState {
    cost: u64,
    node: String,
    hops: usize,
}

impl Ord for PathState {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering for min-heap
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for PathState {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn create_test_graph() -> NetworkGraph {
        let mut graph = NetworkGraph::new();
        
        // Add nodes
        graph.add_node(GraphNode {
            pubkey: "alice".into(),
            alias: "Alice".into(),
            channels: vec![],
            last_update: 0,
        });
        graph.add_node(GraphNode {
            pubkey: "bob".into(),
            alias: "Bob".into(),
            channels: vec![],
            last_update: 0,
        });
        graph.add_node(GraphNode {
            pubkey: "carol".into(),
            alias: "Carol".into(),
            channels: vec![],
            last_update: 0,
        });
        
        // Add channels
        graph.add_channel(GraphChannel {
            channel_id: [1u8; 32],
            node1: "alice".into(),
            node2: "bob".into(),
            capacity: 1_000_000,
            fee_base_msat: 1000,
            fee_rate_millionths: 100,
            cltv_delta: 40,
            enabled: true,
        });
        
        graph.add_channel(GraphChannel {
            channel_id: [2u8; 32],
            node1: "bob".into(),
            node2: "carol".into(),
            capacity: 1_000_000,
            fee_base_msat: 1000,
            fee_rate_millionths: 100,
            cltv_delta: 40,
            enabled: true,
        });
        
        graph
    }
    
    #[test]
    fn test_graph_creation() {
        let graph = create_test_graph();
        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.channel_count(), 2);
    }
    
    #[test]
    fn test_find_direct_route() {
        let graph = create_test_graph();
        let route = graph.find_route("alice", "bob", 10_000, 3);
        assert!(route.is_ok());
        
        let route = route.unwrap();
        assert_eq!(route.num_hops(), 1);
    }
    
    #[test]
    fn test_find_multi_hop_route() {
        let graph = create_test_graph();
        let route = graph.find_route("alice", "carol", 10_000, 3);
        assert!(route.is_ok());
        
        let route = route.unwrap();
        assert_eq!(route.num_hops(), 2);
    }
    
    #[test]
    fn test_no_route() {
        let mut graph = NetworkGraph::new();
        graph.add_node(GraphNode {
            pubkey: "alice".into(),
            alias: "Alice".into(),
            channels: vec![],
            last_update: 0,
        });
        graph.add_node(GraphNode {
            pubkey: "bob".into(),
            alias: "Bob".into(),
            channels: vec![],
            last_update: 0,
        });
        // No channels connecting them
        
        let route = graph.find_route("alice", "bob", 10_000, 3);
        assert!(route.is_err());
    }
    
    #[test]
    fn test_fee_calculation() {
        let channel = GraphChannel {
            channel_id: [0u8; 32],
            node1: "a".into(),
            node2: "b".into(),
            capacity: 1_000_000,
            fee_base_msat: 1000,  // 1 sat base
            fee_rate_millionths: 1000,  // 0.1%
            cltv_delta: 40,
            enabled: true,
        };
        
        // For 100_000 sats: 1 + 100 = 101 sats fee
        let fee = channel.calculate_fee(100_000);
        assert_eq!(fee, 101);
    }
    
    #[test]
    fn test_route_validity() {
        let route = Route::new(vec![RouteHop {
            pubkey: "test".into(),
            channel_id: [0u8; 32],
            amount: 1000,
            fee: 1,
            cltv_delta: 40,
        }]);
        
        assert!(route.is_valid());
        
        let empty_route = Route::new(vec![]);
        assert!(!empty_route.is_valid());
    }
    
    #[test]
    fn test_fee_calculation_large_amount() {
        // u64::MAX amount should not panic — uses u128 intermediate
        let channel = GraphChannel {
            channel_id: [0u8; 32],
            node1: "a".into(),
            node2: "b".into(),
            capacity: u64::MAX,
            fee_base_msat: 1000,
            fee_rate_millionths: 1_000_000, // 100% fee
            cltv_delta: 40,
            enabled: true,
        };
        let fee = channel.calculate_fee(u64::MAX);
        // base=1, proportional = u64::MAX (approx), base + prop saturates
        assert!(fee > 0);
    }

    #[test]
    fn test_mpp_single_path_sufficient() {
        let graph = create_test_graph();
        // Amount fits in single path
        let routes = graph.find_multi_path_route("alice", "carol", 10_000, 5, 3);
        assert!(routes.is_ok());
        let routes = routes.unwrap();
        assert_eq!(routes.len(), 1); // single path sufficient
    }

    #[test]
    fn test_mpp_splits_across_parallel_paths() {
        let mut graph = NetworkGraph::new();
        for name in &["alice", "bob", "carol", "dave"] {
            graph.add_node(GraphNode {
                pubkey: name.to_string(),
                alias: name.to_string(),
                channels: vec![],
                last_update: 0,
            });
        }
        // Two parallel paths alice->bob->dave and alice->carol->dave
        // Each channel has 60k capacity
        graph.add_channel(GraphChannel {
            channel_id: [1u8; 32],
            node1: "alice".into(), node2: "bob".into(),
            capacity: 60_000, fee_base_msat: 1000, fee_rate_millionths: 100,
            cltv_delta: 40, enabled: true,
        });
        graph.add_channel(GraphChannel {
            channel_id: [2u8; 32],
            node1: "bob".into(), node2: "dave".into(),
            capacity: 60_000, fee_base_msat: 1000, fee_rate_millionths: 100,
            cltv_delta: 40, enabled: true,
        });
        graph.add_channel(GraphChannel {
            channel_id: [3u8; 32],
            node1: "alice".into(), node2: "carol".into(),
            capacity: 60_000, fee_base_msat: 1000, fee_rate_millionths: 100,
            cltv_delta: 40, enabled: true,
        });
        graph.add_channel(GraphChannel {
            channel_id: [4u8; 32],
            node1: "carol".into(), node2: "dave".into(),
            capacity: 60_000, fee_base_msat: 1000, fee_rate_millionths: 100,
            cltv_delta: 40, enabled: true,
        });

        // 100k doesn't fit in one path (60k max), but fits in two
        let routes = graph.find_multi_path_route("alice", "dave", 100_000, 5, 4);
        assert!(routes.is_ok());
        let routes = routes.unwrap();
        assert!(routes.len() >= 2);
    }

    #[test]
    fn test_mpp_zero_parts_rejected() {
        let graph = create_test_graph();
        let result = graph.find_multi_path_route("alice", "carol", 10_000, 5, 0);
        assert!(result.is_err());
    }
}
