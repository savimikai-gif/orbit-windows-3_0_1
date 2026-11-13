using System.Diagnostics;
using System.Text;
using NAudio.Wave;
using Whisper.net;
var assets=Path.GetFullPath(args[0]);
var start=new ProcessStartInfo(Path.Combine(assets,"piper","piper.exe")){UseShellExecute=false,RedirectStandardInput=true,StandardInputEncoding=new UTF8Encoding(false)};
start.ArgumentList.Add("--model");start.ArgumentList.Add(Path.Combine(assets,"ro_RO-mihai-medium.onnx"));start.ArgumentList.Add("--output_file");start.ArgumentList.Add("romanian.wav");
using var p=Process.Start(start)!;await p.StandardInput.WriteLineAsync("Setează volumul la cincizeci la sută.");p.StandardInput.Close();await p.WaitForExitAsync();if(p.ExitCode!=0)throw new Exception("Romanian synthesis failed");
using(var input=new WaveFileReader("romanian.wav"))using(var resampler=new MediaFoundationResampler(input,new WaveFormat(16000,16,1)))WaveFileWriter.CreateWaveFile("recognition.wav",resampler);
using var factory=WhisperFactory.FromPath(Path.Combine(assets,"ggml-small.bin"));using var processor=factory.CreateBuilder().WithLanguage("auto").Build();using var wav=File.OpenRead("recognition.wav");var text=new StringBuilder();await foreach(var part in processor.ProcessAsync(wav))text.Append(part.Text);Console.WriteLine("Local Romanian round-trip: "+text);
if(!text.ToString().Contains("volum",StringComparison.OrdinalIgnoreCase) || !System.Text.RegularExpressions.Regex.IsMatch(text.ToString(), @"\b(?:50|cincizeci)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception("Romanian transcription did not recognize the volume command");


