using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace ORBIT;

internal sealed class UpdateService
{
    private static readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(45) };
    private readonly string repoPath = Path.Combine(Program.AppDataDir, "update-repository.txt");
    internal string Repository => File.Exists(repoPath) ? File.ReadAllText(repoPath).Trim() : "";
    internal void SetRepository(string value)
    {
        value = value.Trim();
        if (!Regex.IsMatch(value, @"^[\w.-]{1,60}/[\w.-]{1,90}$") || value.Contains(".."))
            throw new InvalidOperationException("Enter your public GitHub repository as owner/repo, e.g. yourname/orbit-windows.");
        Directory.CreateDirectory(Program.AppDataDir);
        File.WriteAllText(repoPath, value);
    }
    internal async Task<object> Check()
    {
        if (Repository.Length == 0) return new { configured = false, hasUpdate = false, current = "3.2.1", message = "Enter your GitHub repository in Settings to enable updates." };
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://api.github.com/repos/{Repository}/releases/latest");
        request.Headers.UserAgent.ParseAdd("ORBIT-Desktop/3.2.1");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"No public GitHub release was found ({(int)response.StatusCode}).");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        string tag = root.GetProperty("tag_name").GetString() ?? "";
        if (!Version.TryParse(tag.TrimStart('v','V'), out var version)) throw new InvalidOperationException("GitHub release tag must be like v3.2.1.");
        var current = new Version(3,2,1);
        string installer = "", sum = "";
        foreach (var asset in root.GetProperty("assets").EnumerateArray())
        {
            string name = asset.GetProperty("name").GetString() ?? "";
            string url = asset.GetProperty("browser_download_url").GetString() ?? "";
            if (name.Equals("ORBIT_Setup.exe", StringComparison.OrdinalIgnoreCase) || Regex.IsMatch(name, @"^ORBIT_[0-9_]+_Setup\.exe$",RegexOptions.IgnoreCase)) installer = url;
            if (name.Equals("ORBIT_Setup.exe.sha256", StringComparison.OrdinalIgnoreCase) || Regex.IsMatch(name, @"^ORBIT_[0-9_]+_Setup\.exe\.sha256$",RegexOptions.IgnoreCase)) sum = url;
        }
        return new { configured = true, hasUpdate = version > current, current = current.ToString(), latest = tag, installer, checksum = sum,
            message = version > current ? "Update found. Verify and install from the original GitHub release." : "ORBIT is up to date." };
    }
    internal async Task<string> Install(string expectedVersion)
    {
        // Require explicit user confirmation in the UI and a published checksum asset.
        var raw = JsonSerializer.Serialize(await Check());
        using var document = JsonDocument.Parse(raw); var root = document.RootElement;
        if (!root.GetProperty("hasUpdate").GetBoolean() || root.GetProperty("latest").GetString() != expectedVersion)
            throw new InvalidOperationException("Release changed or is not newer. Check for updates again.");
        string installerUrl = root.GetProperty("installer").GetString() ?? "";
        string checksumUrl = root.GetProperty("checksum").GetString() ?? "";
        if (!SafeAsset(installerUrl) || !SafeAsset(checksumUrl))
            throw new InvalidOperationException("This release needs both an ORBIT installer and its .sha256 file. No update was installed.");
        string sumText = await client.GetStringAsync(checksumUrl);
        var expected = Regex.Match(sumText, @"\b[a-fA-F0-9]{64}\b").Value;
        if (expected.Length != 64) throw new InvalidOperationException("Invalid release checksum.");
        using var response = await client.GetAsync(installerUrl, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength is long size && size > 350_000_000) throw new InvalidOperationException("Update file is too large.");
        string temp = Path.Combine(Path.GetTempPath(), "ORBIT_Update_" + Guid.NewGuid().ToString("N") + ".exe");
        try
        {
            await using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await using (var input = await response.Content.ReadAsStreamAsync())
            {
                var buffer = new byte[64 * 1024]; long total = 0; int n;
                while ((n = await input.ReadAsync(buffer)) > 0)
                {
                    total += n; if (total > 350_000_000) throw new InvalidOperationException("Update exceeds the download limit.");
                    await output.WriteAsync(buffer.AsMemory(0,n));
                }
            }
            string actual = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(temp)));
            if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Update checksum mismatch. Download was discarded.");
            // Inno Setup will request an orderly closure before replacing ORBIT.exe.
            Process.Start(new ProcessStartInfo(temp) { UseShellExecute = true });
            return "Installer launched; close ORBIT when requested to finish installing.";
        }
        catch { try { File.Delete(temp); } catch { } throw; }
    }
    private bool SafeAsset(string url) => Uri.TryCreate(url, UriKind.Absolute, out var u)
       && u.Scheme == "https" && u.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase)
       && u.AbsolutePath.StartsWith("/" + Repository + "/releases/download/", StringComparison.OrdinalIgnoreCase);
}
