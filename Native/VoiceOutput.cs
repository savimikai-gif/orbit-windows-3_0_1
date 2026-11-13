using System.Diagnostics;
using System.Text;
using NAudio.Wave;
using System.Globalization;
using System.Speech.Synthesis;

namespace ORBIT;

/// <summary>Async SAPI speech output. No API keys, network accounts or synchronous Speak calls.</summary>
internal sealed class VoiceOutput : IDisposable
{
    private readonly object gate = new();
    private SpeechSynthesizer? synth;
    private Prompt? current;
    private CancellationTokenSource? localSpeech;
    internal event Action<string, string>? StatusChanged;

    internal object ListVoices()
    {
        lock (gate)
        {
            EnsureSynth();
            return synth!.GetInstalledVoices()
                .Where(v => v.Enabled)
                .Select(v => new { name = v.VoiceInfo.Name, language = v.VoiceInfo.Culture.Name })
                .Append(new { name = "ORBIT Romanian (local)", language = "ro-RO" })
                .ToArray();
        }
    }
    private void EnsureSynth()
    {
        if (synth is not null) return;
        synth = new SpeechSynthesizer();
        synth.SpeakStarted += (_, e) =>
        {
            lock (gate) { if (e.Prompt != current) return; }
            AssistantDiagnostics.Write("tts", "Windows speech started");
            StatusChanged?.Invoke("speaking", "Speaking");
        };
        synth.SpeakCompleted += (_, e) =>
        {
            lock (gate) { if (e.Prompt != current) return; current = null; }
            AssistantDiagnostics.Write("tts", e.Error is not null ? "speech failed: " + e.Error.Message : e.Cancelled ? "speech cancelled" : "speech completed");
            if (e.Error is not null) StatusChanged?.Invoke("error", "Voice output failed: " + e.Error.Message);
            else StatusChanged?.Invoke("idle", "Voice output completed");
        };
    }
    internal void Speak(string text, string locale, int volume, double rate, string selectedVoice = "")
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        if (locale.StartsWith("ro", StringComparison.OrdinalIgnoreCase))
        {
            lock(gate) { Cancel(); localSpeech=new CancellationTokenSource(); _=SpeakRomanian(text,volume,rate,localSpeech.Token); }
            return;
        }
        lock (gate)
        {
            localSpeech?.Cancel();
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
    private async Task SpeakRomanian(string text,int volume,double rate,CancellationToken token)
    {
        string wav=Path.Combine(Path.GetTempPath(),"orbit-"+Guid.NewGuid()+".wav");
        try
        {
            string folder=Path.Combine(AppContext.BaseDirectory,"Speech");
            var start=new ProcessStartInfo(Path.Combine(folder,"piper","piper.exe")) { UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardError=true,StandardInputEncoding=new UTF8Encoding(false) };
            start.ArgumentList.Add("--model");start.ArgumentList.Add(Path.Combine(folder,"ro_RO-mihai-medium.onnx"));
            start.ArgumentList.Add("--output_file");start.ArgumentList.Add(wav);
            start.ArgumentList.Add("--length_scale");start.ArgumentList.Add((1/Math.Clamp(rate,.5,2)).ToString(CultureInfo.InvariantCulture));
            using var process=Process.Start(start) ?? throw new InvalidOperationException("Could not start Romanian speech.");
            using var registration=token.Register(()=>{try{if(!process.HasExited)process.Kill(true);}catch(InvalidOperationException){}});
            var errors=process.StandardError.ReadToEndAsync(token);
            await process.StandardInput.WriteLineAsync(text.Replace('\n',' '));process.StandardInput.Close();
            await process.WaitForExitAsync(token);
            if(process.ExitCode!=0)throw new InvalidOperationException("Romanian synthesis failed: "+await errors);
            using var reader=new WaveFileReader(wav);using var output=new WaveOutEvent();output.Init(reader);output.Volume=Math.Clamp(volume,0,100)/100f;
            var done=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            output.PlaybackStopped+=(_,e)=>{if(e.Exception is not null)done.TrySetException(e.Exception);else done.TrySetResult();};
            token.ThrowIfCancellationRequested();StatusChanged?.Invoke("speaking","Vorbesc");output.Play();
            await done.Task.WaitAsync(token);
            if(!token.IsCancellationRequested)StatusChanged?.Invoke("idle","Speech completed");
        }
        catch(OperationCanceledException) { }
        catch(Exception error){if(!token.IsCancellationRequested)StatusChanged?.Invoke("error",error.Message);}
        finally{try{File.Delete(wav);}catch(IOException){}}
    }
    internal void Cancel()
    {
        lock (gate) { localSpeech?.Cancel(); current=null; synth?.SpeakAsyncCancelAll(); }
    }
    public void Dispose()
    {
        lock (gate) { localSpeech?.Cancel(); synth?.Dispose(); synth = null; current = null; }
    }
}

