# Installing .NET 8.0 SDK for Windows

To build the Windows WinUI 3 mining UI, you need the .NET 8.0 SDK.

## Quick Install (Recommended)

1. **Open your browser** and go to:
   ```
   https://dotnet.microsoft.com/download/dotnet/8.0
   ```

2. **Download** the ".NET 8.0 SDK (v8.0.x)" installer for Windows x64
   - Look for the "Windows x64" download button under "SDK 8.0.xxx"
   - File size is approximately 200 MB

3. **Run the installer** and follow the prompts
   - The installer will automatically add .NET to your PATH

4. **Verify installation** - Open a NEW PowerShell window and run:
   ```powershell
   dotnet --version
   ```
   You should see something like `8.0.403` or similar

## Alternative: Using winget (if available)

If you have Windows Package Manager (winget):

```powershell
winget install Microsoft.DotNet.SDK.8
```

## Alternative: Using Chocolatey

If you have Chocolatey package manager:

```powershell
choco install dotnet-8.0-sdk -y
```

## After Installation

Once .NET SDK is installed, build the Windows mining UI:

```powershell
cd C:\kubercoin\native-mining-ui\windows-winui3
dotnet restore
dotnet build --configuration Release
dotnet run --configuration Release
```

Or use the automated build script:

```powershell
cd C:\kubercoin
.\scripts\build_native_ui_windows.ps1 -Configuration Release
```

## Troubleshooting

**"dotnet is not recognized" after installation:**
- Close and reopen your PowerShell terminal
- Or refresh the PATH: 
  ```powershell
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  ```

**Build errors about Windows SDK:**
- The WinUI 3 app requires Windows 10 SDK version 19041 or later
- Visual Studio installer can add this, or download from:
  https://developer.microsoft.com/windows/downloads/windows-sdk/

**Runtime errors:**
- Ensure you're running on Windows 10 version 1809 (build 17763) or later
- Windows 11 is recommended for the best WinUI 3 experience
