namespace KuberCoinMiner.Models
{
    public class DeviceInfo
    {
        public string Name { get; set; } = string.Empty;
        public string Hashrate { get; set; } = "0 MH/s";
        public string Temperature { get; set; } = "0°C";
        public string Power { get; set; } = "0W";
        public int DeviceId { get; set; }
        public DeviceType Type { get; set; }
    }

    public enum DeviceType
    {
        GPU,
        CPU
    }
}
