using System.Speech.Recognition;

namespace ORBIT;

/// <summary>Microphone input using the recognizers installed in Windows.
/// Recognition is asynchronous. This is NOT a cloud transcription model: some accents and
/// languages cannot be handled well by legacy Windows SAPI; diagnostic events explain why.</summary>
internal sealed class SpeechController : IDisposable
{
    private SpeechRecognitionEngine? recognizer;
    private Grammar? wakeGrammar;
    private DictationGrammar? dictationGrammar;
    private readonly System.Threading.Timer expiry;
    private readonly object gate = new();
    private DateTime commandDeadline = DateTime.MinValue;
    private DateTime finishDeadline = DateTime.MinValue;
    private DateTime lastHypothesis = DateTime.MinValue;
    private bool handsFree;
    public event Action<string, string>? StatusChanged;

    public SpeechController() => expiry = new System.Threading.Timer(_ => Expire(), null, 600, 600);

    private void Report(string state, string message)
    {
        if (state != "hypothesis") AssistantDiagnostics.Write("recognition:" + state, message);
        StatusChanged?.Invoke(state, message);
    }
    private void Expire()
    {
        lock (gate)
        {
            if (finishDeadline != DateTime.MinValue && DateTime.UtcNow >= finishDeadline)
            {
                AssistantDiagnostics.Write("recognition:timeout", "Command completion acknowledgement not received; rearming wake word");
                CommandCompleteInternal();
                return;
            }
            if (commandDeadline == DateTime.MinValue || DateTime.UtcNow < commandDeadline) return;
            commandDeadline = DateTime.MinValue;
            if (handsFree)
            {
                if (dictationGrammar is not null) dictationGrammar.Enabled = false;
                if (wakeGrammar is not null) wakeGrammar.Enabled = true;
                Report("armed", "No command understood. Say Hey ORBIT or use the text box.");
            }
            else { StopInternal(); Report("off", "No speech recognized. Try typing a command."); }
        }
    }
    internal object State()
    {
        lock (gate)
            return new { active = recognizer is not null, handsFree,
                languages = SpeechRecognitionEngine.InstalledRecognizers().Select(r => r.Culture.Name).Distinct().ToArray() };
    }
    internal object Start(bool wakeEnabled, string language)
    {
        lock (gate)
        {
            StopInternal();
            AssistantDiagnostics.Write("recognition:init", $"wake={wakeEnabled} language={language}");
            var info = SpeechRecognitionEngine.InstalledRecognizers()
                .FirstOrDefault(r => r.Culture.Name.Equals(language, StringComparison.OrdinalIgnoreCase));
            if (info is null)
            {
                Report("error", $"No Windows recognizer for {language}. Install a speech recognition language in Windows, or use typed commands.");
                throw new InvalidOperationException($"Windows speech recognition for {language} is not installed.");
            }
            try
            {
                recognizer = new SpeechRecognitionEngine(info);
                var builder = new GrammarBuilder { Culture = info.Culture };
                builder.Append(new Choices("hey orbit", "okay orbit", "ok orbit", "orbit"));
                wakeGrammar = new Grammar(builder) { Name = "orbit-wake" };
                dictationGrammar = new DictationGrammar { Name = "orbit-command" };
                recognizer.LoadGrammar(wakeGrammar);
                recognizer.LoadGrammar(dictationGrammar);
                wakeGrammar.Enabled = wakeEnabled;
                dictationGrammar.Enabled = !wakeEnabled;
                recognizer.SpeechRecognized += OnRecognized;
                recognizer.SpeechHypothesized += (_, e) =>
                {
                    if (DateTime.UtcNow - lastHypothesis > TimeSpan.FromMilliseconds(550))
                    {
                        lastHypothesis = DateTime.UtcNow;
                        Report("hypothesis", e.Result.Text);
                    }
                };
                recognizer.SpeechRecognitionRejected += (_, e) =>
                {
                    if (e.Result is not null)
                        AssistantDiagnostics.Write("recognition:rejected", $"confidence={e.Result.Confidence:F2} text={e.Result.Text}");
                };
                recognizer.AudioSignalProblemOccurred += (_, e) =>
                    Report("audio_problem", e.AudioSignalProblem.ToString());
                recognizer.RecognizeCompleted += (_, e) =>
                {
                    if (e.Error is not null) Report("error", e.Error.Message);
                };
                recognizer.SetInputToDefaultAudioDevice();
                recognizer.RecognizeAsync(RecognizeMode.Multiple);
                handsFree = wakeEnabled;
                commandDeadline = wakeEnabled ? DateTime.MinValue : DateTime.UtcNow.AddSeconds(15);
                Report(wakeEnabled ? "armed" : "listening", wakeEnabled ? "Say Hey ORBIT" : "Speak a command now");
                return State();
            }
            catch (Exception ex)
            {
                AssistantDiagnostics.Write("recognition:init_error", ex.ToString());
                StopInternal();
                throw new InvalidOperationException("Could not initialize Windows recognition: " + ex.Message, ex);
            }
        }
    }
    internal void PushToTalk(string language)
    {
        lock (gate)
        {
            if (recognizer is null) { Start(false, language); return; }
            finishDeadline = DateTime.MinValue;
            commandDeadline = DateTime.UtcNow.AddSeconds(15);
            if (wakeGrammar is not null) wakeGrammar.Enabled = false;
            if (dictationGrammar is not null) dictationGrammar.Enabled = true;
            Report("listening", "Speak a command now");
        }
    }
    private void OnRecognized(object? sender, SpeechRecognizedEventArgs e)
    {
        string text = e.Result.Text.Trim();
        if (text.Length == 0) return;
        var confidence = e.Result.Confidence;
        AssistantDiagnostics.Write("recognition:result", $"grammar={e.Result.Grammar?.Name}; confidence={confidence:F2}; text={text}");
        lock (gate)
        {
            bool isWake = e.Result.Grammar?.Name == "orbit-wake";
            if (confidence < (isWake ? 0.32f : 0.34f))
            {
                Report("rejected", $"Low confidence ({confidence:F2}): {text}");
                return;
            }
            if (isWake)
            {
                commandDeadline = DateTime.UtcNow.AddSeconds(15);
                finishDeadline = DateTime.MinValue;
                if (wakeGrammar is not null) wakeGrammar.Enabled = false;
                if (dictationGrammar is not null) dictationGrammar.Enabled = true;
                Report("listening", "Wake word heard. Give a command.");
                return;
            }
            if (commandDeadline == DateTime.MinValue || DateTime.UtcNow > commandDeadline)
            {
                AssistantDiagnostics.Write("recognition:ignored", "Command heard outside active listening window");
                return;
            }
            commandDeadline = DateTime.MinValue;
            finishDeadline = DateTime.UtcNow.AddSeconds(25);
            if (dictationGrammar is not null) dictationGrammar.Enabled = false;
            Report("heard", text);
        }
    }
    internal void CommandComplete()
    {
        lock (gate) CommandCompleteInternal();
    }
    private void CommandCompleteInternal()
    {
        finishDeadline = DateTime.MinValue;
        commandDeadline = DateTime.MinValue;
        if (handsFree && recognizer is not null)
        {
            if (dictationGrammar is not null) dictationGrammar.Enabled = false;
            if (wakeGrammar is not null) wakeGrammar.Enabled = true;
            Report("armed", "Say Hey ORBIT");
        }
        else { StopInternal(); Report("off", "Microphone idle"); }
    }
    internal void Stop()
    {
        lock (gate) { StopInternal(); Report("off", "Microphone off"); }
    }
    private void StopInternal()
    {
        commandDeadline = DateTime.MinValue;
        finishDeadline = DateTime.MinValue;
        var engine = recognizer;
        recognizer = null;
        wakeGrammar = null;
        dictationGrammar = null;
        handsFree = false;
        if (engine is not null)
        {
            try { engine.RecognizeAsyncCancel(); } catch { }
            try { engine.Dispose(); } catch { }
        }
    }
    public void Dispose() { expiry.Dispose(); Stop(); }
}
