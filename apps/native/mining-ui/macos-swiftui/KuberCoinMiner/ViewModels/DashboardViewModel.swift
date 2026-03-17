import SwiftUI

class DashboardViewModel: ObservableObject {
    @Published var isMining = false
    @Published var miningStatus = "Mining"
    @Published var gpuCount = 4
    @Published var cpuCount = 1
    @Published var dailyProfit = "0.0191616"
    @Published var dailyProfitUsd = "≈ $ 141.69"
    @Published var unpaidBalance = "0.0191616"
    @Published var unpaidBalanceUsd = "≈ $ 141.69"
    @Published var activePool = "pool.kuber-coin.com:3333"
    @Published var shareAcceptance = "99.2%"
    @Published var devices: [DeviceInfo] = []
    
    init() {
        loadDevices()
    }
    
    func toggleMining() {
        isMining.toggle()
        miningStatus = isMining ? "Mining" : "Paused"
    }
    
    private func loadDevices() {
        devices = [
            DeviceInfo(id: "gpu0", name: "GPU 0", hashrate: "125 MH/s", temperature: "62°C", power: "180W"),
            DeviceInfo(id: "gpu1", name: "GPU 1", hashrate: "124 MH/s", temperature: "64°C", power: "182W"),
            DeviceInfo(id: "gpu2", name: "GPU 2", hashrate: "126 MH/s", temperature: "61°C", power: "179W"),
            DeviceInfo(id: "gpu3", name: "GPU 3", hashrate: "125 MH/s", temperature: "63°C", power: "181W"),
            DeviceInfo(id: "cpu0", name: "CPU 0", hashrate: "15 MH/s", temperature: "58°C", power: "95W")
        ]
    }
}
