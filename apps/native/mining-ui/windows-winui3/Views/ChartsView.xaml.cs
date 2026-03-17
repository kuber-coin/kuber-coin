using Microsoft.UI.Xaml.Controls;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class ChartsView : Page
    {
        public ChartsViewModel ViewModel { get; }

        public ChartsView()
        {
            this.InitializeComponent();
            ViewModel = new ChartsViewModel();
        }

        private void TimeRange_Changed(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
        {
            if (sender is RadioButton radio && radio.Tag is string tag)
            {
                ViewModel.UpdateTimeRange(tag);
            }
        }
    }
}
