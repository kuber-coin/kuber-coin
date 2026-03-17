using Microsoft.UI.Xaml.Controls;
using KuberCoinMiner.ViewModels;

namespace KuberCoinMiner.Views
{
    public sealed partial class DevicesView : Page
    {
        public DevicesViewModel ViewModel { get; }

        public DevicesView()
        {
            this.InitializeComponent();
            ViewModel = new DevicesViewModel();
        }
    }
}
