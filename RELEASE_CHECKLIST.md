# ORBIT 3.2.1 — Windows acceptance tests

The following tests are **for the installed Windows build**, not claims of completed testing. If any test fails, record the exact error and attach the relevant tail from `%LOCALAPPDATA%\ORBIT\assistant.log` (remove any private spoken text you do not want to share).

## Install / preservation
- [ ] GitHub Actions builds `ORBIT.exe`, `ORBIT_3_2_1_Setup.exe` and a SHA256 checksum without error.
- [ ] The installer starts the real Windows desktop application without a terminal window.
- [ ] Upgrade preserves existing notes, reminders, timers, presets, settings and window position.
- [ ] After fresh install with no profile, welcome appears exactly once, and name survives restart.
- [ ] Reset Profile opens the welcome screen again after restarting.

## Voice / typed assistant — test these before any styling feedback
- [ ] Type `open calculator` → an actual separate Windows Calculator window opens; response is visible in ORBIT.
- [ ] Type `set volume to 30 percent` → Windows system volume changes; response shown.
- [ ] Type `help` → supported commands are shown.
- [ ] Enable voice activation with an installed Windows speech-recognition language; status says `Ready · Hey ORBIT`.
- [ ] Say `Hey ORBIT` → `Listening`; say `Open calculator` → `Thinking`, then a response; logs contain recognition and command stages.
- [ ] Click `Push to talk` and say `Open Notepad`; check transcription log, command execution and spoken response.
- [ ] Click `Test voice`; verify TTS plays using an installed voice. If Romanian fails, check whether Windows provides a Romanian recognition/voice component; inspect log for exact failure.
- [ ] Disconnect microphone / select missing speech language; UI displays a useful error, doesn't freeze or silently fail.
- [ ] Open Settings → Assistant diagnostics → Refresh log; timestamps, recognition, command and TTS stages are recorded.

## UI / Designobo integration
- [ ] Main orb rotates and pulses inside installed EXE; slow animated background appears when motion is `Full`.
- [ ] Changing Animations to `Reduced` / `Off` affects animations and persists.
- [ ] Quick Web Google search launches the default web browser; links align on one grid without excessive empty padding.
- [ ] Quick Launch empty state is compact; saved presets appear; Create Preset works.
- [ ] Slider thumb moves without a gap from 0% through 100%; value persists after restart.
- [ ] Widget hover reveals `X`. Close CPU widget: it fades and disappears; Add Widget restores it after changing pages and relaunching.
- [ ] Drag widgets to reorder; after restarting, the new order remains.
- [ ] CPU/RAM/disk/network show actual measured Windows values; unavailable GPU displays a dash, not fake data.
- [ ] Open the corner overlay, drag it, hide with X, reopen; overlays keep their position.
- [ ] Reminders, notes, presets, timers, weather and updater still open. Test their actual functionality, not just navigation.

## Release decision
Publish ORBIT 3.2.1 as stable **only when build and core voice/text tests pass**. If native compilation fails, fix that exact compiler diagnostic first; browser-only screenshots are not proof that the installed build is working.
