using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.Models
{
    public partial class MiningPool : ObservableObject
    {
        [ObservableProperty]
        private string _name = string.Empty;
        
        [ObservableProperty]
        private string _url = string.Empty;
        
        [ObservableProperty]
        private string _status = "Not Connected";
        
        [ObservableProperty]
        private SolidColorBrush? _statusColor;
        
        [ObservableProperty]
        private bool _isEnabled = false;
        
        [ObservableProperty]
        private int _acceptedShares = 0;
        
        [ObservableProperty]
        private int _rejectedShares = 0;
        
        [ObservableProperty]
        private string _uptime = "0h 0m";
        
        [ObservableProperty]
        private string _workerName = string.Empty;
        
        [ObservableProperty]
        private string _walletAddress = string.Empty;
        
        [ObservableProperty]
        private int _priority = 0;
        
        [ObservableProperty]
        private bool _autoRestart = true;
        
        [ObservableProperty]
        private bool _useSsl = false;
    }
}
