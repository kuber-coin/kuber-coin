using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace KuberCoinMiner.Services
{
    public class MiningService
    {
        private readonly HttpClient _httpClient;
        private readonly string _rpcUrl;
        private bool _isMining;

        public MiningService()
        {
            _httpClient = new HttpClient();
            _rpcUrl = Environment.GetEnvironmentVariable("KUBERCOIN_RPC_URL")
                ?? throw new InvalidOperationException("Missing env var: KUBERCOIN_RPC_URL");

            var apiKey = Environment.GetEnvironmentVariable("KUBERCOIN_API_KEY")
                ?? throw new InvalidOperationException("Missing env var: KUBERCOIN_API_KEY");

            _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
            _httpClient.DefaultRequestHeaders.Add("X-API-Key", apiKey);
        }

        public async Task StartMiningAsync()
        {
            _isMining = true;
            // Start mining through RPC
            await SendRpcCommandAsync("startmining");
        }

        public async Task StopMiningAsync()
        {
            _isMining = false;
            // Stop mining through RPC
            await SendRpcCommandAsync("stopmining");
        }

        public bool IsMining => _isMining;

        private async Task<string> SendRpcCommandAsync(string method, params object[] parameters)
        {
            var request = new
            {
                jsonrpc = "2.0",
                method = method,
                @params = parameters,
                id = 1
            };

            var json = JsonSerializer.Serialize(request);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            try
            {
                var response = await _httpClient.PostAsync(_rpcUrl, content);
                return await response.Content.ReadAsStringAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"RPC Error: {ex.Message}");
                return string.Empty;
            }
        }
    }
}
