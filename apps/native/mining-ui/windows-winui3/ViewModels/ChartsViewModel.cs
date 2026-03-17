using CommunityToolkit.Mvvm.ComponentModel;
using LiveChartsCore;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore.SkiaSharpView.Painting;
using LiveChartsCore.Kernel.Sketches;
using SkiaSharp;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace KuberCoinMiner.ViewModels
{
    public partial class ChartsViewModel : ObservableObject
    {
        [ObservableProperty]
        private string _totalProfit = "0.1524 BTC";
        
        [ObservableProperty]
        private string _avgDailyProfit = "0.0191 BTC";
        
        [ObservableProperty]
        private string _currentHashrate = "515 MH/s";
        
        [ObservableProperty]
        private string _averageHashrate = "512 MH/s";
        
        [ObservableProperty]
        private string _maxTemperature = "64°C";
        
        [ObservableProperty]
        private string _avgTemperature = "62°C";
        
        [ObservableProperty]
        private string _currentPower = "817W";
        
        [ObservableProperty]
        private string _monthlyCost = "$88.32";

        public ObservableCollection<ISeries> ProfitSeries { get; set; }
        public ObservableCollection<ISeries> HashrateSeries { get; set; }
        public ObservableCollection<ISeries> TemperatureSeries { get; set; }
        public ObservableCollection<ISeries> PowerSeries { get; set; }
        
        public IEnumerable<ICartesianAxis> XAxes { get; set; }
        public IEnumerable<ICartesianAxis> YAxes { get; set; }
        public IEnumerable<ICartesianAxis> HashrateYAxes { get; set; }
        public IEnumerable<ICartesianAxis> TemperatureYAxes { get; set; }
        public IEnumerable<ICartesianAxis> PowerYAxes { get; set; }

        public ChartsViewModel()
        {
            // Generate sample data for 24 hours
            var profitData = GenerateSampleData(24, 0.015, 0.021);
            var hashrateData = GenerateSampleData(24, 490, 525);
            var tempData = GenerateSampleData(24, 58, 66);
            var powerData = GenerateSampleData(24, 800, 850);

            ProfitSeries = new ObservableCollection<ISeries>
            {
                new LineSeries<double>
                {
                    Values = profitData,
                    Fill = new SolidColorPaint(SKColors.Orange.WithAlpha(50)),
                    Stroke = new SolidColorPaint(SKColors.Orange, 2),
                    GeometrySize = 0,
                    LineSmoothness = 0.5
                }
            };

            HashrateSeries = new ObservableCollection<ISeries>
            {
                new LineSeries<double>
                {
                    Values = hashrateData,
                    Fill = new SolidColorPaint(SKColors.DeepSkyBlue.WithAlpha(50)),
                    Stroke = new SolidColorPaint(SKColors.DeepSkyBlue, 2),
                    GeometrySize = 0,
                    LineSmoothness = 0.5
                }
            };

            TemperatureSeries = new ObservableCollection<ISeries>
            {
                new LineSeries<double>
                {
                    Values = tempData,
                    Fill = new SolidColorPaint(SKColors.Red.WithAlpha(50)),
                    Stroke = new SolidColorPaint(SKColors.Red, 2),
                    GeometrySize = 0,
                    LineSmoothness = 0.5
                }
            };

            PowerSeries = new ObservableCollection<ISeries>
            {
                new LineSeries<double>
                {
                    Values = powerData,
                    Fill = new SolidColorPaint(SKColors.Green.WithAlpha(50)),
                    Stroke = new SolidColorPaint(SKColors.Green, 2),
                    GeometrySize = 0,
                    LineSmoothness = 0.5
                }
            };

            XAxes = new Axis[]
            {
                new Axis
                {
                    Name = "Time",
                    NamePaint = new SolidColorPaint(SKColors.Gray)
                }
            };

            YAxes = new Axis[]
            {
                new Axis
                {
                    Name = "Profit (BTC)",
                    NamePaint = new SolidColorPaint(SKColors.Gray)
                }
            };

            HashrateYAxes = new Axis[]
            {
                new Axis
                {
                    Name = "Hashrate (MH/s)",
                    NamePaint = new SolidColorPaint(SKColors.Gray)
                }
            };

            TemperatureYAxes = new Axis[]
            {
                new Axis
                {
                    Name = "Temperature (°C)",
                    NamePaint = new SolidColorPaint(SKColors.Gray)
                }
            };

            PowerYAxes = new Axis[]
            {
                new Axis
                {
                    Name = "Power (W)",
                    NamePaint = new SolidColorPaint(SKColors.Gray)
                }
            };
        }

        private static double[] GenerateSampleData(int count, double min, double max)
        {
            var random = new Random();
            var data = new double[count];
            for (int i = 0; i < count; i++)
            {
                data[i] = min + (max - min) * random.NextDouble();
            }
            return data;
        }

        public void UpdateTimeRange(string range)
        {
            int dataPoints = range switch
            {
                "24h" => 24,
                "7d" => 168,
                "30d" => 720,
                "all" => 2160,
                _ => 24
            };

            // Regenerate data for new time range
            var profitData = GenerateSampleData(dataPoints, 0.015, 0.021);
            ProfitSeries[0].Values = profitData;
        }
    }
}
