using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using KuberCoinMiner.Models;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.ViewModels
{
    public partial class PoolsViewModel : ObservableObject
    {
        public ObservableCollection<MiningPool> Pools { get; }

        public PoolsViewModel()
        {
            Pools = new ObservableCollection<MiningPool>
            {
                new MiningPool
                {
                    Name = "KuberCoin Official",
                    Url = "pool.kubercoin.com:3333",
                    Status = "Connected",
                    StatusColor = new SolidColorBrush(Colors.Green),
                    IsEnabled = true,
                    AcceptedShares = 15243,
                    RejectedShares = 12,
                    Uptime = "23h 45m",
                    WorkerName = "rig001",
                    WalletAddress = "KBR1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0",
                    Priority = 0,
                    AutoRestart = true,
                    UseSsl = true
                },
                new MiningPool
                {
                    Name = "Backup Pool",
                    Url = "pool2.kubercoin.com:3333",
                    Status = "Standby",
                    StatusColor = new SolidColorBrush(Colors.Orange),
                    IsEnabled = true,
                    AcceptedShares = 0,
                    RejectedShares = 0,
                    Uptime = "0h 0m",
                    WorkerName = "rig001",
                    WalletAddress = "KBR1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0",
                    Priority = 1,
                    AutoRestart = true,
                    UseSsl = true
                }
            };
        }

        public void AddPool(string name, string url, string wallet, string worker)
        {
            Pools.Add(new MiningPool
            {
                Name = name,
                Url = url,
                Status = "Not Connected",
                StatusColor = new SolidColorBrush(Colors.Gray),
                IsEnabled = false,
                WalletAddress = wallet,
                WorkerName = worker,
                Priority = Pools.Count,
                AutoRestart = true,
                UseSsl = false
            });
        }
    }
}
