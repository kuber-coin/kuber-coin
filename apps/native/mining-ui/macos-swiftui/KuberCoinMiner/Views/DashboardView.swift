import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Mining Control Button
                Button(action: {
                    viewModel.toggleMining()
                }) {
                    VStack(spacing: 8) {
                        Image(systemName: viewModel.isMining ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(KuberTheme.accent)
                        Text(viewModel.miningStatus)
                            .font(.subheadline)
                            .foregroundStyle(KuberTheme.muted)
                    }
                    .frame(width: 120, height: 120)
                    .background(KuberTheme.surface)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(KuberTheme.accent, lineWidth: 3))
                    .shadow(color: KuberTheme.accent.opacity(0.25), radius: 18)
                }
                .buttonStyle(.plain)
                
                // Metrics Row
                HStack(spacing: 16) {
                    MetricCard(value: "\(viewModel.gpuCount)", label: "GPU'S")
                    MetricCard(value: "\(viewModel.cpuCount)", label: "CPU")
                    
                    CardView {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("CURRENT PROFITABILITY")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text(viewModel.dailyProfit)
                                    .font(.title)
                                    .fontWeight(.semibold)
                                Text("BTC / 24h")
                                    .font(.subheadline)
                                    .foregroundStyle(KuberTheme.muted)
                            }
                            
                            Text(viewModel.dailyProfitUsd)
                                .font(.subheadline)
                                .foregroundStyle(KuberTheme.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                
                // Unpaid Balance
                CardView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("UNPAID BALANCE")
                            .font(.caption)
                            .foregroundStyle(KuberTheme.muted)
                        
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(viewModel.unpaidBalance)
                                .font(.largeTitle)
                                .fontWeight(.semibold)
                            Text("BTC")
                                .font(.title3)
                                .foregroundStyle(KuberTheme.muted)
                        }
                        
                        Text(viewModel.unpaidBalanceUsd)
                            .font(.title3)
                            .foregroundStyle(KuberTheme.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                
                // Device List
                CardView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("MINING DEVICES")
                            .font(.headline)
                            .foregroundStyle(KuberTheme.text)
                        
                        VStack(spacing: 0) {
                            // Header
                            HStack {
                                Text("Device")
                                    .frame(width: 150, alignment: .leading)
                                Text("Hashrate")
                                    .frame(width: 120, alignment: .leading)
                                Text("Temp")
                                    .frame(width: 100, alignment: .leading)
                                Text("Power")
                                    .frame(width: 100, alignment: .leading)
                            }
                            .font(.caption)
                            .foregroundStyle(KuberTheme.muted)
                            .padding(.bottom, 8)
                            
                            Divider()
                            
                            // Device rows
                            ForEach(viewModel.devices) { device in
                                HStack {
                                    Text(device.name)
                                        .frame(width: 150, alignment: .leading)
                                    Text(device.hashrate)
                                        .frame(width: 120, alignment: .leading)
                                    Text(device.temperature)
                                        .frame(width: 100, alignment: .leading)
                                        .foregroundStyle(.green)
                                    Text(device.power)
                                        .frame(width: 100, alignment: .leading)
                                }
                                .padding(.vertical, 8)
                                
                                if device.id != viewModel.devices.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                }
                
                // Active Pool
                CardView {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("ACTIVE POOL")
                                .font(.caption)
                                .foregroundStyle(KuberTheme.muted)
                            Text(viewModel.activePool)
                                .font(.headline)
                                .foregroundStyle(KuberTheme.text)
                        }
                        
                        Spacer()
                        
                        VStack(alignment: .trailing, spacing: 4) {
                            Text("SHARE ACCEPTANCE")
                                .font(.caption)
                                .foregroundStyle(KuberTheme.muted)
                            Text(viewModel.shareAcceptance)
                                .font(.headline)
                                .foregroundStyle(KuberTheme.accentSoft)
                        }
                    }
                }
            }
            .padding(24)
        }
        .background(KuberTheme.background)
    }
}

struct MetricCard: View {
    let value: String
    let label: String
    
    var body: some View {
        CardView {
            VStack(spacing: 8) {
                Text(value)
                    .font(.system(size: 48, weight: .bold))
                    .foregroundStyle(KuberTheme.text)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(KuberTheme.muted)
            }
        }
    }
}

struct CardView<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
    var body: some View {
        content
            .padding(20)
            .background(KuberTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(KuberTheme.border, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.18), radius: 18, y: 10)
    }
}

#Preview {
    DashboardView()
}
