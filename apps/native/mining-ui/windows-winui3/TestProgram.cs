using System;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace KuberCoinTest
{
    internal static class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("KuberCoin Node API Test");
            Console.WriteLine("======================\n");

            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(5);

            var baseUrl = Environment.GetEnvironmentVariable("KUBERCOIN_TEST_API_BASE_URL");
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                Console.WriteLine("Missing env var: KUBERCOIN_TEST_API_BASE_URL");
                Console.WriteLine("Example: set KUBERCOIN_TEST_API_BASE_URL=http://localhost:8090");
                return;
            }

            // Test REST API
            try
            {
                Console.WriteLine($"Testing REST API ({baseUrl})...");
                var response = await client.GetStringAsync($"{baseUrl}/api/blockchain/info");
                var data = JObject.Parse(response);
                Console.WriteLine($"✓ Node is running");
                Console.WriteLine($"  Height: {data["height"]}");
                Console.WriteLine($"  Total Supply: {data["total_supply"]}");
                Console.WriteLine();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ REST API failed: {ex.Message}");
                Console.WriteLine("  Make sure the node is running:");
                Console.WriteLine("  .\\kubercoin.exe node --rpc-port 8332 --http-port 8090\n");
            }

            // Test wallet creation
            try
            {
                Console.WriteLine("Testing wallet info...");
                var walletResponse = await client.GetStringAsync($"{baseUrl}/api/wallet/balance");
                var walletData = JObject.Parse(walletResponse);
                Console.WriteLine($"✓ Wallet balance: {walletData["balance"]}");
                Console.WriteLine();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ Wallet API failed: {ex.Message}\n");
            }

            Console.WriteLine("The WinUI 3 application would connect to these same endpoints.");
            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }
    }
}
