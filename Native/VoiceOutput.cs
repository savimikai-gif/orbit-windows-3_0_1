using System.Globalization;
using System.Speech.Synthesis;

namespace ORBIT;

/// <summary>Async SAPI speech output. No API keys, network accounts or synchronous Speak calls.</summary>
internal sealed class VoiceOutput : IDisposable
{
    private readonly object gate = new();
    private SpeechSynthesizer? synth;
    private Prompt? current;
    internal event Action<string, string>? StatusChanged;

    internal object ListVoices()
    {
        lock (gate)
        {
            EnsureSynth();
            return synth!.GetInstalledVoices()
                .Where(v => v.Enabled)
                .Select(v => new { name = v.VoiceInfo.Name, language = v.VoiceInfo.Culture.Name })
                .ToArray();
        }
    }
    private void EnsureSynth()
    {
        if (synth is not null) return;
        synth = new SpeechSynthesizer();
        synth.SpeakStarted += (_, _) =>
        {
            AssistantDiagnostics.Write("tts", "Windows speech started");
            StatusChanged?.Invoke("speaking", "Speaking");
        };
        synth.SpeakCompleted += (_, e) =>
        {
            AssistantDiagnostics.Write("tts", e.Error is not null ? "speech failed: " + e.Error.Message : e.Cancelled ? "speech cancelled" : "speech completed");
            if (e.Error is not null) StatusChanged?.Invoke("error", "Voice output failed: " + e.Error.Message);
            else StatusChanged?.Invoke("idle", "Voice output completed");
        };
    }
    internal void Speak(string text, string locale, int volume, double rate, string selectedVoice = "")
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        lock (gate)
        {
            EnsureSynth();
            var candidates = synth!.GetInstalledVoices().Where(v => v.Enabled).Select(v => v.VoiceInfo).ToArray();
            VoiceInfo? voice = null;
            if (!string.IsNullOrWhiteSpace(selectedVoice))
                voice = candidates.FirstOrDefault(v => v.Name.Equals(selectedVoice, StringComparison.OrdinalIgnoreCase));
            if (voice is null)
            {
                voice = candidates.FirstOrDefault(v => v.Culture.Name.Equals(locale, StringComparison.OrdinalIgnoreCase))
                    ?? candidates.FirstOrDefault(v => v.Culture.TwoLetterISOLanguageName.Equals(locale.Split('-')[0], StringComparison.OrdinalIgnoreCase));
            }
            if (voice is null)
            {
                var problem = $"No installed Windows speech voice for {locale}. Install that language's text-to-speech voice, or choose another language.";
                AssistantDiagnostics.Write("tts:error", problem);
                throw new InvalidOperationException(problem);
            }
            try
            {
                synth.SpeakAsyncCancelAll();
                synth.SelectVoice(voice.Name);
                synth.Volume = Math.Clamp(volume, 0, 100);
                // SAPI rate is -10..10; 0 is neutral. Existing ORBIT scale is about 0.75..1.15.
                synth.Rate = Math.Clamp((int)Math.Round((rate - 1.0) * 12), -6, 4);
                AssistantDiagnostics.Write("tts:queued", $"voice={voice.Name}, locale={voice.Culture.Name}, chars={text.Length}");
                current = synth.SpeakAsync(text.Length > 1200 ? text[..1200] : text);
            }
            catch (Exception ex)
            {
                AssistantDiagnostics.Write("tts:error", ex.Message);
                throw;
            }
        }
    }
    internal void Cancel()
    {
        lock (gate) synth?.SpeakAsyncCancelAll();
    }
    public void Dispose()
    {
        lock (gate) { synth?.Dispose(); synth = null; current = null; }
    }
}
