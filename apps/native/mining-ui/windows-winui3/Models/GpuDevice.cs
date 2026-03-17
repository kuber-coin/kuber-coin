using CommunityToolkit.Mvvm.ComponentModel;

namespace KuberCoinMiner.Models
{
    public partial class GpuDevice : ObservableObject
    {
        [ObservableProperty]
        private string _name = string.Empty;
        
        [ObservableProperty]
        private string _model = string.Empty;
        
        [ObservableProperty]
        private string _temperature = "0°C";
        
        [ObservableProperty]
        private string _powerDraw = "0W";
        
        [ObservableProperty]
        private string _coreClock = "0 MHz";
        
        [ObservableProperty]
        private string _memoryClock = "0 MHz";
        
        [ObservableProperty]
        private int _powerLimit = 100;
        
        [ObservableProperty]
        private int _coreClockOffset = 0;
        
        [ObservableProperty]
        private int _memoryClockOffset = 0;
        
        [ObservableProperty]
        private int _fanSpeed = 0;
        
        [ObservableProperty]
        private bool _isOverclockEnabled = false;
    }
}
