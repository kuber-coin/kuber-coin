using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using KuberCoinMiner.Models;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.ViewModels
{
    public partial class AlertsViewModel : ObservableObject
    {
        [ObservableProperty]
        private bool _enableNotifications = true;
        
        [ObservableProperty]
        private bool _playSound = true;
        
        [ObservableProperty]
        private bool _sendEmail = false;
        
        [ObservableProperty]
        private string _emailAddress = string.Empty;
        
        [ObservableProperty]
        private int _checkInterval = 1; // Every minute

        public ObservableCollection<AlertRule> AlertRules { get; }
        public ObservableCollection<AlertHistory> RecentAlerts { get; }

        public AlertsViewModel()
        {
            AlertRules = new ObservableCollection<AlertRule>
            {
                new AlertRule
                {
                    Name = "GPU Temperature Warning",
                    Description = "Alert when GPU temperature exceeds safe threshold",
                    Icon = "\uE7A6", // Temperature icon
                    Severity = new SolidColorBrush(Colors.Orange),
                    IsEnabled = true,
                    Condition = "Greater than",
                    Threshold = "75°C",
                    LastTriggered = "2 hours ago"
                },
                new AlertRule
                {
                    Name = "Hashrate Drop",
                    Description = "Alert when hashrate drops significantly",
                    Icon = "\uE74C", // Warning icon
                    Severity = new SolidColorBrush(Colors.Red),
                    IsEnabled = true,
                    Condition = "Less than",
                    Threshold = "450 MH/s",
                    LastTriggered = "Never"
                },
                new AlertRule
                {
                    Name = "GPU Offline",
                    Description = "Alert when GPU becomes unresponsive",
                    Icon = "\uE711", // Disconnect icon
                    Severity = new SolidColorBrush(Colors.Red),
                    IsEnabled = true,
                    Condition = "Equals",
                    Threshold = "Offline",
                    LastTriggered = "Never"
                },
                new AlertRule
                {
                    Name = "High Power Consumption",
                    Description = "Alert when total power exceeds limit",
                    Icon = "\uE945", // Power icon
                    Severity = new SolidColorBrush(Colors.Orange),
                    IsEnabled = false,
                    Condition = "Greater than",
                    Threshold = "900W",
                    LastTriggered = "5 days ago"
                },
                new AlertRule
                {
                    Name = "Pool Connection Lost",
                    Description = "Alert when pool connection is lost",
                    Icon = "\uE774", // Network icon
                    Severity = new SolidColorBrush(Colors.Orange),
                    IsEnabled = true,
                    Condition = "Equals",
                    Threshold = "Disconnected",
                    LastTriggered = "Yesterday"
                }
            };

            RecentAlerts = new ObservableCollection<AlertHistory>
            {
                new AlertHistory
                {
                    Message = "GPU 1 Temperature High",
                    Details = "Temperature reached 76°C (threshold: 75°C)",
                    Timestamp = "2 hours ago",
                    SeverityColor = new SolidColorBrush(Colors.Orange)
                },
                new AlertHistory
                {
                    Message = "Pool Connection Restored",
                    Details = "Successfully reconnected to pool.kubercoin.com",
                    Timestamp = "5 hours ago",
                    SeverityColor = new SolidColorBrush(Colors.Green)
                },
                new AlertHistory
                {
                    Message = "GPU 2 Temperature High",
                    Details = "Temperature reached 77°C (threshold: 75°C)",
                    Timestamp = "6 hours ago",
                    SeverityColor = new SolidColorBrush(Colors.Orange)
                }
            };
        }

        public void AddAlertRule(string name, string type, string condition, string threshold)
        {
            var icon = type switch
            {
                "Temperature" => "\uE7A6",
                "Hashrate" => "\uE74C",
                "Power" => "\uE945",
                "Offline Device" => "\uE711",
                _ => "\uE7BA"
            };

            AlertRules.Add(new AlertRule
            {
                Name = name,
                Description = $"Alert for {type.ToLower()} monitoring",
                Icon = icon,
                Severity = new SolidColorBrush(Colors.Orange),
                IsEnabled = true,
                Condition = condition,
                Threshold = threshold,
                LastTriggered = "Never"
            });
        }
    }
}
