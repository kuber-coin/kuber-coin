using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using KuberCoinMiner.Views;

namespace KuberCoinMiner
{
    public sealed partial class MainWindow : Window
    {
        private readonly Frame _contentFrame;

        public MainWindow()
        {
            this.InitializeComponent();
            this.Title = "KuberCoin Miner";

            _contentFrame = ContentFrame;
            
            // Load dashboard by default
            _contentFrame.Navigate(typeof(DashboardView));
        }

        private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
        {
            if (args.SelectedItem is NavigationViewItem item)
            {
                var tag = item.Tag.ToString();
                switch (tag)
                {
                    case "Dashboard":
                        _contentFrame.Navigate(typeof(DashboardView));
                        break;
                    case "Devices":
                        _contentFrame.Navigate(typeof(DevicesView));
                        break;
                    case "Pools":
                        _contentFrame.Navigate(typeof(PoolsView));
                        break;
                    case "Overclocking":
                        _contentFrame.Navigate(typeof(OverclockingView));
                        break;
                    case "Charts":
                        _contentFrame.Navigate(typeof(ChartsView));
                        break;
                    case "Alerts":
                        _contentFrame.Navigate(typeof(AlertsView));
                        break;
                }
            }
        }
    }
}
