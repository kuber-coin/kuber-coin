using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;
using KuberCoinMiner.Models;

namespace KuberCoinMiner.ViewModels
{
    public partial class OverclockingViewModel : ObservableObject
    {
        private const string GpuModel = "NVIDIA RTX 3080";
        private const string DefaultMemoryClock = "9501 MHz";

        public ObservableCollection<GpuDevice> GpuDevices { get; }

        public OverclockingViewModel()
        {
            GpuDevices = new ObservableCollection<GpuDevice>
            {
                new GpuDevice
                {
                    Name = "GPU 0",
                    Model = GpuModel,
                    Temperature = "62°C",
                    PowerDraw = "180W",
                    CoreClock = "1725 MHz",
                    MemoryClock = DefaultMemoryClock,
                    PowerLimit = 85,
                    CoreClockOffset = 100,
                    MemoryClockOffset = 500,
                    FanSpeed = 65,
                    IsOverclockEnabled = true
                },
                new GpuDevice
                {
                    Name = "GPU 1",
                    Model = GpuModel,
                    Temperature = "64°C",
                    PowerDraw = "182W",
                    CoreClock = "1720 MHz",
                    MemoryClock = DefaultMemoryClock,
                    PowerLimit = 85,
                    CoreClockOffset = 95,
                    MemoryClockOffset = 500,
                    FanSpeed = 68,
                    IsOverclockEnabled = true
                },
                new GpuDevice
                {
                    Name = "GPU 2",
                    Model = GpuModel,
                    Temperature = "61°C",
                    PowerDraw = "179W",
                    CoreClock = "1730 MHz",
                    MemoryClock = DefaultMemoryClock,
                    PowerLimit = 85,
                    CoreClockOffset = 105,
                    MemoryClockOffset = 500,
                    FanSpeed = 63,
                    IsOverclockEnabled = true
                },
                new GpuDevice
                {
                    Name = "GPU 3",
                    Model = GpuModel,
                    Temperature = "63°C",
                    PowerDraw = "181W",
                    CoreClock = "1725 MHz",
                    MemoryClock = DefaultMemoryClock,
                    PowerLimit = 85,
                    CoreClockOffset = 100,
                    MemoryClockOffset = 500,
                    FanSpeed = 66,
                    IsOverclockEnabled = true
                }
            };
        }
    }
}
