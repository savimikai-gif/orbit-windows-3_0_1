using System.Diagnostics;
using System.Text;

namespace ORBIT;

/// <summary>Local diagnostics for the assistant. Speech transcripts can contain personal information;
/// the file is private to this Windows user and never uploaded by ORBIT.</summary>
internal static class AssistantDiagnostics
{
    private static readonly object Gate = new();
    internal static string FilePath => Path.Combine(Program.AppDataDir, "assistant.log");

    internal static void Write(string stage, string message)
    {
        try
        {
            string line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff zzz}] [{stage}] {message.Replace('\r',' ').Replace('\n',' ').Substring(0, Math.Min(1100,message.Length))}{Environment.NewLine}";
            lock (Gate)
            {
                Directory.CreateDirectory(Program.AppDataDir);
                // Keep only recent diagnostics. Don't let a long-running assistant fill the disk.
                if (File.Exists(FilePath) && new FileInfo(FilePath).Length > 2_000_000)
                {
                    var bytes = File.ReadAllBytes(FilePath);
                    var start = Math.Max(0, bytes.Length - 700_000);
                    var text = Encoding.UTF8.GetString(bytes, start, bytes.Length - start);
                    var firstNewline = text.IndexOf('\n');
                    File.WriteAllText(FilePath, firstNewline >= 0 ? text[(firstNewline+1)..] : text);
                }
                File.AppendAllText(FilePath, line, Encoding.UTF8);
            }
        }
        catch (Exception ex) { Debug.WriteLine("ORBIT diagnostic logging failed: " + ex.Message); }
    }

    internal static string Tail()
    {
        lock (Gate)
        {
            if (!File.Exists(FilePath)) return "No assistant events recorded yet.";
            // Bound response size to avoid overwhelming the UI.
            string text = File.ReadAllText(FilePath);
            return text.Length <= 35_000 ? text : text[^35_000..];
        }
    }
}
