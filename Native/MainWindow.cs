using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace ORBIT;

public sealed class MainWindow : Form
{
    private const string HostOrigin = "https://orbit.local/";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly NotifyIcon tray = new() { Icon = System.Drawing.SystemIcons.Application, Text = "ORBIT 3.2.1", Visible = true };
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(16) };
    private readonly SpeechController voice = new();
    private readonly VoiceOutput voiceOutput = new();
    private readonly NotesStore notes = new();
    private readonly UserStateStore userState = new();
    private readonly UpdateService updater = new();
    private MiniWidget? mini;
    private readonly string webDir = Path.Combine(Program.AppDataDir, "WebCache", "3.2.1");
    private readonly System.Windows.Forms.Timer geometryTimer = new() { Interval = 700 };
    private bool restoringWindow = true;
    private bool suppressGeometrySave;
    private bool closeToTray;
    private bool reallyQuit;
    private bool fullscreen;
    private FormBorderStyle originalBorder;
    private FormWindowState originalState;
    private System.Drawing.Rectangle originalBounds;

    public MainWindow()
    {
        Text = "ORBIT 3.2.1";
        Size = new System.Drawing.Size(1360, 860);
        MinimumSize = new System.Drawing.Size(790, 550);
        StartPosition = FormStartPosition.CenterScreen;
        Load += (_, _) => RestoreWindow();
        Move += (_, _) => QueueWindowSave();
        Resize += (_, _) => QueueWindowSave();
        BackColor = System.Drawing.Color.FromArgb(9, 17, 29);
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); if (Icon is not null) tray.Icon = Icon; }
        catch { /* default window icon */ }
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open ORBIT", null, (_, _) => ShowFromTray());
        menu.Items.Add("Quit ORBIT", null, (_, _) => { reallyQuit = true; Close(); });
        tray.ContextMenuStrip = menu;
        voice.StatusChanged += OnVoiceStatus;
        voiceOutput.StatusChanged += OnOutputStatus;
        menu.Items.Insert(1, new ToolStripMenuItem("Microphone off", null, (_, _) => voice.Stop()));
        tray.DoubleClick += (_, _) => ShowFromTray();
        Controls.Add(browser);
        geometryTimer.Tick += (_, _) => { geometryTimer.Stop(); SaveWindow(); };
        Shown += async (_, _) => await InitializeBrowser();
        FormClosing += (_, e) =>
        {
            if (closeToTray && !reallyQuit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
        FormClosed += (_, _) => { geometryTimer.Stop(); geometryTimer.Dispose(); SaveWindow(); tray.Visible = false; tray.Dispose(); voice.Dispose(); voiceOutput.Dispose(); mini?.Close(); http.Dispose(); browser.Dispose(); };
    }

    private void QueueWindowSave()
    {
        if (restoringWindow || !IsHandleCreated) return;
        geometryTimer.Stop(); geometryTimer.Start();
    }
    private string GeometryFile => Path.Combine(userState.Folder, "window.json");
    private void RestoreWindow()
    {
        try
        {
            if(File.Exists(GeometryFile))
            {
                using var doc=JsonDocument.Parse(File.ReadAllText(GeometryFile));
                var d=doc.RootElement;
                var bounds=new System.Drawing.Rectangle(d.GetProperty("x").GetInt32(),d.GetProperty("y").GetInt32(),d.GetProperty("w").GetInt32(),d.GetProperty("h").GetInt32());
                if(bounds.Width>=790&&bounds.Height>=550&&Screen.AllScreens.Any(sc=>sc.WorkingArea.IntersectsWith(bounds)))
                    { StartPosition=FormStartPosition.Manual; Bounds=bounds; }
            }
        } catch(Exception error) {Program.LogError(error);}
        restoringWindow=false;
    }
    private void SaveWindow()
    {
        try
        {
            if(restoringWindow || suppressGeometrySave) return;
            var r=WindowState==FormWindowState.Normal?Bounds:RestoreBounds;
            Directory.CreateDirectory(userState.Folder);
            string temp=GeometryFile+".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(new { x=r.X,y=r.Y,w=r.Width,h=r.Height }));
            File.Move(temp,GeometryFile,true);
        } catch(Exception error){Program.LogError(error);}
    }

    private void OnVoiceStatus(string state, string message)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(new Action(() =>
            {
                if (IsDisposed || browser.CoreWebView2 is null) return;
                browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { orbitEvent = "speech", state, message }));
            }));
        }
        catch (InvalidOperationException) { /* Window is shutting down. */ }
    }

    private void OnOutputStatus(string state, string message)
    {
        AssistantDiagnostics.Write("output:" + state, message);
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(new Action(() =>
            {
                if (!IsDisposed && browser.CoreWebView2 is not null)
                    browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { orbitEvent = "tts", state, message }));
            }));
        }
        catch (InvalidOperationException) { }
    }

    private void ShowFromTray()
    {
        Show(); WindowState = FormWindowState.Normal; Activate();
    }

    private static readonly string[] WebFiles = [
        "index.html", "src/style.css", "src/main.js", "src/native-bridge.js"
    ];
    private void ExtractWebResources()
    {
        Directory.CreateDirectory(webDir);
        var assembly = Assembly.GetExecutingAssembly();
        foreach (string relative in WebFiles)
        {
            using Stream resource = assembly.GetManifestResourceStream("orbit/" + relative)
                ?? throw new InvalidOperationException("Missing built-in UI resource: " + relative);
            string dest = Path.Combine(webDir, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            // Overwrite on startup so app updates always replace the embedded UI without modifying user data.
            using var file = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None);
            resource.CopyTo(file);
        }
    }

    private async Task InitializeBrowser()
    {
        try
        {
            ExtractWebResources();
            var userProfile = Path.Combine(Program.AppDataDir, "WebView2");
            Directory.CreateDirectory(userProfile);
            var environment = await CoreWebView2Environment.CreateAsync(null, userProfile);
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.SetVirtualHostNameToFolderMapping("orbit.local", webDir, CoreWebView2HostResourceAccessKind.DenyCors);
            browser.CoreWebView2.WebMessageReceived += OnMessage;
            browser.CoreWebView2.ProcessFailed += (_, args) => AssistantDiagnostics.Write("webview:crash", args.ProcessFailedKind.ToString());
            browser.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith(HostOrigin, StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    try { OpenWeb(e.Uri); } catch (Exception ex) { Program.LogError(ex); }
                }
            };
            browser.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                try { OpenWeb(e.Uri); } catch (Exception ex) { Program.LogError(ex); }
            };
            browser.CoreWebView2.Navigate(HostOrigin + "index.html");
        }
        catch (Exception error)
        {
            Program.LogError(error);
            MessageBox.Show("Could not initialize ORBIT. Install or repair the Microsoft Edge WebView2 Runtime and restart ORBIT.\n\n" + error.Message,
                "ORBIT startup error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string GetText(JsonElement args, string name, string fallback = "") =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.String
            ? item.GetString() ?? fallback : fallback;
    private static bool GetBool(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.True;
    private static double GetNumber(JsonElement args, string name, double fallback = 1) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out var n) ? n : fallback;

    private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Only bundled UI pages may request privileged Windows operations.
        if (!e.Source.StartsWith(HostOrigin, StringComparison.OrdinalIgnoreCase)) return;
        int id = 0;
        try
        {
            using var json = JsonDocument.Parse(e.WebMessageAsJson);
            var root = json.RootElement;
            id = root.GetProperty("id").GetInt32();
            var cmd = root.GetProperty("cmd").GetString() ?? "";
            if (cmd.Length is < 1 or > 48) throw new InvalidOperationException("Invalid command.");
            var args = root.TryGetProperty("args", out var item) ? item.Clone() : default;
            if (cmd is "voice_enable" or "voice_push_to_talk" or "voice_disable" or "voice_command_complete" or "tts_speak" or "tts_list")
                AssistantDiagnostics.Write("bridge:request", cmd);
            object? answer = await HandleCommand(cmd, args);
            if (cmd is "voice_enable" or "voice_push_to_talk" or "voice_disable" or "voice_command_complete" or "tts_speak" or "tts_list")
                AssistantDiagnostics.Write("bridge:ok", cmd);
            Reply(id, true, answer, null);
        }
        catch (Exception error)
        {
            Program.LogError(error);
            AssistantDiagnostics.Write("bridge:error", error.ToString());
            Reply(id, false, null, error.Message);
        }
    }
    private void Reply(int id, bool ok, object? result, string? error)
    {
        if (IsDisposed || browser.CoreWebView2 is null) return;
        browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, ok, result, error }));
    }
    private async Task<object?> HandleCommand(string cmd, JsonElement args)
    {
        switch (cmd)
        {
            case "open_url": OpenWeb(GetText(args,"url"));return true;
            case "pick_files": return PickFiles(GetBool(args,"multiple"));
            case "launch_app": LaunchApp(GetText(args,"path"));return true;
            case "list_installed_apps": return await Task.Run(InstalledApps);
            case "set_autostart": SetAutostart(GetBool(args,"enabled"));return true;
            case "get_autostart": return GetAutostart();
            case "set_close_to_tray": closeToTray=GetBool(args,"enabled");return true;
            case "show_notification":
                tray.BalloonTipTitle = GetText(args,"title").Substring(0, Math.Min(100, GetText(args,"title").Length));
                tray.BalloonTipText = GetText(args,"body").Substring(0, Math.Min(240, GetText(args,"body").Length));
                tray.ShowBalloonTip(4500);return true;
            case "toggle_fullscreen": return ToggleFullscreen();
            case "system_snapshot":
                if (WindowState == FormWindowState.Minimized) return "null";
                return JsonSerializer.Serialize(await Task.Run(WindowsControl.Snapshot));
            case "state_load": return userState.LoadState();
            case "state_save": userState.SaveState(GetText(args,"payload")); return true;
            case "profile_load": return userState.LoadProfile();
            case "profile_save": userState.SaveProfile(GetText(args,"name")); return true;
            case "profile_reset": userState.ResetProfile(); return true;
            case "settings_export": return userState.ExportDialog(this);
            case "settings_import": return userState.ImportDialog(this);
            case "settings_reset":
                geometryTimer.Stop();
                suppressGeometrySave = true;
                try { userState.ResetAll(); } finally { suppressGeometrySave = false; }
                return true;
            case "notes_list": return notes.List();
            case "notes_upsert": return notes.Upsert(GetText(args,"id"), GetText(args,"title"), GetText(args,"body"), GetBool(args,"pinned"));
            case "notes_delete": return notes.Delete(GetText(args,"id"));
            case "voice_state": return await Task.Run(voice.State);
            case "voice_enable": return await Task.Run(() => voice.Start(true, GetText(args,"language","en-US")));
            case "voice_push_to_talk":
                await Task.Run(() => voice.PushToTalk(GetText(args,"language","en-US")));
                return await Task.Run(voice.State);
            case "voice_disable": await Task.Run(voice.Stop); return true;
            case "voice_command_complete": await Task.Run(voice.CommandComplete); return true;
            case "tts_list": return await Task.Run(voiceOutput.ListVoices);
            case "tts_speak":
                await Task.Run(() => voiceOutput.Speak(GetText(args,"text"), GetText(args,"locale","en-US"),
                    (int)GetNumber(args,"volume",35), GetNumber(args,"rate",0.92), GetText(args,"voice")));
                return true;
            case "tts_stop": await Task.Run(voiceOutput.Cancel); return true;
            case "assistant_log": AssistantDiagnostics.Write(GetText(args,"stage","ui"),GetText(args,"message")); return true;
            case "assistant_log_get": return await Task.Run(AssistantDiagnostics.Tail);
            case "assistant_log_folder":
                Directory.CreateDirectory(Program.AppDataDir);
                Process.Start(new ProcessStartInfo("explorer.exe", Program.AppDataDir) { UseShellExecute = true }); return true;
            case "volume_set": return await Task.Run(() => WindowsControl.SetVolume((int)GetNumber(args,"percent",40)));
            case "volume_mute": return await Task.Run(() => WindowsControl.Mute(GetBool(args,"enabled")));
            case "brightness_set": return await Task.Run(() => WindowsControl.SetBrightness((int)GetNumber(args,"percent",50)));
            case "launch_known_app": await Task.Run(() => WindowsControl.LaunchKnown(GetText(args,"name"))); return true;
            case "mini_widget_show": if (mini is null || mini.IsDisposed) mini = new MiniWidget(); mini.Show(); mini.BringToFront(); return true;
            case "mini_widget_hide": mini?.Hide(); return true;
            case "update_repo_get": return updater.Repository;
            case "update_repo_set": updater.SetRepository(GetText(args,"repository")); return true;
            case "update_check": return await updater.Check();
            case "update_install": return await updater.Install(GetText(args,"version"));
            default: throw new InvalidOperationException("Unsupported native command: " + cmd);
        }
    }

    private static void OpenWeb(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Only HTTP(S) links may be opened.");
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute=true });
    }
    private object? PickFiles(bool multiple)
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Choose applications or shortcuts",
            Filter = "Windows applications and shortcuts (*.exe;*.lnk)|*.exe;*.lnk",
            Multiselect = multiple, CheckFileExists = true
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return null;
        return multiple ? dialog.FileNames : dialog.FileName;
    }
    private static void LaunchApp(string path)
    {
        if (!Path.IsPathFullyQualified(path) || !File.Exists(path)) throw new InvalidOperationException("Application path does not exist.");
        if (!new[]{".exe",".lnk"}.Contains(Path.GetExtension(path),StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only .exe and .lnk files can be launched.");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute=true });
    }
    private static object InstalledApps()
    {
        var result = new List<object>();
        foreach (var dir in new[] {
            Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu)
        })
        {
            try
            {
                foreach (var file in Directory.EnumerateFiles(dir,"*.lnk",SearchOption.AllDirectories).Take(1800))
                {
                    result.Add(new { name = Path.GetFileNameWithoutExtension(file), path = file });
                    if(result.Count >= 1200) break;
                }
            }
            catch (Exception error) { Program.LogError(error); }
        }
        return result;
    }
    private static readonly string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private static bool GetAutostart()
    {
        using var reg = Registry.CurrentUser.OpenSubKey(RunKey);
        return reg?.GetValue("ORBIT") is string s && s.Contains("ORBIT.exe",StringComparison.OrdinalIgnoreCase);
    }
    private static void SetAutostart(bool enabled)
    {
        using var reg = Registry.CurrentUser.OpenSubKey(RunKey, true) ?? Registry.CurrentUser.CreateSubKey(RunKey);
        if(enabled)reg.SetValue("ORBIT", "\"" + Environment.ProcessPath + "\"");
        else reg.DeleteValue("ORBIT", false);
    }
    private bool ToggleFullscreen()
    {
        if(!fullscreen)
        {
            originalBorder=FormBorderStyle;originalState=WindowState;originalBounds=Bounds;
            FormBorderStyle=FormBorderStyle.None;WindowState=FormWindowState.Maximized;fullscreen=true;
        }
        else
        {
            WindowState=FormWindowState.Normal;FormBorderStyle=originalBorder;
            Bounds=originalBounds;WindowState=originalState;fullscreen=false;
        }
        return fullscreen;
    }

}
