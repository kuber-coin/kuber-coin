using Microsoft.UI.Xaml.Controls;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class OverclockingView : Page
    {
        public OverclockingViewModel ViewModel { get; }

        public OverclockingView()
        {
            this.InitializeComponent();
            ViewModel = new OverclockingViewModel();
        }
    }
}
