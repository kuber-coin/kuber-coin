using Microsoft.UI.Xaml.Controls;
using System;
using System.Runtime.InteropServices.WindowsRuntime;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class AlertsView : Page
    {
        public AlertsViewModel ViewModel { get; }

        public AlertsView()
        {
            this.InitializeComponent();
            ViewModel = new AlertsViewModel();
        }

        private async void AddAlert_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            var dialog = new ContentDialog
            {
                Title = "Add Alert Rule",
                PrimaryButtonText = "Add",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Primary,
                XamlRoot = this.XamlRoot
            };

            var panel = new StackPanel { Spacing = 16 };
            
            var nameBox = new TextBox { Header = "Rule Name", PlaceholderText = "e.g., High Temperature Alert" };
            
            var typeCombo = new ComboBox { Header = "Alert Type", HorizontalAlignment = Microsoft.UI.Xaml.HorizontalAlignment.Stretch };
            typeCombo.Items.Add("Temperature");
            typeCombo.Items.Add("Hashrate");
            typeCombo.Items.Add("Power");
            typeCombo.Items.Add("Offline Device");
            typeCombo.SelectedIndex = 0;
            
            var conditionCombo = new ComboBox { Header = "Condition", HorizontalAlignment = Microsoft.UI.Xaml.HorizontalAlignment.Stretch };
            conditionCombo.Items.Add("Greater than");
            conditionCombo.Items.Add("Less than");
            conditionCombo.Items.Add("Equals");
            conditionCombo.SelectedIndex = 0;
            
            var thresholdBox = new TextBox { Header = "Threshold Value", PlaceholderText = "e.g., 75" };
            
            panel.Children.Add(nameBox);
            panel.Children.Add(typeCombo);
            panel.Children.Add(conditionCombo);
            panel.Children.Add(thresholdBox);
            
            dialog.Content = panel;

            var result = await dialog.ShowAsync();
            
            if (result == ContentDialogResult.Primary && !string.IsNullOrWhiteSpace(nameBox.Text))
            {
                ViewModel.AddAlertRule(
                    nameBox.Text,
                    typeCombo.SelectedItem?.ToString() ?? "Temperature",
                    conditionCombo.SelectedItem?.ToString() ?? "Greater than",
                    thresholdBox.Text
                );
            }
        }
    }
}
