using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.Models
{
    public partial class AlertRule : ObservableObject
    {
        [ObservableProperty]
        private string _name = string.Empty;
        
        [ObservableProperty]
        private string _description = string.Empty;
        
        [ObservableProperty]
        private string _icon = "\uE7BA";
        
        [ObservableProperty]
        private SolidColorBrush? _severity;
        
        [ObservableProperty]
        private bool _isEnabled = true;
        
        [ObservableProperty]
        private string _condition = string.Empty;
        
        [ObservableProperty]
        private string _threshold = string.Empty;
        
        [ObservableProperty]
        private string _lastTriggered = "Never";
    }

    public partial class AlertHistory : ObservableObject
    {
        [ObservableProperty]
        private string _message = string.Empty;
        
        [ObservableProperty]
        private string _details = string.Empty;
        
        [ObservableProperty]
        private string _timestamp = string.Empty;
        
        [ObservableProperty]
        private SolidColorBrush? _severityColor;
    }
}
