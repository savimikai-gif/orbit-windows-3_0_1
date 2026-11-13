$ErrorActionPreference = 'Stop'
$destination = Join-Path $PWD 'Publish/Speech'
New-Item -ItemType Directory -Force $destination | Out-Null
function Download-SpeechFile([string]$url, [string]$name) {
    & curl.exe --fail --location --retry 3 $url --output (Join-Path $destination $name)
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $name" }
}
Download-SpeechFile 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' 'ggml-small.bin'
Download-SpeechFile 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' 'piper.zip'
Expand-Archive (Join-Path $destination 'piper.zip') $destination -Force
Remove-Item -LiteralPath (Join-Path $destination 'piper.zip')
Download-SpeechFile 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx' 'ro_RO-mihai-medium.onnx'
Download-SpeechFile 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx.json' 'ro_RO-mihai-medium.onnx.json'
Download-SpeechFile 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ro/ro_RO/mihai/medium/MODEL_CARD' 'Romanian-voice-model-card.txt'
Download-SpeechFile 'https://raw.githubusercontent.com/rhasspy/piper/master/LICENSE.md' 'Piper-LICENSE.txt'
Download-SpeechFile 'https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/COPYING' 'eSpeak-COPYING.txt'
Download-SpeechFile 'https://raw.githubusercontent.com/ggerganov/whisper.cpp/master/LICENSE' 'Whisper-LICENSE.txt'
@"
Local recognition uses Whisper.net / whisper.cpp (MIT).
Romanian synthesis uses Piper 2023.11.14-2 (MIT), eSpeak NG (GPLv3), ONNX Runtime (MIT), and the Mihai voice (see model card).
Source code and build instructions:
https://github.com/rhasspy/piper/tree/2023.11.14-2
https://github.com/rhasspy/piper-phonemize
https://github.com/espeak-ng/espeak-ng
https://github.com/microsoft/onnxruntime
https://github.com/sandrohanea/whisper.net
https://github.com/ggerganov/whisper.cpp
"@ | Set-Content (Join-Path $destination 'THIRD-PARTY-NOTICES.txt')



