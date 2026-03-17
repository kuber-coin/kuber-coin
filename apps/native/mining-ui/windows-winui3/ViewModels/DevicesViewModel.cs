using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using KuberCoinMiner.Models;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace KuberCoinMiner.ViewModels
{
    public partial class DevicesViewModel : ObservableObject
    {
        private const string GpuModel = "NVIDIA GeForce RTX 3080";

        public ObservableCollection<MiningDevice> Devices { get; }

        public DevicesViewModel()
        {
            Devices = new ObservableCollection<MiningDevice>
            {
                new MiningDevice
                {
                    Name = "GPU 0",
                    Model = GpuModel,
                    Hashrate = "125 MH/s",
                    Temperature = "62°C",
                    TempColor = new SolidColorBrush(Colors.Green),
                    Power = "180W",
                    FanSpeed = "65%",
                    GpuUtilization = "98%",
                    GpuUtilizationValue = 98,
                    MemoryUtilization = "85%",
                    MemoryUtilizationValue = 85,
                    IsActive = true
                },
                new MiningDevice
                {
                    Name = "GPU 1",
                    Model = GpuModel,
                    Hashrate = "124 MH/s",
                    Temperature = "64°C",
                    TempColor = new SolidColorBrush(Colors.Green),
                    Power = "182W",
                    FanSpeed = "68%",
                    GpuUtilization = "97%",
                    GpuUtilizationValue = 97,
                    MemoryUtilization = "84%",
                    MemoryUtilizationValue = 84,
                    IsActive = true
                },
                new MiningDevice
                {
                    Name = "GPU 2",
                    Model = GpuModel,
                    Hashrate = "126 MH/s",
                    Temperature = "61°C",
                    TempColor = new SolidColorBrush(Colors.Green),
                    Power = "179W",
                    FanSpeed = "63%",
                    GpuUtilization = "99%",
                    GpuUtilizationValue = 99,
                    MemoryUtilization = "86%",
                    MemoryUtilizationValue = 86,
                    IsActive = true
                },
                new MiningDevice
                {
                    Name = "GPU 3",
                    Model = GpuModel,
                    Hashrate = "125 MH/s",
                    Temperature = "63°C",
                    TempColor = new SolidColorBrush(Colors.Green),
                    Power = "181W",
                    FanSpeed = "66%",
                    GpuUtilization = "98%",
                    GpuUtilizationValue = 98,
                    MemoryUtilization = "85%",
                    MemoryUtilizationValue = 85,
                    IsActive = true
                },
                new MiningDevice
                {
                    Name = "CPU 0",
                    Model = "AMD Ryzen 9 5950X",
                    Hashrate = "15 MH/s",
                    Temperature = "58°C",
                    TempColor = new SolidColorBrush(Colors.Green),
                    Power = "95W",
                    FanSpeed = "45%",
                    GpuUtilization = "100%",
                    GpuUtilizationValue = 100,
                    MemoryUtilization = "28%",
                    MemoryUtilizationValue = 28,
                    IsActive = true
                }
            };
        }
    }
}
