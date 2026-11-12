using Microsoft.Win32;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace ORBIT;

internal static class AppCatalog
{
    internal sealed record Entry(string name, string path);
    internal static Entry[] List()
    {
        var apps = new List<Entry>();
        foreach (var folder in new[] { Environment.SpecialFolder.CommonStartMenu, Environment.SpecialFolder.StartMenu, Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.CommonDesktopDirectory })
        {
            var directory = Environment.GetFolderPath(folder);
            if (!Directory.Exists(directory)) continue;
            try
            {
                foreach (var file in Directory.EnumerateFiles(directory, "*.lnk", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint }))
                    apps.Add(new(Path.GetFileNameWithoutExtension(file), file));
            }
            catch (IOException error) { AssistantDiagnostics.Write("apps:shortcuts", error.Message); }
        }
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var registry = RegistryKey.OpenBaseKey(hive, view);
            using var paths = registry.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths");
            if (paths is null) continue;
            foreach (var name in paths.GetSubKeyNames())
            {
                using var key = paths.OpenSubKey(name);
                var file = Environment.ExpandEnvironmentVariables((key?.GetValue("") as string ?? "").Trim('"'));
                if (File.Exists(file)) apps.Add(new(Path.GetFileNameWithoutExtension(name), file));
            }
        }
        // AppsFolder includes packaged Store apps as well as desktop registrations.
        object? shell = null, folderObject = null, itemsObject = null;
        try
        {
            var type = Type.GetTypeFromProgID("Shell.Application");
            if (type is not null)
            {
                shell = Activator.CreateInstance(type);
                folderObject = ((dynamic)shell!).NameSpace("shell:AppsFolder");
                if (folderObject is not null)
                {
                    itemsObject = ((dynamic)folderObject).Items();
                    foreach (dynamic item in (dynamic)itemsObject)
                    {
                        try { apps.Add(new((string)item.Name, "shell:AppsFolder\\" + (string)item.Path)); }
                        finally { Marshal.ReleaseComObject(item); }
                    }
                }
            }
        }
        catch (Exception error) { AssistantDiagnostics.Write("apps:store", error.Message); }
        finally
        {
            if (itemsObject is not null) Marshal.ReleaseComObject(itemsObject);
            if (folderObject is not null) Marshal.ReleaseComObject(folderObject);
            if (shell is not null) Marshal.ReleaseComObject(shell);
        }
        return apps.DistinctBy(a => a.path, StringComparer.OrdinalIgnoreCase).OrderBy(a => a.name).ToArray();
    }
    internal static void Launch(string path)
    {
        if (!List().Any(a => a.path.Equals(path, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("This app is no longer registered. Refresh the app list and try again.");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }
}

