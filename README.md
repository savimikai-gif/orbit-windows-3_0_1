# ORBIT 3.2.1 — integrated Windows desktop source

**This is a complete source-code/build package, not a precompiled or Windows-verified executable.**

ORBIT is a Windows desktop application built with **C# / .NET 10 (Windows Forms), Microsoft WebView2, JavaScript and CSS**. The interface is embedded into the EXE at build time. It is **not** a second Designobo app or a browser-only prototype. The styling is inspired by the ORBIT Designobo project while retaining the existing working ORBIT screens and Windows bridge.

## Changes in this update

### 1. Assistant reliability (first priority)
- An accessible **text command field on the Dashboard** triggers the same command handler as recognized voice input. Supported examples: `open calculator`, `open notepad`, `set volume to 30 percent`, `show reminders`, `create a note`, `show PC performance`, `help`.
- Visible **Listening / Recognizing / Thinking / Speaking / Error** state and the last response, with diagnostic events logged locally to `%LOCALAPPDATA%\ORBIT\assistant.log` (see **Settings → ORBIT Voice Activation → Assistant diagnostics**).
- Traces microphone initialization, wake word, recognition confidence, rejected speech, command dispatch, response, native output and errors. Use **Refresh log** and **Open logs folder** to inspect.
- Commands such as voice start/stop, Windows volume/brightness, performance snapshots, and TTS are dispatched asynchronously from the UI event handler so that slow operations do not block WebView2.
- Corrected wake-word-to-command handoff: the recognizer switches to dictation after waking, waits for command handling, then rearms automatically; includes a timeout rather than becoming stuck permanently.
- Added **native Windows SAPI speech synthesis** with browser speech fallback. No speech API account/key required, but Romanian voice **requires a Romanian Windows SAPI or WebView2 voice installed**. Accurate Romanian speech recognition **also requires a compatible `ro-RO` speech recognizer installed in Windows**. Modern offline multilingual transcription and general conversational AI are **not included**.

### 2. Actual Windows UI, not only the design prototype
- Designobo-inspired animated ORBIT core, rotating rings, slow background-cloud motion, rounded-square cards, consistent spacing/colors and hover/press transitions in `Web/src/style.css`, shipped inside the Windows binary.
- **Quick Web** keeps Google Search and the existing shortcuts with a compact, consistent grid. **Quick Launch** no longer takes up an oversized empty section when no preset exists.
- Voice speed, pitch, and volume sliders have a consistent visual style and smooth thumb movement, with voice volume adjustable in **1% increments from 0–100%**. Voice volume controls ORBIT speech, **not** the overall PC volume. Pitch applies to browser voices; the native SAPI engine does not expose pitch in this implementation.
- Motion setting **Full / Reduced / Off**; respects operating-system reduced-motion preferences.

### 3. Widgets, profile, persistence
- CPU, RAM, GPU, disk and network Dashboard widgets use rounded-square cards with a visible-on-hover **X**, animated removal and a picker to restore closed widgets. Drag/drop ordering and visibility persist.
- CPU/RAM, disk and network values come from Windows native APIs. GPU utilization currently displays **— / unavailable** rather than inventing a figure. Disk percentage is the Windows system drive. Network speed is an approximate sum across active network adapters.
- Separate compact always-on-top Windows overlay with a close button, drag positioning and saved position.
- First-run welcome asks what to call you; profile is stored in `%APPDATA%\Orbit\profile.json`. Local settings in `%APPDATA%\Orbit\state.json` use atomic replacement and `.bak` recovery; existing reminders/presets/notes retain their prior storage paths.
- Other features retained: Notes, Reminders, Presets, Timer, Weather, Command Palette, native Windows controls, desktop app launcher, GitHub updater, installation scripts.

## Project structure

