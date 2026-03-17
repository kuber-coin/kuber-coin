using Microsoft.UI.Xaml.Controls;
using System;
using System.Runtime.InteropServices.WindowsRuntime;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class PoolsView : Page
    {
        public PoolsViewModel ViewModel { get; }

        public PoolsView()
        {
            this.InitializeComponent();
            ViewModel = new PoolsViewModel();
        }

        private async void AddPool_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            var dialog = new ContentDialog
            {
                Title = "Add New Pool",
                PrimaryButtonText = "Add",
                CloseButtonText = "Cancel",
                DefaultButton = ContentDialogButton.Primary,
                XamlRoot = this.XamlRoot
            };

            var panel = new StackPanel { Spacing = 16 };
            
            var nameBox = new TextBox { Header = "Pool Name", PlaceholderText = "e.g., KuberCoin Pool" };
            var urlBox = new TextBox { Header = "Pool URL", PlaceholderText = "e.g., pool.kubercoin.com:3333" };
            var walletBox = new TextBox { Header = "Wallet Address", PlaceholderText = "Your wallet address" };
            var workerBox = new TextBox { Header = "Worker Name", PlaceholderText = "e.g., rig001" };
            
            panel.Children.Add(nameBox);
            panel.Children.Add(urlBox);
            panel.Children.Add(walletBox);
            panel.Children.Add(workerBox);
            
            dialog.Content = panel;

            var result = await dialog.ShowAsync();
            
            if (result == ContentDialogResult.Primary)
            {
                ViewModel.AddPool(nameBox.Text, urlBox.Text, walletBox.Text, workerBox.Text);
            }
        }
    }
}
