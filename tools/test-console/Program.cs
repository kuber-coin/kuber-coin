using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace KuberCoin.TestConsole;

internal static class Program
{
    private static async Task Main()
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
        
        try
        {
            Console.WriteLine($"Testing REST API ({baseUrl})...");
            var response = await client.GetStringAsync($"{baseUrl}/api/blockchain/info");
            Console.WriteLine("Node is running!");
            Console.WriteLine($"  Response length: {response.Length} bytes");
            if (response.Length > 0)
            {
                Console.WriteLine($"  Preview: {response.Substring(0, Math.Min(150, response.Length))}...\n");
            }
            
            Console.WriteLine("Testing wallet balance...");
            var walletResponse = await client.GetStringAsync($"{baseUrl}/api/wallet/balance");
            Console.WriteLine("Wallet API working!");
            Console.WriteLine($"  Response: {walletResponse}\n");
            
            Console.WriteLine("======================");
            Console.WriteLine("All tests passed!");
            Console.WriteLine("\nThe WinUI 3 application would connect to these same endpoints.");
            Console.WriteLine("Build Status: .NET SDK installed successfully!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Connection failed: {ex.Message}\n");
            Console.WriteLine("Make sure the node is running:");
            Console.WriteLine("  .\\kubercoin.exe node --rpc-port 8332 --http-port 8090");
        }
        
        Console.WriteLine("\nPress any key to exit...");
        Console.ReadKey();
    }
}