```
ORBIT_3_2_1/
├─ .github/workflows/build-windows.yml       GitHub Actions Windows build
├─ Native/
│  ├─ ORBIT.csproj                            .NET project and NuGet dependencies
│  ├─ Program.cs                             App entry point
│  ├─ MainWindow.cs                          Windows host + WebView2/native bridge
│  ├─ SpeechController.cs                    Async microphone recognition + wake-word state
│  ├─ VoiceOutput.cs                         New SAPI text-to-speech
│  ├─ AssistantDiagnostics.cs                New diagnostic log
│  ├─ WindowsControl.cs                      System actions and real PC telemetry
│  ├─ MiniWidget.cs                          Always-on-top performance overlay
│  ├─ NotesStore.cs                          Local notes data
│  ├─ UserStateStore.cs                      Versioned local settings/profile persistence
│  └─ UpdateService.cs                      GitHub Releases update client
├─ Web/
│  ├─ index.html                             Dashboard, pages, settings and inputs
│  └─ src/
│     ├─ main.js                            App state and commands
│     ├─ style.css                          Design and animations
│     └─ native-bridge.js                   WebView2 request/reply bridge
├─ Assets/icon.ico
├─ Installer/ORBIT.iss                      Inno Setup installer
├─ BUILD_WINDOWS.bat                        Optional direct Windows build
├─ README.md
├─ RELEASE_CHECKLIST.md
└─ START_HERE.txt
```

## Recommended build — GitHub Actions (no developer tools on your PC)

1. Keep a copy of your existing repository source and export settings as an extra backup if you can.
2. Extract the ZIP and **upload the CONTENTS of `ORBIT_3_2_1/`** into the **ROOT** of your existing `orbit-windows` GitHub repository, preserving the folder structure. Do not upload a second nested `ORBIT_3_2_1` directory.
3. In `.github/workflows/build-windows.yml`, the workflow is named **Build ORBIT 3.2.1 for Windows**. Push the commit to `main`, or open **Actions → Build ORBIT 3.2.1 for Windows → Run workflow**.
4. Wait for the action to complete **green**. If it turns red, open the failed job/step and read the error. There is no verified executable until the Windows build succeeds.
5. Open the completed run → **Artifacts → ORBIT-3.2.1-Windows**, download/unzip the artifact and run `ORBIT_3_2_1_Setup.exe`.
6. Windows may require **Microsoft Edge WebView2 Runtime**. The installer is configured to run **without admin privileges**, installed per user. Do not delete `%LOCALAPPDATA%\ORBIT` or `%APPDATA%\Orbit` when upgrading.

### Alternative local build

On a Windows development PC install **.NET 10 SDK** (includes restore/build tools) and optionally **Inno Setup 6**. Double-click `BUILD_WINDOWS.bat` from this folder. The application is C#, not Python; **no pip command** is needed. GitHub Actions restores dependencies automatically from NuGet (`Microsoft.Web.WebView2`, `System.Speech`, `System.Management`, `NAudio`, `System.Security.Cryptography.ProtectedData`).

## Known limitations — read before installing

- **No Windows compile or actual audio-device test was possible in the source preparation environment.** The web UI passed headless Chromium smoke tests with a **mocked Windows native bridge**; this does not prove real microphone, TTS, system telemetry or Windows installer behavior.
- Windows SAPI speech recognition is an older, language-dependent engine. It may misunderstand speech even when the microphone is working. **Better AI transcription, especially Romanian, is not a solved feature in this release.** Don't interpret the orb animation as proof recognition worked: use the transcript/status and the diagnostic log.
- **Typed commands are supported**, not arbitrary AI conversations. Unsupported requests get an explicit message explaining that ORBIT heard the request but has no matching command.
- Romanian voice synthesis works only if the operating system exposes a compatible voice; no speech model is bundled. Native SAPI pitch is not adjustable.
- GPU usage/temperature and game FPS are not yet implemented. Disk/network values are live but may be unavailable on some systems.
- An updater requires you to publish a **GitHub Release** with the expected installer and SHA256 file. A private Actions artifact alone will not make automatic updates available.
- The native Windows UI and animations have **not** been benchmarked for 60 fps or under 1% CPU.
- User data remains **local**; no cloud sync, login or remote speech API.
- Fonts fall back to Windows fonts; extra font files have **not** been bundled into the archive.

Review `RELEASE_CHECKLIST.md` after the GitHub Actions build succeeds.
