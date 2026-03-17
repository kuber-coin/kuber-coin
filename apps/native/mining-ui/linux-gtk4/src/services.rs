use reqwest::Client;
use serde_json::{json, Value};
use std::env;

pub struct MiningService {
    client: Client,
    rpc_url: String,
    api_key: String,
}

impl MiningService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            rpc_url: env::var("KUBERCOIN_RPC_URL").unwrap_or_else(|_| "http://127.0.0.1:8332".to_string()),
            api_key: env::var("KUBERCOIN_API_KEY")
                .expect("KUBERCOIN_API_KEY environment variable must be set"),
        }
    }

    pub async fn send_rpc_command(&self, method: &str, params: Vec<Value>) -> Result<Value, Box<dyn std::error::Error>> {
        let request_body = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        });

        let response = self.client
            .post(&self.rpc_url)
            .header("Authorization", format!("Bearer {}", &self.api_key))
            .header("X-API-Key", &self.api_key)
            .json(&request_body)
            .send()
            .await?;

        let result: Value = response.json().await?;
        Ok(result)
    }

    pub async fn start_mining(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.send_rpc_command("startmining", vec![]).await?;
        Ok(())
    }

    pub async fn stop_mining(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.send_rpc_command("stopmining", vec![]).await?;
        Ok(())
    }
}
