import Foundation

class MiningService {
    private let rpcUrl: String
    private let apiKey: String
    
    init() {
        self.rpcUrl = ProcessInfo.processInfo.environment["KUBERCOIN_RPC_URL"] ?? "http://127.0.0.1:8332"
        self.apiKey = ProcessInfo.processInfo.environment["KUBERCOIN_API_KEY"] ?? ""
    }
    
    func startMining() async throws {
        try await sendRpcCommand(method: "startmining", params: [])
    }
    
    func stopMining() async throws {
        try await sendRpcCommand(method: "stopmining", params: [])
    }
    
    private func sendRpcCommand(method: String, params: [Any]) async throws {
        guard !apiKey.isEmpty else {
            throw NSError(
                domain: "Missing API key",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "Missing env var: KUBERCOIN_API_KEY"]
            )
        }

        guard let url = URL(string: rpcUrl) else {
            throw NSError(domain: "Invalid URL", code: -1)
        }
        
        let requestBody: [String: Any] = [
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        ]
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        
        let (_, _) = try await URLSession.shared.data(for: request)
    }
}
