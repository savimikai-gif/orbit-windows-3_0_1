using System.Text.Json;

namespace ORBIT;

// Local notes stay outside the installed app folder and survive a normal in-place update.
internal sealed class NotesStore
{
    private sealed class Note
    {
        public string id { get; set; } = "";
        public string title { get; set; } = "";
        public string body { get; set; } = "";
        public DateTimeOffset createdAt { get; set; }
        public DateTimeOffset updatedAt { get; set; }
        public bool pinned { get; set; }
    }
    private readonly object gate = new();
    private readonly string file = Path.Combine(Program.AppDataDir, "notes.json");
    private List<Note> Load()
    {
        if (!File.Exists(file)) return new();
        try { return JsonSerializer.Deserialize<List<Note>>(File.ReadAllText(file)) ?? new(); }
        catch (JsonException) { return File.Exists(file + ".bak") ? JsonSerializer.Deserialize<List<Note>>(File.ReadAllText(file + ".bak")) ?? new() : new(); }
    }
    private void Store(List<Note> notes)
    {
        Directory.CreateDirectory(Program.AppDataDir);
        string tmp = file + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(notes, new JsonSerializerOptions { WriteIndented = true }));
        if (File.Exists(file)) File.Replace(tmp, file, file + ".bak", true);
        else File.Move(tmp, file); // atomic update + last-known-good backup
    }
    internal object List()
    {
        lock (gate) return Load().OrderByDescending(n => n.pinned).ThenByDescending(n => n.updatedAt).ToArray();
    }
    internal object Upsert(string id, string title, string body, bool pinned)
    {
        if (title.Length > 200 || body.Length > 80_000) throw new InvalidOperationException("Note is too long.");
        if (!string.IsNullOrEmpty(id) && !Guid.TryParse(id, out _)) throw new InvalidOperationException("Invalid note ID.");
        lock (gate)
        {
            var notes = Load();
            var note = notes.FirstOrDefault(n => n.id == id);
            if (note is null)
            {
                if (notes.Count >= 3000) throw new InvalidOperationException("Too many notes. Export and archive old notes.");
                note = new Note { id = Guid.NewGuid().ToString("D"), createdAt = DateTimeOffset.UtcNow };
                notes.Add(note);
            }
            note.title = title.Trim(); note.body = body; note.pinned = pinned; note.updatedAt = DateTimeOffset.UtcNow;
            Store(notes);
            return note;
        }
    }
    internal bool Delete(string id)
    {
        if (!Guid.TryParse(id, out _)) return false;
        lock (gate) { var notes = Load(); int removed = notes.RemoveAll(n => n.id == id); if (removed > 0) Store(notes); return removed > 0; }
    }
}
