using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.Models
{
    public partial class MiningDevice : ObservableObject
    {
        [ObservableProperty]
        private string _name = string.Empty;
        
        [ObservableProperty]
        private string _model = string.Empty;
        
        [ObservableProperty]
        private string _hashrate = "0 MH/s";
        
        [ObservableProperty]
        private string _temperature = "0°C";
        
        [ObservableProperty]
        private SolidColorBrush? _tempColor;
        
        [ObservableProperty]
        private string _power = "0W";
        
        [ObservableProperty]
        private string _fanSpeed = "0%";
        
        [ObservableProperty]
        private string _gpuUtilization = "0%";
        
        [ObservableProperty]
        private double _gpuUtilizationValue = 0;
        
        [ObservableProperty]
        private string _memoryUtilization = "0%";
        
        [ObservableProperty]
        private double _memoryUtilizationValue = 0;
        
        [ObservableProperty]
        private bool _isActive = true;
    }
}
