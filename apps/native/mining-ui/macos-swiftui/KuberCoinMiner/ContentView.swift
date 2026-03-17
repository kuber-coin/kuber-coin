import SwiftUI

struct ContentView: View {
    @State private var selectedView = "Dashboard"
    
    var body: some View {
        NavigationSplitView {
            // Sidebar
            List(selection: $selectedView) {
                NavigationLink("Dashboard", value: "Dashboard")
                NavigationLink("Devices", value: "Devices")
                NavigationLink("Pools", value: "Pools")
                NavigationLink("Overclocking", value: "Overclocking")
                NavigationLink("Charts", value: "Charts")
                NavigationLink("Alerts", value: "Alerts")
            }
            .navigationTitle("KuberCoin Miner")
            .frame(minWidth: 200)
            .scrollContentBackground(.hidden)
            .background(KuberTheme.surfaceStrong)
        } detail: {
            // Main content
            switch selectedView {
            case "Dashboard":
                DashboardView()
            case "Devices":
                DevicesView()
            case "Pools":
                PoolsView()
            case "Overclocking":
                OverclockingView()
            case "Charts":
                ChartsView()
            case "Alerts":
                AlertsView()
            default:
                DashboardView()
            }
            .background(KuberTheme.background)
        }
        .frame(minWidth: 1200, minHeight: 800)
        .background(KuberTheme.background)
        .tint(KuberTheme.accent)
    }
}

#Preview {
    ContentView()
}
