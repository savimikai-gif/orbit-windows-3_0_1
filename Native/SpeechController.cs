using NAudio.Wave;
using Whisper.net;
using System.Text.RegularExpressions;

namespace ORBIT;

internal sealed class SpeechController : IDisposable
{
    private readonly object gate = new();
    private readonly SemaphoreSlim processing = new(1,1);
    private WaveInEvent? microphone;
    private WhisperFactory? factory;
    private readonly MemoryStream audio = new();
    private bool handsFree, playback, busy, hasSpeech, disposed;
    private int generation, silenceBytes;
    private DateTime commandUntil = DateTime.MinValue;
    public event Action<string,string>? StatusChanged;
    private void Report(string state,string message) { AssistantDiagnostics.Write("recognition:"+state,message);StatusChanged?.Invoke(state,message); }
    internal object State() => new { active=microphone is not null,handsFree,languages=new[]{"auto"},engine="Whisper multilingual (local)" };
    internal object Start(bool wakeEnabled,string language)
    {
        lock(gate)
        {
            StopInternal();
            string model=Path.Combine(AppContext.BaseDirectory,"Speech","ggml-base.bin");
            if(!File.Exists(model))throw new InvalidOperationException("The local speech model is missing. Reinstall ORBIT using the full installer.");
            factory ??= WhisperFactory.FromPath(model);
            handsFree=wakeEnabled;commandUntil=wakeEnabled?DateTime.MinValue:DateTime.UtcNow.AddSeconds(25);
            microphone=new WaveInEvent { WaveFormat=new WaveFormat(16000,16,1),BufferMilliseconds=100 };
            microphone.DataAvailable+=Capture;
            microphone.RecordingStopped+=(_,e)=>{if(e.Exception is not null)Report("error",e.Exception.Message);};
            try { microphone.StartRecording(); }
            catch { StopInternal();throw; }
            Report(wakeEnabled?"armed":"listening",wakeEnabled?"Say Hey ORBIT · local recognition":"Speak now · English or Romanian");return State();
        }
    }
    private void Capture(object? sender,WaveInEventArgs e)
    {
        byte[]? utterance=null;int version=0;
        lock(gate)
        {
            if(sender!=microphone||playback||busy||disposed)return;
            if(!handsFree&&DateTime.UtcNow>commandUntil){audio.SetLength(0);hasSpeech=false;return;}
            double energy=0;for(int i=0;i+1<e.BytesRecorded;i+=2)energy+=Math.Abs((int)BitConverter.ToInt16(e.Buffer,i));
            bool voiced=energy/Math.Max(1,e.BytesRecorded/2)>250;
            if(voiced){hasSpeech=true;silenceBytes=0;}else silenceBytes+=e.BytesRecorded;
            audio.Write(e.Buffer,0,e.BytesRecorded);
            if(!hasSpeech&&audio.Length>6400){audio.SetLength(0);return;}
            if(hasSpeech&&(silenceBytes>=25600||audio.Length>=384000))
            {
                utterance=audio.ToArray();audio.SetLength(0);hasSpeech=false;silenceBytes=0;busy=true;version=generation;
            }
        }
        if(utterance is not null)_=Task.Run(()=>Transcribe(utterance,version));
    }
    private async Task Transcribe(byte[] samples,int version)
    {
        await processing.WaitAsync().ConfigureAwait(false);
        try
        {
            lock(gate){if(disposed||version!=generation)return;}
            using var wav=new MemoryStream();
            using(var writer=new WaveFileWriter(new NAudio.Utils.IgnoreDisposeStream(wav),new WaveFormat(16000,16,1))){writer.Write(samples,0,samples.Length);writer.Flush();}
            wav.Position=0;
            using var processor=factory!.CreateBuilder().WithLanguage("auto").Build();
            var pieces=new List<string>();
            await foreach(var segment in processor.ProcessAsync(wav).ConfigureAwait(false))pieces.Add(segment.Text);
            string text=string.Join(" ",pieces).Trim();
            lock(gate)
            {
                if(disposed||version!=generation||playback||text.Length==0)return;
                var wake=Regex.Match(text,@"^\s*(?:hey|hei)[,\s]+orbit\b[\s,:.!-]*(.*)$",RegexOptions.IgnoreCase);
                bool awake=DateTime.UtcNow<=commandUntil;
                if(handsFree&&!awake&&!wake.Success)return;
                if(wake.Success)text=wake.Groups[1].Value.Trim();
                if(text.Length==0){commandUntil=DateTime.UtcNow.AddSeconds(8);Report("listening","Speak your command");return;}
                commandUntil=DateTime.MinValue;Report("heard",text);
            }
        }
        catch(Exception error){lock(gate){if(version==generation&&!disposed)Report("error",error.Message);}}
        finally{lock(gate){if(version==generation)busy=false;}processing.Release();}
    }
    internal void PushToTalk(string language)
    {
        lock(gate){if(microphone is null){Start(false,language);return;}commandUntil=DateTime.UtcNow.AddSeconds(25);audio.SetLength(0);Report("listening","Speak now · English or Romanian");}
    }
    internal void SetPlayback(bool active){lock(gate){playback=active;generation++;busy=false;audio.SetLength(0);hasSpeech=false;if(!active)CommandComplete();}}
    internal void CommandComplete(){lock(gate){if(playback)return;commandUntil=DateTime.MinValue;if(handsFree&&microphone is not null)Report("armed","Say Hey ORBIT");else{StopInternal();Report("off","Microphone idle");}}}
    private void StopInternal(){generation++;busy=false;var old=microphone;microphone=null;if(old is not null){old.DataAvailable-=Capture;old.StopRecording();old.Dispose();}audio.SetLength(0);hasSpeech=false;silenceBytes=0;handsFree=false;commandUntil=DateTime.MinValue;}
    internal void Stop(){lock(gate){StopInternal();Report("off","Microphone off");}}
    public void Dispose(){lock(gate){disposed=true;StopInternal();}processing.Wait();try{factory?.Dispose();audio.Dispose();}finally{processing.Release();}}
}


