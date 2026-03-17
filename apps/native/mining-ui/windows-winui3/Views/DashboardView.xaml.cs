using Microsoft.UI.Xaml.Controls;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class DashboardView : Page
    {
        public DashboardViewModel ViewModel { get; }

        public DashboardView()
        {
            this.InitializeComponent();
            ViewModel = new DashboardViewModel();
        }

        private async void ToggleMining_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            await ViewModel.ToggleMiningAsync();
        }
    }
}
