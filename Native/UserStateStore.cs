using System.Text.Json;
using System.Windows.Forms;

namespace ORBIT;

// Versioned local-first app data; atomic replacement and recovery backup.
internal sealed class UserStateStore
{
    private readonly object gate = new();
    internal readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Orbit");
    private string FilePath => Path.Combine(Folder, "state.json");
    private string ProfilePath => Path.Combine(Folder, "profile.json");
    private static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true };

    private static void WriteAtomic(string path, string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        File.WriteAllText(temp, content);
        if (File.Exists(path)) File.Replace(temp, path, path + ".bak", true);
        else File.Move(temp, path);
    }
    private static string? ReadRecover(string path)
    {
        foreach (string file in new [] { path, path + ".bak" })
        {
            try
            {
                if (!File.Exists(file)) continue;
                string content = File.ReadAllText(file);
                using var doc = JsonDocument.Parse(content);
                if (doc.RootElement.ValueKind == JsonValueKind.Object) return content;
            }
            catch { /* Use a known-good backup if the primary file is corrupt. */ }
        }
        return null;
    }
    internal string? LoadState() { lock(gate) return ReadRecover(FilePath); }
    internal void SaveState(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object || json.Length > 5_000_000)
            throw new InvalidOperationException("Invalid or oversized settings file.");
        lock(gate) WriteAtomic(FilePath, JsonSerializer.Serialize(doc.RootElement, Pretty));
    }
    internal string? LoadProfile() { lock(gate) return ReadRecover(ProfilePath); }
    internal void SaveProfile(string name)
    {
        name = name.Trim();
        if (name.Length is < 1 or > 45 || name.Any(char.IsControl)) throw new InvalidOperationException("Enter a name of 1–45 characters.");
        lock(gate) WriteAtomic(ProfilePath, JsonSerializer.Serialize(new { version = 1, name }, Pretty));
    }
    internal void ResetProfile() { lock (gate) { foreach(var path in new[]{ProfilePath,ProfilePath+".bak"}) if(File.Exists(path)) File.Delete(path); } }
    internal void ResetAll()
    {
        lock(gate) {
            // Preserve backup files until an explicit reset, and never delete arbitrary files.
            foreach(var file in new[] { FilePath, FilePath+".bak", ProfilePath, ProfilePath+".bak",
                Path.Combine(Folder,"window.json"),Path.Combine(Folder,"window.json.bak"),Path.Combine(Folder,"mini-widget.json") })
                if(File.Exists(file)) File.Delete(file);
        }
    }
    internal bool ExportDialog(IWin32Window owner)
    {
        using var dialog = new SaveFileDialog { Title = "Export ORBIT settings", Filter = "JSON backup (*.json)|*.json", FileName = "ORBIT-settings-backup.json" };
        if(dialog.ShowDialog(owner) != DialogResult.OK) return false;
        lock(gate) File.WriteAllText(dialog.FileName, LoadState() ?? "{\"version\":3}");
        return true;
    }
    internal string? ImportDialog(IWin32Window owner)
    {
        using var dialog = new OpenFileDialog { Title = "Import ORBIT settings", Filter = "JSON backup (*.json)|*.json", CheckFileExists = true };
        if(dialog.ShowDialog(owner) != DialogResult.OK) return null;
        string value = File.ReadAllText(dialog.FileName);
        SaveState(value);
        return value;
    }
}
