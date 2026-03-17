using CommunityToolkit.Mvvm.ComponentModel;
using System;
using System.Collections.ObjectModel;
using System.Threading;
using System.Threading.Tasks;
using KuberCoinMiner.Models;
using KuberCoinMiner.Services;

namespace KuberCoinMiner.ViewModels
{
    public partial class DashboardViewModel : ObservableObject, IDisposable
    {
        private readonly MiningService _miningService;

        private readonly CancellationTokenSource _monitoringCts = new();

        private bool _disposed;
        
        [ObservableProperty]
        private bool _isMining;
        
        [ObservableProperty]
        private string _miningStatus = "Mining";
        
        [ObservableProperty]
        private string _miningIcon = "\uE768"; // Play icon
        
        [ObservableProperty]
        private int _gpuCount = 4;
        
        [ObservableProperty]
        private int _cpuCount = 1;
        
        [ObservableProperty]
        private string _dailyProfit = "0.0191616";
        
        [ObservableProperty]
        private string _dailyProfitUsd = "≈ $ 141.69";
        
        [ObservableProperty]
        private string _unpaidBalance = "0.0191616";
        
        [ObservableProperty]
        private string _unpaidBalanceUsd = "≈ $ 141.69";
        
        [ObservableProperty]
        private string _activePool = "pool.kubercoin.com:3333";
        
        [ObservableProperty]
        private string _shareAcceptance = "99.2%";
        
        public ObservableCollection<DeviceInfo> Devices { get; }

        public DashboardViewModel()
        {
            _miningService = new MiningService();
            Devices = new ObservableCollection<DeviceInfo>
            {
                new DeviceInfo { Name = "GPU 0", Hashrate = "125 MH/s", Temperature = "62°C", Power = "180W" },
                new DeviceInfo { Name = "GPU 1", Hashrate = "124 MH/s", Temperature = "64°C", Power = "182W" },
                new DeviceInfo { Name = "GPU 2", Hashrate = "126 MH/s", Temperature = "61°C", Power = "179W" },
                new DeviceInfo { Name = "GPU 3", Hashrate = "125 MH/s", Temperature = "63°C", Power = "181W" },
                new DeviceInfo { Name = "CPU 0", Hashrate = "15 MH/s", Temperature = "58°C", Power = "95W" }
            };
            
            _ = StartMonitoringAsync(_monitoringCts.Token);
        }

        public void Dispose()
        {
            Dispose(disposing: true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (_disposed)
            {
                return;
            }

            if (disposing)
            {
                try
                {
                    _monitoringCts.Cancel();
                }
                catch (ObjectDisposedException)
                {
                    // Ignore
                }

                _monitoringCts.Dispose();
            }

            _disposed = true;
        }

        public async Task ToggleMiningAsync()
        {
            if (IsMining)
            {
                await _miningService.StopMiningAsync();
                IsMining = false;
                MiningStatus = "Paused";
                MiningIcon = "\uE768"; // Play
            }
            else
            {
                await _miningService.StartMiningAsync();
                IsMining = true;
                MiningStatus = "Mining";
                MiningIcon = "\uE769"; // Pause
            }
        }

        private static async Task StartMonitoringAsync(CancellationToken cancellationToken)
        {
            try
            {
                // Start background monitoring
                while (!cancellationToken.IsCancellationRequested)
                {
                    // Update metrics from mining service
                    await Task.Delay(1000, cancellationToken);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Expected on shutdown
            }
        }
    }
}
