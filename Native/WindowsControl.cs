using System.Diagnostics;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;

namespace ORBIT;

internal static class WindowsControl
{
    internal static int SetVolume(int pct)
    {
        using var devices = new MMDeviceEnumerator();
        using var output = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        output.AudioEndpointVolume.MasterVolumeLevelScalar = Math.Clamp(pct, 0, 100) / 100f;
        return (int)Math.Round(output.AudioEndpointVolume.MasterVolumeLevelScalar * 100);
    }
    internal static int AdjustVolume(int delta)
    {
        using var devices = new MMDeviceEnumerator();
        using var output = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        return SetVolume((int)Math.Round(output.AudioEndpointVolume.MasterVolumeLevelScalar * 100) + delta);
    }
    internal static object AdjustBrightness(int delta)
    {
        using var search = new ManagementObjectSearcher(@"root\WMI", "SELECT * FROM WmiMonitorBrightness WHERE Active = True");
        foreach (ManagementObject screen in search.Get())
            using (screen) return SetBrightness(Convert.ToInt32(screen["CurrentBrightness"]) + delta);
        throw new InvalidOperationException("This monitor does not expose software brightness controls.");
    }
    internal static void OpenSettings(string page)
    {
        string[] pages = ["", "display", "sound", "bluetooth", "network-wifi", "network", "windowsupdate", "appsfeatures", "privacy-microphone", "privacy-webcam", "personalization", "powersleep", "notifications", "dateandtime", "printers", "mousetouchpad", "keyboard", "easeofaccess", "storagesense", "defaultapps", "accounts"];
        if (!pages.Contains(page)) throw new InvalidOperationException("Unknown Settings page.");
        Process.Start(new ProcessStartInfo("ms-settings:" + page) { UseShellExecute = true });
    }
    internal static bool Mute(bool on)
    {
        using var devices = new MMDeviceEnumerator();
        using var output = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        output.AudioEndpointVolume.Mute = on;
        return output.AudioEndpointVolume.Mute;
    }
    internal static object SetBrightness(int pct)
    {
        using var search = new ManagementObjectSearcher(@"root\WMI", "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active = True");
        int changed = 0;
        foreach (ManagementObject screen in search.Get())
        {
            using (screen) { screen.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)Math.Clamp(pct, 0, 100) }); changed++; }
        }
        if (changed == 0) throw new InvalidOperationException("This display does not support Windows software brightness. External monitors may require their own controls.");
        return new { brightness = Math.Clamp(pct, 0, 100), displays = changed };
    }
    internal static void LaunchKnown(string app)
    {
        // Fixed allowlist, no shell, arguments or paths supplied by microphone.
        string path = app.Trim().ToLowerInvariant() switch
        {
            "calculator" or "calc" => "calc.exe",
            "notepad" => "notepad.exe",
            "explorer" or "files" => "explorer.exe",
            "settings" => "ms-settings:",
            _ => throw new InvalidOperationException("This voice app shortcut is not supported.")
        };
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Size;
        public uint MemoryLoad;
        public ulong TotalPhysical;
        public ulong AvailablePhysical;
        public ulong TotalPageFile;
        public ulong AvailablePageFile;
        public ulong TotalVirtual;
        public ulong AvailableVirtual;
        public ulong AvailableExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalMemoryStatusEx(ref MemoryStatus data);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
    private static long prevIdle, prevKernel, prevUser;
    private static long prevReceived, prevSent;
    private static DateTime prevNetworkAt = DateTime.MinValue;
    private static bool sampled;
    private static readonly object metricsGate = new();
    internal static object Snapshot()
    {
        lock (metricsGate) return SnapshotLocked();
    }
    private static object SnapshotLocked()
    {
        var mem = new MemoryStatus { Size = (uint)Marshal.SizeOf<MemoryStatus>() };
        if (!GlobalMemoryStatusEx(ref mem)) throw new InvalidOperationException("Windows memory metrics unavailable.");
        double? cpu = null;
        if (GetSystemTimes(out var idle, out var kernel, out var user))
        {
            if (sampled)
            {
                long totalDelta = kernel - prevKernel + user - prevUser;
                long idleDelta = idle - prevIdle;
                if (totalDelta > 0) cpu = Math.Round(100.0 * Math.Clamp(1.0 - (double)idleDelta / totalDelta, 0, 1), 1);
            }
            (prevIdle, prevKernel, prevUser) = (idle, kernel, user); sampled = true;
        }
        double totalGb = Math.Round(mem.TotalPhysical / (1024.0*1024*1024), 2);
        double usedGb = Math.Round((mem.TotalPhysical - mem.AvailablePhysical)/(1024.0*1024*1024), 2);
        double? disk = null;
        try
        {
            string root = Path.GetPathRoot(Environment.SystemDirectory)!;
            var drive = new DriveInfo(root);
            if (drive.IsReady && drive.TotalSize > 0) disk = Math.Round((1.0 - (double)drive.AvailableFreeSpace / drive.TotalSize) * 100, 1);
        }
        catch (Exception ex) { AssistantDiagnostics.Write("monitor:disk", ex.Message); }
        double? netDown = null, netUp = null;
        try
        {
            long received = 0, sent = 0;
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                var stats = nic.GetIPStatistics();
                received += stats.BytesReceived;
                sent += stats.BytesSent;
            }
            var now = DateTime.UtcNow;
            var elapsed = (now - prevNetworkAt).TotalSeconds;
            if (elapsed >= 0.4 && prevNetworkAt != DateTime.MinValue)
            {
                netDown = Math.Round(Math.Max(0, received - prevReceived) / elapsed / 1024, 1);
                netUp = Math.Round(Math.Max(0, sent - prevSent) / elapsed / 1024, 1);
            }
            prevNetworkAt = now; prevReceived = received; prevSent = sent;
        }
        catch (Exception ex) { AssistantDiagnostics.Write("monitor:network", ex.Message); }
        return new {
            cpu, ram = Math.Round(mem.MemoryLoad * 1.0, 1), gpu = (double?)null,
            disk, networkDownKBps = netDown, networkUpKBps = netUp,
            memoryTotalGb = totalGb, memoryUsedGb = usedGb
        };
    }
}

