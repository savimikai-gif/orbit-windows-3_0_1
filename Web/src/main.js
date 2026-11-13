import { initializeOrb } from './orb.js';
import { normalizeCommand, parseDesktopCommand, matchApps } from './commands.js';
let pendingAppChoices = [];
let speechPlaybackActive = false;
import { invoke, isTauri, isPermissionGranted, requestPermission, sendNotification, open, openUrl, enableAutostart, disableAutostart, autostartIsEnabled } from './native-bridge.js';

const $ = (id) => document.getElementById(id);
const KEYS = {
  tasks: 'orbit2_tasks_v1', presets: 'orbit2_presets_v1',
  settings: 'orbit21_settings_v1', profile: 'orbit21_local_profile',
  remembered: 'orbit21_remembered', timers: 'orbit28_timers_v1'
};
const defaults = { language: 'en', voiceURI: '', rate: 0.92, pitch: 0.95, voiceVolume: 0.35, speakReminders: true, voiceEngine: 'system', city: null, closeToTray: false, accentColor: 'blue', surfaceStyle: 'glass', compactMode: false, showQuickWeb: true };
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
let tasks = read(KEYS.tasks, []);
let presets = read(KEYS.presets, []);
let settings = { ...defaults, ...read(KEYS.settings, {}) };
const accents = new Set(['blue', 'purple', 'teal', 'amber', 'rose']);
const surfaces = new Set(['classic', 'glass', 'flat']);
let profile = null; // ORBIT 3.1 requires no local or cloud sign-in.
let selectedDays = [1, 2, 3, 4, 5];
let editTaskId = null;
let editPresetIndex = null;
let selectedPaths = [];
let installedApps = [];
let weatherData = null;
let activePage = 'dashboard';
let toastTimeout;
const dayIds = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEB_LINKS = Object.freeze([
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'yahoo', title: 'Yahoo', url: 'https://www.yahoo.com/' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { id: 'chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com/' },
]);

const i18n = {
  en: {
    welcome: 'Welcome to Orbit.', localProfileIntro: 'Create your local profile to personalize this PC.', username: 'Username', password: 'Password', confirmPassword: 'Confirm password', rememberMe: 'Remember me on this computer', createProfile: 'Create profile', signIn: 'Sign in', authNotice: 'Local convenience lock only. No cloud account or encryption of reminders. Do not use a sensitive password.',
    workspace: 'WORKSPACE', dashboard: 'Dashboard', notes: 'Notes', reminders: 'Reminders', presets: 'Presets', weather: 'Weather', settings: 'Settings', desktopReady: 'Desktop online', yourDay: 'Your space, your day.', systemReady: 'SYSTEM READY',
    addReminder: 'Add reminder', hearOrbit: 'Hear Orbit', upNext: 'Up next', viewAll: 'View all →', details: 'Details →', liveWeather: 'Live weather', manage: 'Manage →', quickLaunch: 'Quick launch',
    localOnly: 'On this PC', taskName: 'Reminder', taskPlaceholder: 'What do you need to do?', dateAndTime: 'Date and time', repeat: 'Repeat', once: 'Does not repeat', daily: 'Every day', weekdays: 'Weekdays', customDays: 'Select days', cancel: 'Cancel', quickActions: 'Quick actions', tasksLocal: 'Your reminders stay on this PC. Export a backup whenever you like.', enableNotifications: 'Enable notifications', notificationsEnabled: 'Notifications enabled', clearCompleted: 'Clear completed', exportBackup: 'Export backup', reminderNotice: 'Orbit checks reminders while the app is running. Notifications are not guaranteed when Windows is shut down or the app is suspended.', yourReminders: 'Your reminders',
    createPreset: 'Create a preset', presetName: 'Preset name', selectedApps: 'Selected applications', browseApps: 'Browse files…', findInstalled: 'Find installed apps', searchApps: 'Search Start Menu shortcuts', searchAppsPlaceholder: 'Steam, Discord, Minecraft…', savePreset: 'Save preset', yourPresets: 'Your presets', presetHint: 'Pick installed shortcuts or browse for .exe/.lnk files. No manual paths needed.',
    chooseCity: 'Choose a city', cityPlaceholder: 'Search any city worldwide', search: 'Search', cityHint: 'Select a city from the results to save it as your default.', currentWeather: 'Current conditions', refresh: 'Refresh', weatherInternet: 'Requires internet.',
    preferences: 'Preferences', language: 'Language', voice: 'Orbit voice', speakingSpeed: 'Speaking speed', voicePitch: 'Voice pitch', speakReminders: 'Read reminders aloud', testVoice: 'Test voice', reloadVoices: 'Refresh voice list', voiceNote: 'Windows voices work offline. Optional online neural speech requires your own Azure Speech configuration.', profileAndApp: 'Profile & app', deviceProfile: 'Local profile on this Windows device', startWindows: 'Launch Orbit when Windows starts', startupNote: 'Optional. Best tested with the installed release, not development mode.', closeToTray: 'Close window to system tray', trayNote: 'When enabled, use the tray menu to quit Orbit. Reminders still depend on the app running.', signOut: 'Sign out', forgetSignIn: 'Forget automatic sign-in', profileNotice: 'This is a local profile, not cloud authentication. Passwords are hashed, but locally stored reminders are not encrypted.', footerTag: 'Built to keep things simple.',
    greeting: 'Welcome back', noTasks: 'Nothing scheduled right now.', upcomingNone: 'No upcoming reminders.', noReminders: 'No reminders yet.', noPresets: 'No presets yet. Create one to launch your apps together.', noApps: 'No applications selected.', noQuickPresets: 'Your saved application profiles will appear here.', noWeather: 'Search for a city to begin.', chooseWeather: 'Search for a location to see current conditions.', nextReminder: 'Next reminder', overdue: 'Overdue', everyDay: 'Every day', workdays: 'Weekdays', every: 'Every', onceLabel: 'Once', edit: 'Edit', delete: 'Delete', launch: 'Launch', saveChanges: 'Save changes', editReminder: 'Edit reminder', editPreset: 'Edit preset', complete: 'Mark completed', appAdded: 'Application added.', alreadyAdded: 'Already in this preset.', browseUnsupported: 'File picker works in the Windows desktop application.', noInstalled: 'No matching Start Menu shortcuts found. Use Browse files instead.', loadingApps: 'Looking for installed shortcuts…', chooseApps: 'Choose one or more apps from the list below.', removed: 'Removed.', saved: 'Saved.', deleted: 'Deleted.', emptyCity: 'Type a city name to search.', lookingCity: 'Searching locations…', noCity: 'No matching cities. Try a more specific name.', loadingWeather: 'Loading live weather…', weatherFailed: 'Could not load weather. Check your internet connection and try again.', refreshed: 'Updated', feelsLike: 'Feels like', wind: 'Wind', humidity: 'Humidity',
    clearConfirm: 'Remove all completed reminders?', deleteConfirm: 'Delete this item?', setDay: 'Select at least one repeat day.', pastDate: 'Choose a time in the future.', taskSaved: 'Reminder saved.', resetHint: 'Changes are stored locally.', permissionNeeded: 'Notification permission is not granted.', notificationActive: 'Notifications are enabled.', testPhrase: 'Orbit is online. Systems ready.', reminderPrefix: 'Reminder.', cannotSpeak: 'Windows speech is unavailable here.', noVoices: 'System default', voiceUpdated: 'Voice settings updated.',
    authFailed: 'Incorrect password.', authNeedsUser: 'Enter a username (at least two characters).', authShortPassword: 'Use a password of at least eight characters.', authMismatch: 'Passwords do not match.', authError: 'Could not create or open profile.', enterPassword: 'Enter your password.', citySelected: 'Location saved.', presetRequired: 'Add at least one application first.', launching: 'Launching applications…', launched: 'Launched', apps: 'apps', startupUnavailable: 'Windows startup is available only in the installed desktop app.', startupFailed: 'Could not change startup setting.', trayUnavailable: 'Tray setting is available only in the desktop app.', signedOut: 'Signed out.', weatherClear: 'Clear', weatherMainlyClear: 'Mainly clear', weatherCloudy: 'Cloudy', weatherFog: 'Fog', weatherDrizzle: 'Drizzle', weatherRain: 'Rain', weatherSnow: 'Snow', weatherShowers: 'Showers', weatherStorm: 'Thunderstorm', weatherUnknown: 'Variable conditions',
    today: 'Today', tomorrow: 'Tomorrow', nextWeek: 'Next week', time: 'Time', sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
  },
  ro: {
    welcome: 'Bun venit în Orbit.', localProfileIntro: 'Creează un profil local pentru acest PC.', username: 'Nume de utilizator', password: 'Parolă', confirmPassword: 'Confirmă parola', rememberMe: 'Ține-mă minte pe acest computer', createProfile: 'Creează profilul', signIn: 'Autentificare', authNotice: 'Blocare locală pentru confort, nu cont cloud. Mementourile nu sunt criptate. Nu folosi o parolă sensibilă.',
    workspace: 'SPAȚIU DE LUCRU', dashboard: 'Panou principal', notes: 'Notițe', reminders: 'Mementouri', presets: 'Profiluri rapide', weather: 'Vreme', settings: 'Setări', desktopReady: 'Aplicație activă', yourDay: 'Spațiul tău, ziua ta.', systemReady: 'SISTEM PREGĂTIT',
    addReminder: 'Adaugă memento', hearOrbit: 'Ascultă Orbit', upNext: 'În continuare', viewAll: 'Vezi tot →', details: 'Detalii →', liveWeather: 'Vreme în timp real', manage: 'Gestionează →', quickLaunch: 'Pornire rapidă',
    localOnly: 'Pe acest PC', taskName: 'Memento', taskPlaceholder: 'Ce ai de făcut?', dateAndTime: 'Data și ora', repeat: 'Repetare', once: 'Nu se repetă', daily: 'Zilnic', weekdays: 'În zilele lucrătoare', customDays: 'Alege zilele', cancel: 'Anulează', quickActions: 'Acțiuni rapide', tasksLocal: 'Mementourile rămân pe acest PC. Poți exporta o copie de rezervă.', enableNotifications: 'Activează notificările', notificationsEnabled: 'Notificări activate', clearCompleted: 'Șterge cele finalizate', exportBackup: 'Exportă copia', reminderNotice: 'Orbit verifică mementourile cât timp rulează. Notificările nu sunt garantate când Windows este oprit sau aplicația e suspendată.', yourReminders: 'Mementourile tale',
    createPreset: 'Creează un profil rapid', presetName: 'Numele profilului', selectedApps: 'Aplicații selectate', browseApps: 'Alege fișiere…', findInstalled: 'Caută aplicații instalate', searchApps: 'Caută scurtături în Start', searchAppsPlaceholder: 'Steam, Discord, Minecraft…', savePreset: 'Salvează profilul', yourPresets: 'Profilurile tale', presetHint: 'Alege scurtături din Start sau fișiere .exe/.lnk. Nu trebuie să scrii căile.',
    chooseCity: 'Alege un oraș', cityPlaceholder: 'Caută orice oraș din lume', search: 'Caută', cityHint: 'Alege un oraș din rezultate pentru a-l salva ca locație implicită.', currentWeather: 'Condiții actuale', refresh: 'Actualizează', weatherInternet: 'Necesită internet.',
    preferences: 'Preferințe', language: 'Limbă', voice: 'Vocea Orbit', speakingSpeed: 'Viteza vorbirii', voicePitch: 'Tonalitatea vocii', speakReminders: 'Citește mementourile cu voce tare', testVoice: 'Testează vocea', reloadVoices: 'Actualizează vocile', voiceNote: 'Vocile Windows funcționează offline. Vocea neurală online este opțională și necesită configurarea Azure Speech.', profileAndApp: 'Profil și aplicație', deviceProfile: 'Profil local pe acest dispozitiv Windows', startWindows: 'Pornește Orbit odată cu Windows', startupNote: 'Opțional. Se testează cel mai bine în versiunea instalată, nu în modul dezvoltare.', closeToTray: 'Ascunde în zona de notificare la închidere', trayNote: 'Când este activ, folosește meniul din tray pentru a închide Orbit complet. Mementourile depind de aplicația pornită.', signOut: 'Deconectare', forgetSignIn: 'Uită autentificarea automată', profileNotice: 'Profil local, nu autentificare cloud. Parolele sunt stocate sub formă de hash, însă mementourile locale nu sunt criptate.', footerTag: 'Simplu, fără complicații.',
    greeting: 'Bine ai revenit', noTasks: 'Nu ai nimic programat acum.', upcomingNone: 'Nu există mementouri viitoare.', noReminders: 'Nu ai mementouri încă.', noPresets: 'Nu ai profiluri rapide. Creează unul pentru aplicațiile tale.', noApps: 'Nicio aplicație selectată.', noQuickPresets: 'Profilurile salvate vor apărea aici.', noWeather: 'Caută un oraș pentru a începe.', chooseWeather: 'Caută o locație pentru vremea actuală.', nextReminder: 'Următorul memento', overdue: 'Întârziat', everyDay: 'Zilnic', workdays: 'Zile lucrătoare', every: 'În fiecare', onceLabel: 'O singură dată', edit: 'Editează', delete: 'Șterge', launch: 'Pornește', saveChanges: 'Salvează modificările', editReminder: 'Editează mementoul', editPreset: 'Editează profilul', complete: 'Marchează finalizat', appAdded: 'Aplicație adăugată.', alreadyAdded: 'Deja există în profil.', browseUnsupported: 'Selectorul de fișiere funcționează în aplicația desktop Windows.', noInstalled: 'Nu s-au găsit scurtături potrivite. Folosește Alege fișiere.', loadingApps: 'Se caută scurtături…', chooseApps: 'Selectează una sau mai multe aplicații de mai jos.', removed: 'Eliminat.', saved: 'Salvat.', deleted: 'Șters.', emptyCity: 'Scrie numele unui oraș.', lookingCity: 'Se caută locații…', noCity: 'Nu s-au găsit orașe. Încearcă un nume mai precis.', loadingWeather: 'Se încarcă vremea…', weatherFailed: 'Nu s-a putut încărca vremea. Verifică internetul și încearcă din nou.', refreshed: 'Actualizat', feelsLike: 'Resimțite', wind: 'Vânt', humidity: 'Umiditate',
    clearConfirm: 'Ștergi toate mementourile finalizate?', deleteConfirm: 'Ștergi acest element?', setDay: 'Alege cel puțin o zi.', pastDate: 'Alege o oră din viitor.', taskSaved: 'Memento salvat.', resetHint: 'Modificările sunt salvate local.', permissionNeeded: 'Notificările nu au permisiune.', notificationActive: 'Notificările sunt activate.', testPhrase: 'Orbit este online. Sistemele sunt pregătite.', reminderPrefix: 'Memento.', cannotSpeak: 'Vorbirea nu este disponibilă aici.', noVoices: 'Voce implicită', voiceUpdated: 'Setările vocii au fost actualizate.',
    authFailed: 'Parolă incorectă.', authNeedsUser: 'Introdu un nume de utilizator de cel puțin două caractere.', authShortPassword: 'Parola trebuie să aibă cel puțin opt caractere.', authMismatch: 'Parolele nu corespund.', authError: 'Profilul nu a putut fi creat sau deschis.', enterPassword: 'Introdu parola.', citySelected: 'Locație salvată.', presetRequired: 'Adaugă cel puțin o aplicație.', launching: 'Se pornesc aplicațiile…', launched: 'Pornite', apps: 'aplicații', startupUnavailable: 'Pornirea cu Windows este disponibilă doar în aplicația desktop instalată.', startupFailed: 'Nu s-a putut modifica setarea de pornire.', trayUnavailable: 'Setarea tray este disponibilă doar în aplicația desktop.', signedOut: 'Deconectat.', weatherClear: 'Senin', weatherMainlyClear: 'Mai mult senin', weatherCloudy: 'Noros', weatherFog: 'Ceață', weatherDrizzle: 'Burniță', weatherRain: 'Ploaie', weatherSnow: 'Ninsoare', weatherShowers: 'Averse', weatherStorm: 'Furtună', weatherUnknown: 'Vreme schimbătoare',
    sun: 'Du', mon: 'Lu', tue: 'Ma', wed: 'Mi', thu: 'Jo', fri: 'Vi', sat: 'Sâ',
  }
};
Object.assign(i18n.en,{"profileTheme":"Profile, theme & data","yourName":"Your name","theme":"Theme","animations":"Animations","voiceActivation":"ORBIT Voice Activation","localRecognition":"Local recognition · Romanian and English, automatic detection","pushTalk":"Push to talk","micOff":"Microphone off","assistantDiagnostics":"Assistant diagnostics","refreshLog":"Refresh log","openLogs":"Open logs folder","exportSettings":"Export settings","importSettings":"Import settings","resetProfile":"Reset profile","resetEverything":"Reset everything","lightTheme":"Light","darkTheme":"Dark","fullMotion":"Full","reducedMotion":"Reduced","offMotion":"Off"});
Object.assign(i18n.ro,{"profileTheme":"Profil, temă și date","yourName":"Numele tău","theme":"Temă","animations":"Animații","voiceActivation":"Activare vocală ORBIT","localRecognition":"Recunoaștere locală · română și engleză, detectare automată","pushTalk":"Apasă și vorbește","micOff":"Oprește microfonul","assistantDiagnostics":"Diagnosticarea asistentului","refreshLog":"Actualizează jurnalul","openLogs":"Deschide jurnalele","exportSettings":"Exportă setările","importSettings":"Importă setările","resetProfile":"Resetează profilul","resetEverything":"Resetează tot","lightTheme":"Luminoasă","darkTheme":"Întunecată","fullMotion":"Complete","reducedMotion":"Reduse","offMotion":"Oprite"});
i18n.en.neuralEngine = 'ORBIT Neural · English + Romanian'; i18n.ro.neuralEngine = 'ORBIT Neural · engleză + română';
i18n.en.neuralReady = 'Voice pack ready: British English (Alan) + Romanian (Mihai).';
i18n.ro.neuralReady = 'Vocile sunt pregătite: engleză britanică (Alan) + română (Mihai).';
i18n.en.neuralNotInstalled = 'Neural voice unavailable. Use START_ORBIT.bat to prepare the built-in voice pack.';
i18n.ro.neuralNotInstalled = 'Vocea neurală nu este disponibilă. Rulează START_ORBIT.bat pentru pregătirea pachetului vocal.';
i18n.en.neuralFallback = 'Neural voice unavailable; using Windows voice.';
i18n.ro.neuralFallback = 'Vocea neurală nu este disponibilă; folosesc vocea Windows.';
i18n.en.in15Minutes = '+15 min'; i18n.ro.in15Minutes = '+15 min';
i18n.en.in1Hour = '+1 hour'; i18n.ro.in1Hour = '+1 oră';
i18n.en.morning = 'Morning · 09:00'; i18n.ro.morning = 'Dimineața · 09:00';
i18n.en.evening = 'Evening · 18:00'; i18n.ro.evening = 'Seara · 18:00';
i18n.en.customTimeHint = 'Or set an exact time'; i18n.ro.customTimeHint = 'Sau alege ora exactă';
i18n.en.quickTimePast = 'That time has passed today. Moved to tomorrow.';
i18n.ro.quickTimePast = 'Ora a trecut astăzi. Am mutat pe mâine.';
i18n.en.voiceNote = 'Local speech. Romanian uses the bundled voice; English uses your installed Windows voice.';
i18n.ro.voiceNote = 'Vorbire locală. Vocea românească este inclusă; pentru engleză se folosește vocea instalată în Windows.';
i18n.en.voiceEngine = 'Speech engine'; i18n.ro.voiceEngine = 'Motor vocal';
i18n.en.systemEngine = 'Windows voice (built in)'; i18n.ro.systemEngine = 'Vocea Windows (integrată)';
i18n.ro.today = 'Astăzi'; i18n.ro.tomorrow = 'Mâine'; i18n.ro.nextWeek = 'Peste o săptămână'; i18n.ro.time = 'Ora';
i18n.en.neuralError = 'Neural voice error: '; i18n.ro.neuralError = 'Eroare voce neurală: ';
Object.assign(i18n.en, {
  quickWeb:'Quick web', defaultBrowserNote:'Opens in your Windows default browser.', googleSearch:'Search Google', googleSearchHint:'Search Google…', emptySearch:'Enter something to search.', browserFailed:'Could not open your browser.',
  voiceVolume:'Voice volume', voiceVolumeNote:'Controls Orbit speech only, not your Windows volume.',
  appearance:'Appearance', appearanceHint:'Customize Orbit. Changes apply immediately and are saved on this PC.', resetAppearance:'Reset look', accentColor:'Accent color', accentNote:'The dark ORBIT layout stays readable with every accent.', surfaceStyle:'Panel style', styleClassic:'Classic navy', styleGlass:'Soft glass', styleFlat:'Minimal flat', compactMode:'Compact layout', showQuickWeb:'Show quick web shortcuts on dashboard',
});
Object.assign(i18n.ro, {
  quickWeb:'Acces rapid pe web', defaultBrowserNote:'Se deschide în browserul implicit din Windows.', googleSearch:'Caută pe Google', googleSearchHint:'Caută pe Google…', emptySearch:'Scrie ceva pentru căutare.', browserFailed:'Nu s-a putut deschide browserul.',
  voiceVolume:'Volumul vocii', voiceVolumeNote:'Controlează doar vocea Orbit, nu volumul Windows.',
  appearance:'Aspect', appearanceHint:'Personalizează Orbit. Modificările se aplică imediat și se salvează pe acest PC.', resetAppearance:'Resetează aspectul', accentColor:'Culoare de accent', accentNote:'Interfața întunecată ORBIT rămâne lizibilă indiferent de culoare.', surfaceStyle:'Stilul panourilor', styleClassic:'Bleumarin clasic', styleGlass:'Sticlă discretă', styleFlat:'Minimal plat', compactMode:'Interfață compactă', showQuickWeb:'Arată scurtăturile web pe panoul principal',
});

Object.assign(i18n.en, {
  agenda:'Agenda', timers:'Timers', system:'System', systemMonitor:'System monitor', fullscreen:'Fullscreen (F11)',
  calendar:'Calendar', agendaPreview:"Today's reminders", viewAgenda:'Open reminders →', openTimers:'Open timers →', timerPreview:'Active timer',
  timerIdle:'No timer running', noAgendaItems:'No reminders for this date.', comingUp:'Coming up', upcomingOnDate:'Selected day',
  countdown:'Countdown', stopwatch:'Stopwatch', minutes:'Minutes', seconds:'Seconds', start:'Start', resume:'Resume', pause:'Pause', reset:'Reset', lap:'Lap',
  timerFinished:'Countdown finished.', countdownPaused:'Countdown paused.', timerRunning:'Timer running',
  timersDescription:'Countdown and stopwatch in one section.', runsInTray:'Available while ORBIT runs',
  systemDescription:'Windows performance snapshot · approximate Task Manager values', systemDesktopOnly:'Live performance metrics require ORBIT on Windows.',
  systemFailed:'Could not read system usage.', gpuNote:'GPU uses Windows GPU Engine counters if supported; values can differ from Task Manager.',
});
Object.assign(i18n.ro, {
  agenda:'Agendă', timers:'Cronometre', system:'Sistem', systemMonitor:'Monitor sistem', fullscreen:'Ecran complet (F11)',
  calendar:'Calendar', agendaPreview:'Mementourile de azi', viewAgenda:'Deschide mementourile →', openTimers:'Deschide cronometrele →', timerPreview:'Cronometru activ',
  timerIdle:'Niciun cronometru activ', noAgendaItems:'Nu ai mementouri pentru această dată.', comingUp:'În curând', upcomingOnDate:'Ziua selectată',
  countdown:'Numărătoare inversă', stopwatch:'Cronometru', minutes:'Minute', seconds:'Secunde', start:'Pornește', resume:'Continuă', pause:'Pauză', reset:'Resetează', lap:'Tur',
  timerFinished:'Timpul a expirat.', countdownPaused:'Numărătoare în pauză.', timerRunning:'Cronometru activ',
  timersDescription:'Numărătoare inversă și cronometru în aceeași secțiune.', runsInTray:'Disponibil cât timp ORBIT rulează',
  systemDescription:'Date Windows aproximative, comparabile cu Task Manager', systemDesktopOnly:'Datele live necesită aplicația ORBIT pentru Windows.',
  systemFailed:'Nu s-a putut citi utilizarea sistemului.', gpuNote:'GPU folosește contoarele Windows, dacă sunt disponibile. Valorile pot diferi de Task Manager.',
});
// Version 3.0 voice and migration labels (English/Romanian).
Object.assign(i18n.en,{voiceListLoading:'Loading installed Windows voices…',offlineReady:'Installed Windows voice is available.',windowsLanguageMissing:'A matching Windows voice is not installed.',romanianVoiceMissing:'Install Romanian speech in Windows to use Romanian voice.',importBackup:'Import old backup',importConfirm:'Replace current local reminders and presets with this backup? Export your current data first.',importDone:'Backup imported successfully.'});
Object.assign(i18n.ro,{voiceListLoading:'Se încarcă vocile Windows…',offlineReady:'Vocea Windows instalată este disponibilă.',windowsLanguageMissing:'Nu există voce Windows pentru limba selectată.',romanianVoiceMissing:'Instalează o voce română în Windows.',importBackup:'Importă backup vechi',importConfirm:'Înlocuiești mementourile și profilurile locale actuale? Exportă-le înainte.',importDone:'Backup importat cu succes.'});
Object.assign(i18n.en,{voiceNote30:'Windows voices work offline. Romanian needs a Romanian speech voice installed in Windows. Voice pitch adjustment applies to browser voices; native voices use their default pitch.'});
Object.assign(i18n.ro,{voiceNote30:'Vocile Windows funcționează offline. Pentru română este necesară o voce instalată în Windows. Modificarea tonalității se aplică vocilor din browser.'});
const t = (key) => (i18n[settings.language] || i18n.en)[key] ?? i18n.en[key] ?? key;
const saveTasks = () => {localStorage.setItem(KEYS.tasks, JSON.stringify(tasks)); scheduleOrbitStateSave();};
const savePresets = () => {localStorage.setItem(KEYS.presets, JSON.stringify(presets)); scheduleOrbitStateSave();};
const saveSettings = () => {localStorage.setItem(KEYS.settings, JSON.stringify(settings)); scheduleOrbitStateSave();};
const pad = (n) => String(n).padStart(2, '0');
const localValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// Date picker keeps the existing taskDate value format for all reminder logic.
let calendarMonth = new Date();
function selectedReminderDate() {
  const value = $('taskDate').value;
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function chooseReminderDate(date) {
  const current = selectedReminderDate();
  current.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  const hourMinute = $('taskTime').value;
  if (hourMinute && /^\d{2}:\d{2}$/.test(hourMinute)) {
    const [h, m] = hourMinute.split(':').map(Number);
    current.setHours(h, m, 0, 0);
  }
  $('taskDate').value = localValue(current);
  calendarMonth = new Date(current.getFullYear(), current.getMonth(), 1);
  renderReminderCalendar();
}
function setReminderDateTime(value) {
  $('taskDate').value = value;
  const date = selectedReminderDate();
  $('taskTime').value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderReminderCalendar();
}
function renderReminderCalendar() {
  const area = $('calendarDays');
  if (!area) return;
  const locale = settings.language === 'ro' ? 'ro-RO' : 'en-GB';
  $('calendarTitle').textContent = calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdayHeader = $('calendarWeekdays'); weekdayHeader.replaceChildren();
  const monday = new Date(2024, 0, 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const label = document.createElement('span');
    label.textContent = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
    weekdayHeader.append(label);
  }
  area.replaceChildren();
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement('span'); filler.className = 'calendar-empty'; area.append(filler);
  }
  const selected = selectedReminderDate();
  const today = new Date();
  for (let n = 1; n <= count; n++) {
    const date = new Date(first.getFullYear(), first.getMonth(), n);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day';
    button.textContent = String(n);
    button.setAttribute('aria-label', date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }));
    if (date.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) { button.disabled = true; button.classList.add('past'); }
    if (date.toDateString() === selected.toDateString()) { button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); }
    if (date.toDateString() === today.toDateString()) button.classList.add('today');
    button.onclick = () => chooseReminderDate(date);
    area.append(button);
  }
  $('calendarPrev').disabled = calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() <= today.getMonth();
  $('dateSummary').textContent = selected.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  document.querySelectorAll('[data-quick-time]').forEach(btn => btn.classList.toggle('selected', btn.dataset.quickTime === $('taskTime').value));
  document.querySelectorAll('[data-quick-date]').forEach(btn => {
    const d = new Date(); d.setDate(d.getDate() + Number(btn.dataset.quickDate));
    btn.classList.toggle('selected', d.toDateString() === selected.toDateString());
  });
}
const fmt = (time) => new Date(time).toLocaleString(settings.language === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.add('hidden'), 4500); }
function applyAppearance() {
  const accent = accents.has(settings.accentColor) ? settings.accentColor : 'blue';
  const surface = surfaces.has(settings.surfaceStyle) ? settings.surfaceStyle : 'classic';
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.surface = surface;
  document.documentElement.dataset.density = settings.compactMode ? 'compact' : 'comfortable';
  document.querySelectorAll('[data-accent-choice], [data-header-accent]').forEach(button => {
    const on = (button.dataset.accentChoice || button.dataset.headerAccent) === accent;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
  });
  $('surfaceStyle').value = surface;
  $('compactMode').checked = !!settings.compactMode;
  $('showQuickWeb').checked = !!settings.showQuickWeb;
  $('quickWebPanel').classList.toggle('hidden', !settings.showQuickWeb);
}
async function openWebsite(url) {
  // Fixed HTTPS destinations. Never execute a URL as a local program.
  if (!url.startsWith('https://')) return;
  try {
    if (isTauri()) await openUrl(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('Cannot open website:', error);
    toast(`${t('browserFailed')} ${String(error)}`);
  }
}
function renderQuickWeb() {
  const area = $('quickWebLinks');
  area.replaceChildren();
  for (const item of WEB_LINKS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `web-link web-${item.id}`;
    const icon = document.createElement('span');
    icon.className = 'web-link-icon';
    icon.textContent = item.title[0];
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = item.title;
    button.append(icon, label);
    button.onclick = () => openWebsite(item.url);
    area.append(button);
  }
}
function applyLanguage() {
  document.documentElement.lang = settings.language;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-placeholder]')) el.placeholder = t(el.dataset.placeholder);
  $('languageSelect').value = settings.language;
  applyAppearance();
  $('topLanguage').textContent = settings.language === 'en' ? 'RO' : 'EN';
  document.title = 'ORBIT Alpha 1.0';
  renderReminderCalendar();
  renderVoiceEngine();
  renderQuickWeb();
  renderDays(); renderAll(); renderTimerUI(); renderMetrics(); showPage(activePage);
}
function setLanguage(lang) { settings.language = lang === 'ro' ? 'ro' : 'en'; settings.voiceURI=''; saveSettings(); applyLanguage(); populateVoices(); }
function showPage(page) {
  activePage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== `page-${page}`));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const name = t(page);
  $('breadcrumbPage').textContent = name;
  $('pageTitle').textContent = name;
  $('pageSubtitle').textContent = page === 'dashboard' ? t('yourDay') : '';
  if (page === 'timers') scheduleStopwatchFrame();
  if (page === 'system') pollMetrics();
  if (page === 'dashboard') {renderAgendaDashboard();renderOrbitWidgets();}
  if (page === 'notes') loadNotes().catch(err=>toast(String(err)));
}
function nextOccurrence(when, repeat, days = [], reference = Date.now()) {
  if (repeat === 'once') return when;
  const original = new Date(when);
  const current = new Date(reference);
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(current);
    candidate.setDate(current.getDate() + offset);
    candidate.setHours(original.getHours(), original.getMinutes(), 0, 0);
    const weekday = candidate.getDay();
    const matches = repeat === 'daily' || (repeat === 'weekdays' && weekday >= 1 && weekday <= 5) || (repeat === 'custom' && days.includes(weekday));
    if (matches && candidate.getTime() > reference) return candidate.getTime();
  }
  return reference + 86400000;
}
function repeatLabel(item) {
  if (item.repeat === 'daily') return t('everyDay');
  if (item.repeat === 'weekdays') return t('workdays');
  if (item.repeat === 'custom') return `${t('every')} ${(item.days || []).map(day => t(dayIds[day])).join(', ')}`;
  return t('onceLabel');
}
function renderDays() {
  $('days').replaceChildren();
  dayIds.forEach((day, idx) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = t(day); button.className = 'day' + (selectedDays.includes(idx) ? ' selected' : '');
    button.setAttribute('aria-pressed', selectedDays.includes(idx) ? 'true' : 'false');
    button.onclick = () => { selectedDays = selectedDays.includes(idx) ? selectedDays.filter(x => x !== idx) : [...selectedDays, idx]; renderDays(); };
    $('days').append(button);
  });
}
function renderTasks() {
  const list = $('taskList'); list.replaceChildren();
  $('taskCount').textContent = String(tasks.length);
  if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noReminders'); list.append(empty); return; }
  [...tasks].sort((a,b) => Number(!!a.done) - Number(!!b.done) || a.when - b.when).forEach(item => {
    const row = document.createElement('div'); row.className = 'row' + (item.done ? ' done' : '');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!item.done; checkbox.setAttribute('aria-label', t('complete'));
    checkbox.onchange = () => { if (item.repeat !== 'once' && checkbox.checked) { item.when = nextOccurrence(item.when, item.repeat, item.days, Math.max(Date.now(), item.when) + 1000); item.done = false; toast(t('saved')); } else { item.done = checkbox.checked; } saveTasks(); renderAll(); };
    const main = document.createElement('div'); main.className = 'rowmain';
    const title = document.createElement('div'); title.className = 'rowtitle'; title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'rowmeta'; meta.textContent = `${fmt(item.when)} · ${repeatLabel(item)}${!item.done && item.when < Date.now() ? ' · ' + t('overdue') : ''}`;
    main.append(title, meta);
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const edit = document.createElement('button'); edit.textContent = t('edit'); edit.onclick = () => { editTaskId = item.id; $('taskText').value = item.title; setReminderDateTime(localValue(new Date(item.when))); $('repeat').value = item.repeat; selectedDays = [...(item.days || [1,2,3,4,5])]; $('days').classList.toggle('hidden', item.repeat !== 'custom'); $('taskFormHeading').textContent = t('editReminder'); $('saveTaskBtn').textContent = t('saveChanges'); $('cancelTaskEdit').classList.remove('hidden'); renderDays(); showPage('reminders'); $('taskText').focus(); };
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = t('delete'); del.onclick = () => { if (!confirm(t('deleteConfirm'))) return; tasks = tasks.filter(x => x.id !== item.id); saveTasks(); if (editTaskId === item.id) resetTaskForm(); renderAll(); };
    actions.append(edit, del); row.append(checkbox, main, actions); list.append(row);
  });
}
function resetTaskForm() {
  editTaskId = null; $('taskForm').reset(); setReminderDateTime(localValue(new Date(Date.now() + 30 * 60000)));
  $('taskFormHeading').textContent = t('addReminder'); $('saveTaskBtn').textContent = t('addReminder'); $('cancelTaskEdit').classList.add('hidden'); selectedDays = [1,2,3,4,5]; $('days').classList.add('hidden'); renderDays();
}
function renderPresetSelections() {
  const list = $('selectedApps'); list.replaceChildren();
  if (!selectedPaths.length) { list.textContent = t('noApps'); return; }
  selectedPaths.forEach((path, idx) => {
    const row = document.createElement('div'); row.className = 'selected-app';
    const label = document.createElement('span'); label.textContent = path.split(/[\\/]/).at(-1).replace(/\.(exe|lnk)$/i, ''); label.title = path;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', t('delete')); remove.onclick = () => { selectedPaths.splice(idx, 1); renderPresetSelections(); };
    row.append(label, remove); list.append(row);
  });
}
function addPath(path) {
  if (typeof path !== 'string' || !/\.(exe|lnk)$/i.test(path)) return;
  if (selectedPaths.some(x => x.toLowerCase() === path.toLowerCase())) { toast(t('alreadyAdded')); return; }
  selectedPaths.push(path); renderPresetSelections();
}
function renderInstalled() {
  const list = $('installedList'); list.replaceChildren();
  if (!isTauri()) { list.textContent = t('browseUnsupported'); return; }
  if (!installedApps.length) { list.textContent = t('noInstalled'); return; }
  const query = $('appSearch').value.trim().toLowerCase();
  const apps = installedApps.filter(app => app.name.toLowerCase().includes(query)).slice(0, 55);
  if (!apps.length) { list.textContent = t('noInstalled'); return; }
  apps.forEach(app => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'installed-row'; const label = document.createElement('span'); label.textContent = app.name; btn.title = app.path; const plus = document.createElement('small'); plus.textContent = '+ ' + (settings.language === 'ro' ? 'Adaugă' : 'Add'); btn.append(label, plus); btn.onclick = () => { addPath(app.path); }; list.append(btn); });
}
function renderPresets() {
  const list = $('presetList'); list.replaceChildren(); $('presetCount').textContent = String(presets.length);
  if (!presets.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noPresets'); list.append(empty); return; }
  presets.forEach((item, idx) => {
    const preset = document.createElement('div'); preset.className = 'preset'; const head = document.createElement('div'); head.className = 'preset-head';
    const name = document.createElement('strong'); name.textContent = item.name; const actions = document.createElement('div'); actions.className = 'actions';
    const launch = document.createElement('button'); launch.className = 'primary'; launch.textContent = t('launch'); launch.onclick = async () => launchPreset(item);
    const edit = document.createElement('button'); edit.textContent = t('edit'); edit.onclick = () => { editPresetIndex = idx; selectedPaths = [...(item.paths || [])]; $('presetName').value = item.name; $('presetFormHeading').textContent = t('editPreset'); $('savePresetBtn').textContent = t('saveChanges'); $('cancelPresetEdit').classList.remove('hidden'); renderPresetSelections(); showPage('presets'); $('presetName').focus(); };
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = t('delete'); del.onclick = () => { if (!confirm(t('deleteConfirm'))) return; presets.splice(idx,1); savePresets(); resetPresetForm(); renderAll(); };
    actions.append(launch,edit,del); head.append(name,actions);
    const info = document.createElement('div'); info.className = 'preset-apps'; info.textContent = (item.paths || []).map(p => p.split(/[\\/]/).at(-1)).join(' · ') || t('noApps');
    preset.append(head,info);list.append(preset);
  });
}
function resetPresetForm() { editPresetIndex = null; selectedPaths = []; $('presetForm').reset(); $('presetFormHeading').textContent = t('createPreset'); $('savePresetBtn').textContent = t('savePreset'); $('cancelPresetEdit').classList.add('hidden'); renderPresetSelections(); }
async function launchPreset(item) {
  if (!isTauri()) { toast(t('browseUnsupported')); return; }
  const paths = [...new Set(item.paths || [])];
  toast(t('launching'));
  let launched = 0; const errors = [];
  for (const path of paths) { try { await invoke('launch_app', { path }); launched++; } catch (error) { errors.push(`${path.split(/[\\/]/).at(-1)}: ${String(error)}`); } }
  toast(`${t('launched')} ${launched}/${paths.length} ${t('apps')}.${errors.length ? ' ' + errors.join('; ').slice(0, 280) : ''}`);
}
function renderDashboard() {
  const h=new Date().getHours();
  const greeting=settings.language==='ro'?(h<12?'Bună dimineața':h<18?'Bună ziua':'Bună seara'):(h<12?'Good morning':h<18?'Good afternoon':'Good evening');
  $('greeting').textContent = `${greeting}${orbitUserName ? ', ' + orbitUserName : ''}.`;
  const next = tasks.filter(x => !x.done).sort((a,b) => a.when - b.when)[0];
  $('nextHint').textContent = next ? `${t('nextReminder')}: ${fmt(next.when)}` : t('noTasks');
  const target = $('dashboardNext'); target.replaceChildren();
  if (next) { const heading = document.createElement('div'); heading.className = 'rowtitle'; heading.textContent = next.title; const sub = document.createElement('div'); sub.className = 'rowmeta'; sub.textContent = `${fmt(next.when)} · ${repeatLabel(next)}`; target.append(heading,sub); } else target.textContent = t('upcomingNone');
  const quick = $('dashboardPresets'); quick.replaceChildren();
  if (!presets.length) {
    const empty=document.createElement('div'); empty.className='quick-preset-empty';
    const hint=document.createElement('span');hint.textContent='No presets yet. Create a quick launch for your favorite apps.';
    const create=document.createElement('button');create.type='button';create.textContent='＋ Create preset';create.onclick=()=>showPage('presets');
    empty.append(hint,create);quick.append(empty);
  } else presets.slice(0,5).forEach(p => { const b = document.createElement('button'); b.textContent = `▷ ${p.name}`; b.onclick = () => launchPreset(p); quick.append(b); });
  renderWeatherMini();
  renderAgendaDashboard();
}
function weatherLabel(code) {
  if (code === 0) return t('weatherClear');
  if ([1,2].includes(code)) return t('weatherMainlyClear');
  if (code === 3) return t('weatherCloudy');
  if ([45,48].includes(code)) return t('weatherFog');
  if ([51,53,55,56,57].includes(code)) return t('weatherDrizzle');
  if ([61,63,65,66,67].includes(code)) return t('weatherRain');
  if ([71,73,75,77].includes(code)) return t('weatherSnow');
  if ([80,81,82,85,86].includes(code)) return t('weatherShowers');
  if ([95,96,99].includes(code)) return t('weatherStorm');
  return t('weatherUnknown');
}
function weatherSymbol(code) {
  if (code === 0) return '☀'; if ([1,2].includes(code)) return '⛅'; if (code === 3) return '☁';
  if ([45,48].includes(code)) return '≋'; if ([71,73,75,77,85,86].includes(code)) return '❄';
  if ([95,96,99].includes(code)) return 'ϟ'; return '☂';
}
function renderWeatherMini() {
  const el = $('dashboardWeather'); el.replaceChildren();
  if (!weatherData || !settings.city) { el.textContent = settings.city ? t('loadingWeather') : t('noWeather'); return; }
  const symbol = document.createElement('span'); symbol.className = 'weather-symbol'; symbol.textContent = weatherSymbol(weatherData.current.weather_code);
  const temp = document.createElement('span'); temp.className = 'temp'; temp.textContent = `${Math.round(weatherData.current.temperature_2m)}°`;
  const info = document.createElement('div'); const name = document.createElement('div'); name.className = 'weather-place'; name.textContent = settings.city.name; const desc = document.createElement('div'); desc.className = 'weather-extra'; desc.textContent = weatherLabel(weatherData.current.weather_code); info.append(name,desc);el.append(symbol,temp,info);
}
function renderWeather() {
  const details = $('weatherDetails'); const forecast = $('weatherForecast'); details.replaceChildren(); forecast.replaceChildren();
  if (!settings.city || !weatherData) { details.textContent = settings.city ? t('loadingWeather') : t('chooseWeather'); return; }
  const current = weatherData.current;
  const main = document.createElement('div'); main.className = 'weather-main';
  const glyph = document.createElement('span'); glyph.className = 'weather-symbol'; glyph.textContent = weatherSymbol(current.weather_code);
  const degree = document.createElement('div'); degree.className = 'temp'; degree.textContent = `${Math.round(current.temperature_2m)}°C`;
  const location = document.createElement('div'); const heading = document.createElement('div'); heading.className = 'weather-place'; heading.textContent = `${settings.city.name}, ${settings.city.country || ''}`;
  const summary = document.createElement('div'); summary.className = 'weather-extra'; summary.textContent = weatherLabel(current.weather_code);
  location.append(heading,summary);main.append(glyph,degree,location);details.append(main);
  const extra = document.createElement('div');extra.className = 'weather-extra';extra.textContent = `${t('feelsLike')}: ${Math.round(current.apparent_temperature)}°C   ·   ${t('humidity')}: ${current.relative_humidity_2m}%   ·   ${t('wind')}: ${Math.round(current.wind_speed_10m)} km/h`;details.append(extra);
  const days = weatherData.daily;
  if (days && Array.isArray(days.time)) days.time.slice(0,3).forEach((date, i) => { const card = document.createElement('div');card.className='forecast-day';const day = new Date(`${date}T12:00:00`); const label = document.createElement('div'); label.textContent = day.toLocaleDateString(settings.language === 'ro' ? 'ro-RO' : 'en-GB',{ weekday:'short',day:'numeric' });const numbers = document.createElement('strong');numbers.textContent = `${Math.round(days.temperature_2m_max[i])}° / ${Math.round(days.temperature_2m_min[i])}°`;const description = document.createElement('div'); description.textContent = weatherLabel(days.weather_code[i]); card.append(label,numbers,description); forecast.append(card); });
}
async function fetchJSON(url) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try { const res = await fetch(url, { signal: controller.signal }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); } finally { clearTimeout(timeout); }
}
async function searchCities(query) {
  const target = $('cityResults'); target.replaceChildren(); target.textContent = t('lookingCity');
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${settings.language}&format=json`;
    const result = await fetchJSON(url);
    target.replaceChildren();
    if (!result.results?.length) { target.textContent = t('noCity'); return; }
    result.results.forEach(city => {
      const button = document.createElement('button');button.type='button';button.className='city-option';button.textContent = `${city.name}, ${[city.admin1,city.country].filter(Boolean).join(', ')}`;
      button.onclick = () => { settings.city = { name: city.name, country: city.country, latitude: city.latitude, longitude: city.longitude }; weatherData=null; saveSettings(); target.replaceChildren(); $('cityInput').value=city.name; toast(t('citySelected')); renderWeather();renderWeatherMini();refreshWeather(); };
      target.append(button);
    });
  } catch (e) { console.error('City search:',e); target.textContent = t('weatherFailed'); }
}
let weatherRequestedAt = 0;
let weatherLoading = false;
async function refreshWeather() {
  if (!settings.city) { showPage('weather'); $('cityInput').focus(); return; }
  if (weatherLoading) return;
  weatherLoading = true;
  const city = settings.city;
  $('weatherDetails').textContent = t('loadingWeather');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(city.latitude)}&longitude=${encodeURIComponent(city.longitude)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
  try {
    const result = await fetchJSON(url);
    // Ignore a result if the user switched to another location before it returned.
    if (!settings.city || settings.city.latitude !== city.latitude || settings.city.longitude !== city.longitude) return;
    if (!result.current) throw new Error('Weather data unavailable');
    weatherData = result; weatherRequestedAt = Date.now(); renderWeather();renderWeatherMini();
  } catch(e) { console.error('Weather:',e); weatherRequestedAt = Date.now() - 13 * 60 * 1000; $('weatherDetails').textContent = t('weatherFailed'); renderWeatherMini(); }
  finally { weatherLoading = false; }
}
function renderAll() { renderTasks();renderPresets();renderDashboard();renderWeather();renderPresetSelections(); }
async function ensureNotifyPermission() {
  try {
    if (isTauri()) { const ok = await isPermissionGranted(); return ok || (await requestPermission()) === 'granted'; }
    if ('Notification' in window) return Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  } catch(e) { console.warn('Notification permission error',e); }
  return false;
}
async function notify(title, body) {
  try {
    if (isTauri()) { if (await isPermissionGranted()) await sendNotification({ title, body }); }
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch(e) { console.warn('Notification error',e); }
}
let availableVoices=[],nativeVoices=[];
function populateVoices() {
  if (!('speechSynthesis' in window)) return;
  const select=$('voiceSelect'),previous=select.value || settings.voiceURI;
  availableVoices=speechSynthesis.getVoices();select.replaceChildren();
  const defaultOption=document.createElement('option'); defaultOption.value='';defaultOption.textContent=t('noVoices');select.append(defaultOption);
  nativeVoices.slice().sort((a,b)=>a.language.localeCompare(b.language)||a.name.localeCompare(b.name)).forEach(v=>{
    const opt=document.createElement('option');opt.value='native:'+v.name;opt.textContent=`Windows · ${v.name} (${v.language})`;select.append(opt);
  });
  availableVoices.slice().sort((a,b)=>a.lang.localeCompare(b.lang)||a.name.localeCompare(b.name)).forEach(v=>{
    const opt=document.createElement('option');opt.value=v.voiceURI;opt.textContent=`WebView · ${v.name} (${v.lang})`;select.append(opt);
  });
  select.value=[...select.options].some(v=>v.value===previous)?previous:'';
  renderVoiceEngine();
}
function normalizedVolume(){const v=Number(settings.voiceVolume);return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0.35;}
function stopAudio(){
  if('speechSynthesis' in window) speechSynthesis.cancel();
  if(isTauri())invoke('tts_stop').catch(()=>{});
  document.body.classList.remove('orbit-speaking');
}
function speakBrowser(text) {
  return new Promise((resolve,reject)=>{
    if(!('speechSynthesis' in window)){reject(Error('WebView2 speech synthesis not available.'));return;}
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.rate=Number(settings.rate);utterance.pitch=Number(settings.pitch);utterance.volume=normalizedVolume();
    const lang=settings.language==='ro'?'ro':'en';
    const voices=availableVoices.filter(v=>v.lang.toLowerCase().startsWith(lang));
    const selected=voices.find(v=>v.voiceURI===settings.voiceURI);
    const chosen=selected||voices.find(v=>/natural|neural|online/i.test(v.name))||voices[0];
    if(settings.language==='ro'&&!chosen){reject(Error('No Romanian voice installed in Windows or WebView2.'));return;}
    if(chosen){utterance.voice=chosen;utterance.lang=chosen.lang;}else utterance.lang='en-US';
    let finished=false;
    const timer=setTimeout(()=>{if(!finished){finished=true;reject(Error('Speech output did not start.'));}},4000);
    utterance.onstart=()=>{speechPlaybackActive=true;clearTimeout(timer);logAssistant('tts:start','Browser speech started');updateSpeechState('speaking','Reading response');};
    utterance.onend=()=>{speechPlaybackActive=false;finished=true;clearTimeout(timer);logAssistant('tts:done','Browser speech finished');updateSpeechState(settings.wakeEnabled?'armed':'idle');resolve(true);};
    utterance.onerror=e=>{speechPlaybackActive=false;updateSpeechState('error',e.error||'Speech failed');finished=true;clearTimeout(timer);logAssistant('tts:error',e.error||'Unknown Web Speech error');reject(Error('Web speech error: '+(e.error||'unknown')));};
    speechSynthesis.cancel();speechSynthesis.speak(utterance);
  });
}
function speakSystem(text) {
  if(normalizedVolume()<=0)return Promise.resolve(false);
  logAssistant('response',text);
  assistantFeedback(text);
  const language=settings.language==='ro'?'ro-RO':'en-US';
  // Keep the user-selected browser voice if configured. Otherwise native SAPI is more reliable in WebView2.
  const preferredBrowser=!!settings.voiceURI && availableVoices.some(v=>v.voiceURI===settings.voiceURI);
  const preferredNative=settings.voiceURI?.startsWith('native:')?settings.voiceURI.slice(7):'';
  if(isTauri()&&!preferredBrowser){
    return invoke('tts_speak',{text,locale:language,volume:Math.round(normalizedVolume()*100),rate:Number(settings.rate),voice:preferredNative}).catch(async error=>{
      logAssistant('tts:native-error',String(error));
      try {return await speakBrowser(text);}catch(fallback){throw Error(String(error.message||error)+'; browser fallback: '+String(fallback.message||fallback));}
    });
  }
  return speakBrowser(text);
}
async function speak(text) {
  try { await speakSystem(text); }
  catch(error){const message='Voice unavailable: '+String(error.message||error);logAssistant('tts:error',message);toast(message);updateSpeechState('error',message);}
}
function renderVoiceEngine() {
  $('voiceEngine').value='system';
  const lang=settings.language==='ro'?'ro':'en';
  const match=availableVoices.some(v=>v.lang.toLowerCase().startsWith(lang))||nativeVoices.some(v=>v.language.toLowerCase().startsWith(lang));
  $('neuralStatus').textContent=(availableVoices.length+nativeVoices.length===0)?t('voiceListLoading'):(match?t('offlineReady'):t('windowsLanguageMissing'));
  $('neuralStatus').classList.toggle('ready',match);
}
function dueCheck() {
  let changed=false;const now=Date.now();
  for (const item of tasks) {
    if (item.done) { if (item.repeat !== 'once' && item.when<=now) { item.when=nextOccurrence(item.when,item.repeat,item.days||[],now);item.done=false;changed=true; }continue; }
    if (item.when<=now) {
      notify('Orbit',item.title);
      if (settings.speakReminders) speak(`${t('reminderPrefix')} ${item.title}`);
      if (item.repeat==='once') item.done=true;
      else item.when=nextOccurrence(item.when,item.repeat,item.days||[],now);
      changed=true;
    }
  }
  if(changed){saveTasks();renderAll();}
}
function setLoggedIn() {
  $('appView').classList.remove('hidden');
  $('userAvatar').textContent=orbitUserName ? orbitUserName.slice(0,1).toUpperCase() : '◉';
  $('userAvatar').textContent=orbitUserName ? orbitUserName.slice(0,1).toUpperCase() : '◉';
  applyLanguage();showPage('dashboard');renderAll();
  dueCheck();if(settings.city&&!weatherData)refreshWeather();
  if(isTauri())invoke('set_close_to_tray',{enabled:!!settings.closeToTray}).catch(console.warn);
}
// Lovable-inspired click ripples. Event delegation also covers dynamically created preset/web buttons.
document.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (event.button !== 0) return;
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button || button.disabled || button.classList.contains('color-choice') || button.classList.contains('header-accent')) return;
  const bounds = button.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'orbit27-ripple';
  ripple.style.left = `${event.clientX - bounds.left}px`;
  ripple.style.top = `${event.clientY - bounds.top}px`;
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 800);
});

$('topLanguage').onclick = () => setLanguage(settings.language==='en'?'ro':'en');
document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick=()=>showPage(btn.dataset.page));
document.querySelectorAll('[data-go]').forEach(btn=>btn.onclick=()=>showPage(btn.dataset.go));
$('dashAdd').onclick=()=>{showPage('reminders');$('taskText').focus();};
$('repeat').onchange=()=>$('days').classList.toggle('hidden',$('repeat').value!=='custom');
$('calendarPrev').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderReminderCalendar(); };
$('calendarNext').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderReminderCalendar(); };
document.querySelectorAll('[data-quick-date]').forEach(button => button.onclick = () => {
  const day = new Date(); day.setDate(day.getDate() + Number(button.dataset.quickDate)); chooseReminderDate(day);
});
function updateReminderTime(value) {
  const selected = selectedReminderDate();
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return;
  selected.setHours(hours, minutes, 0, 0);
  const now = new Date();
  if (selected.getTime() <= now.getTime() && selected.toDateString() === now.toDateString()) {
    selected.setDate(selected.getDate() + 1);
    toast(t('quickTimePast'));
  }
  setReminderDateTime(localValue(selected));
}
document.querySelectorAll('[data-quick-time]').forEach(button => button.onclick = () => updateReminderTime(button.dataset.quickTime));
document.querySelectorAll('[data-time-offset]').forEach(button => button.onclick = () => {
  const selected = new Date(Date.now() + Number(button.dataset.timeOffset) * 60000);
  selected.setSeconds(0, 0);
  setReminderDateTime(localValue(selected));
});
const shiftTime = (minutes) => {
  const date = selectedReminderDate();
  date.setMinutes(date.getMinutes() + minutes);
  setReminderDateTime(localValue(date));
};
$('timeMinus').onclick = () => shiftTime(-15);
$('timePlus').onclick = () => shiftTime(15);
$('taskTime').onchange = () => {
  const d = selectedReminderDate();
  const [hours, minutes] = $('taskTime').value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
  d.setHours(hours, minutes, 0, 0);
  $('taskDate').value = localValue(d);
  renderReminderCalendar();
};
$('taskForm').onsubmit=e=>{
  e.preventDefault();const title=$('taskText').value.trim();const when=new Date($('taskDate').value).getTime();const repeat=$('repeat').value;
  if(!title||!Number.isFinite(when))return;
  if(when<=Date.now()&&!editTaskId){toast(t('pastDate'));return;}
  if(repeat==='custom'&&!selectedDays.length){toast(t('setDay'));return;}
  if(editTaskId){const item=tasks.find(x=>x.id===editTaskId);if(item){Object.assign(item,{title,when,repeat,days:repeat==='custom'?[...selectedDays]:[],done:false});}}
  else tasks.push({id:createId(),title,when,repeat,days:repeat==='custom'?[...selectedDays]:[],done:false});
  saveTasks();resetTaskForm();renderAll();toast(t('taskSaved'));
};
$('cancelTaskEdit').onclick=resetTaskForm;
$('clearDone').onclick=()=>{if(!tasks.some(t=>t.done))return;if(!confirm(t('clearConfirm')))return;tasks=tasks.filter(t=>!t.done);saveTasks();renderAll();};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({version:'3.0',tasks,presets,settings:{language:settings.language,city:settings.city}},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`orbit-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
$('importBtn').onclick=()=>{const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.onchange=async()=>{
 const file=picker.files?.[0];if(!file)return;
 try{if(file.size>2_000_000)throw Error('Backup is too large.');const raw=JSON.parse(await file.text());
 if(!raw||!Array.isArray(raw.tasks)||!Array.isArray(raw.presets))throw Error('Not an ORBIT backup.');
 const cleanTasks=raw.tasks.slice(0,5000).filter(item=>item&&typeof item.title==='string'&&Number.isFinite(Number(item.when))).map(item=>({id:String(item.id||createId()),title:item.title.slice(0,300),when:Number(item.when),repeat:['once','daily','weekdays','custom'].includes(item.repeat)?item.repeat:'once',days:Array.isArray(item.days)?item.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6):[],done:!!item.done}));
 const cleanPresets=raw.presets.slice(0,150).filter(p=>p&&typeof p.name==='string'&&Array.isArray(p.paths)).map(p=>({name:p.name.slice(0,100),paths:p.paths.filter(v=>typeof v==='string'&&/\.(exe|lnk)$/i.test(v)).slice(0,20)}));
 if(!confirm(t('importConfirm')))return;
 tasks=cleanTasks;presets=cleanPresets;saveTasks();savePresets();renderAll();toast(t('importDone'));
 }catch(err){toast(String(err));}};picker.click();};
$('notifyBtn').onclick=async()=>{const ok=await ensureNotifyPermission();$('notifyBtn').textContent=ok?t('notificationsEnabled'):t('enableNotifications');toast(ok?t('notificationActive'):t('permissionNeeded'));};
$('presetForm').onsubmit=e=>{e.preventDefault();const name=$('presetName').value.trim();if(!name)return;if(!selectedPaths.length){toast(t('presetRequired'));return;}const item={name,paths:[...selectedPaths]};if(editPresetIndex===null)presets.push(item);else presets[editPresetIndex]=item;savePresets();resetPresetForm();renderAll();toast(t('saved'));};
$('cancelPresetEdit').onclick=resetPresetForm;
$('browseAppBtn').onclick=async()=>{if(!isTauri()){toast(t('browseUnsupported'));return;}try{const result=await open({multiple:true,directory:false,title:t('browseApps'),filters:[{name:'Windows applications and shortcuts',extensions:['exe','lnk']}]});if(!result)return;for(const path of Array.isArray(result)?result:[result])addPath(path);}catch(e){toast(String(e));}};
$('refreshInstalledBtn').onclick=async()=>{if(!isTauri()){toast(t('browseUnsupported'));return;}$('installedList').textContent=t('loadingApps');try{installedApps=await invoke('list_installed_apps');renderInstalled();}catch(e){console.error(e);$('installedList').textContent=String(e);}};
$('appSearch').oninput=renderInstalled;
$('googleSearchForm').onsubmit = e => {
  e.preventDefault();
  const query = $('googleSearchInput').value.trim();
  if (!query) { toast(t('emptySearch')); return; }
  openWebsite(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
};
$('cityForm').onsubmit=e=>{e.preventDefault();const name=$('cityInput').value.trim();if(name.length<2){toast(t('emptyCity'));return;}searchCities(name);};
$('refreshWeather').onclick=()=>refreshWeather();
$('languageSelect').onchange=e=>setLanguage(e.target.value);
$('voiceEngine').onchange=e=>{settings.voiceEngine='system';saveSettings();renderVoiceEngine();};
$('voiceSelect').onchange=e=>{settings.voiceURI=e.target.value;saveSettings();};
function updateSliderTrack(input){
 const min=Number(input.min)||0, max=Number(input.max)||100;
 const pct=Math.max(0,Math.min(100,((Number(input.value)-min)/(max-min||1))*100));
 input.parentElement?.style.setProperty('--range-pct',pct+'%');
}
function updateAllSliderTracks(){['voiceSpeed','voicePitch','voiceVolume'].forEach(id=>updateSliderTrack($(id)));}
let sliderSaveTimer=0;const scheduleSliderSave=()=>{clearTimeout(sliderSaveTimer);sliderSaveTimer=setTimeout(saveSettings,140);};
$('voiceVolume').oninput=e=>{ updateSliderTrack(e.target); settings.voiceVolume = Number(e.target.value) / 100; $('voiceVolumeValue').textContent = `${Math.round(normalizedVolume()*100)}%`; scheduleSliderSave(); };
$('voiceVolume').onchange=saveSettings;
document.querySelectorAll('[data-accent-choice], [data-header-accent]').forEach(button => button.onclick = () => { settings.accentColor = button.dataset.accentChoice || button.dataset.headerAccent; saveSettings(); applyAppearance(); });
$('surfaceStyle').onchange = e => { settings.surfaceStyle = e.target.value; saveSettings(); applyAppearance(); };
$('compactMode').onchange = e => { settings.compactMode = e.target.checked; saveSettings(); applyAppearance(); };
$('showQuickWeb').onchange = e => { settings.showQuickWeb = e.target.checked; saveSettings(); applyAppearance(); };
$('resetAppearance').onclick = () => { Object.assign(settings, {accentColor:defaults.accentColor, surfaceStyle:defaults.surfaceStyle, compactMode:false}); saveSettings(); applyAppearance(); };
$('voiceSpeed').oninput=e=>{updateSliderTrack(e.target);settings.rate=Number(e.target.value);$('rateValue').textContent=settings.rate.toFixed(2)+'×';scheduleSliderSave();};
$('voicePitch').oninput=e=>{updateSliderTrack(e.target);settings.pitch=Number(e.target.value);$('pitchValue').textContent=settings.pitch.toFixed(2);scheduleSliderSave();};
$('voiceSpeed').onchange=saveSettings; $('voicePitch').onchange=saveSettings;
$('speakReminders').onchange=e=>{settings.speakReminders=e.target.checked;saveSettings();};
$('speakBtn').onclick=$('testVoice').onclick=()=>speak(t('testPhrase'));
$('reloadVoices').onclick=populateVoices;
$('startupToggle').onchange=async(e)=>{const checked=e.target.checked;if(!isTauri()){e.target.checked=false;toast(t('startupUnavailable'));return;}try{if(checked)await enableAutostart();else await disableAutostart();e.target.checked=await autostartIsEnabled();}catch(err){e.target.checked=!checked;toast(`${t('startupFailed')} ${String(err)}`);}};
$('minimizeTrayToggle').onchange=async(e)=>{const checked=e.target.checked;if(!isTauri()){e.target.checked=false;toast(t('trayUnavailable'));return;}try{await invoke('set_close_to_tray',{enabled:checked});settings.closeToTray=checked;saveSettings();}catch(err){e.target.checked=!checked;toast(String(err));}};

// ORBIT 2.8.1 — use the existing Reminders date picker; dashboard shows a read-only today list.
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
const sameDate = (a,b) => dateKey(a) === dateKey(b);
function agendaRow(item) {
  const node = document.createElement('div'); node.className='agenda-entry';
  const pip=document.createElement('span');pip.className='agenda-pip';
  const content=document.createElement('div');const title=document.createElement('strong');title.textContent=item.title;
  const time=document.createElement('small');time.textContent=fmt(item.when);
  content.append(title,time); node.append(pip,content); return node;
}
function renderAgendaDashboard() {
  const area=$('agendaDashboard');if(!area)return;area.replaceChildren();
  const now=new Date();const today=tasks.filter(x=>!x.done&&sameDate(new Date(x.when),now)).sort((a,b)=>a.when-b.when);
  if(!today.length){area.textContent=t('noAgendaItems');area.classList.add('muted');return;}
  area.classList.remove('muted');today.slice(0,3).forEach(x=>area.append(agendaRow(x)));
  if(today.length>3){const more=document.createElement('div');more.className='small muted';more.textContent=`+${today.length-3}`;area.append(more);}
}
// Timers persist timestamps so they remain accurate when the window is minimized.
const timerDefaults={countdown:{duration:300000,remaining:300000,endAt:null,running:false,completed:false},stopwatch:{elapsed:0,startAt:null,running:false,laps:[]},tab:'countdown'};
function readTimerState(){const raw=read(KEYS.timers,null);if(!raw||typeof raw!=='object')return structuredClone(timerDefaults);
 const c=raw.countdown||{},s=raw.stopwatch||{};
 return {tab:raw.tab==='stopwatch'?'stopwatch':'countdown',countdown:{duration:Math.max(0,Math.min(3599999000,Number(c.duration)||300000)),remaining:Math.max(0,Math.min(3599999000,Number(c.remaining)||0)),endAt:Number.isFinite(c.endAt)?c.endAt:null,running:!!c.running,completed:!!c.completed},stopwatch:{elapsed:Math.max(0,Number(s.elapsed)||0),startAt:Number.isFinite(s.startAt)?s.startAt:null,running:!!s.running,laps:Array.isArray(s.laps)?s.laps.slice(-30).filter(n=>Number.isFinite(n)&&n>=0):[]}};}
let timerState=readTimerState();let timerSaveAt=0;
const saveTimers=()=>{localStorage.setItem(KEYS.timers,JSON.stringify(timerState));scheduleOrbitStateSave();};
const countdownRemaining=()=>timerState.countdown.running&&timerState.countdown.endAt!==null?Math.max(0,timerState.countdown.endAt-Date.now()):timerState.countdown.remaining;
// Wall clock time persists across app restarts; the monotonic clock prevents
// stutter when the Windows clock is synchronized during an active session.
let stopwatchMonoStart=null, stopwatchFrame=null;
const elapsedStopwatch=()=>timerState.stopwatch.elapsed+(timerState.stopwatch.running&&timerState.stopwatch.startAt!==null?Math.max(0,stopwatchMonoStart===null?Date.now()-timerState.stopwatch.startAt:performance.now()-stopwatchMonoStart):0);
const timerFormat=(millis,decimals=false)=>{const n=Math.max(0,Math.floor(millis));const h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60;return `${h?pad(h)+':':''}${pad(m)}:${pad(s)}${decimals?'.'+pad(Math.floor(n%1000/10)):''}`;};
const setText=(id,value)=>{const el=$(id);if(el && el.textContent!==value)el.textContent=value;};
let countdownAlerted=false;
function timerCheckCompletion(){const c=timerState.countdown;if(c.running&&countdownRemaining()<=0){c.running=false;c.endAt=null;c.remaining=0;c.completed=true;saveTimers();if(!countdownAlerted){countdownAlerted=true;toast(t('timerFinished'));notify('ORBIT',t('timerFinished'));}renderTimerUI();}}
function paintTimerDisplays(){
 if($('appView').classList.contains('hidden'))return;
 timerCheckCompletion();const c=timerState.countdown,s=timerState.stopwatch;
 if(activePage==='timers'){
   if(timerState.tab==='countdown')setText('countdownDisplay',timerFormat(countdownRemaining()));
   if(timerState.tab==='stopwatch')setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
 }
 if(activePage==='dashboard'){
   const active=c.running||s.running;
   const display=c.running?timerFormat(countdownRemaining()):s.running?timerFormat(elapsedStopwatch(),true):'—';
   setText('dashboardTimerDisplay',display);
   setText('dashboardTimerState',active?(c.running?t('countdown'):t('stopwatch')):t('timerIdle'));
 }
}
function scheduleStopwatchFrame(){
 if(stopwatchFrame!==null || !timerState.stopwatch.running || activePage!=='timers' || timerState.tab!=='stopwatch'|| document.hidden)return;
 const frame=()=>{stopwatchFrame=null;
   if(!timerState.stopwatch.running || activePage!=='timers'||timerState.tab!=='stopwatch'|| document.hidden)return;
   setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
   stopwatchFrame=requestAnimationFrame(frame);
 };
 stopwatchFrame=requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){paintTimerDisplays();scheduleStopwatchFrame();}});
function renderTimerUI(){
 const c=timerState.countdown,s=timerState.stopwatch;
 $('countdownTab').classList.toggle('active',timerState.tab==='countdown');$('stopwatchTab').classList.toggle('active',timerState.tab==='stopwatch');
 $('countdownTab').setAttribute('aria-selected',String(timerState.tab==='countdown'));$('stopwatchTab').setAttribute('aria-selected',String(timerState.tab==='stopwatch'));
 $('countdownPane').classList.toggle('hidden',timerState.tab!=='countdown');$('stopwatchPane').classList.toggle('hidden',timerState.tab!=='stopwatch');
 setText('countdownDisplay',timerFormat(countdownRemaining()));setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
 setText('countdownStart',c.running?t('timerRunning'):(c.remaining<c.duration&&c.remaining>0?t('resume'):t('start')));
 $('countdownStart').disabled=c.running;$('countdownPause').disabled=!c.running;
 $('countdownMinutes').disabled=c.running;$('countdownSeconds').disabled=c.running;
 setText('stopwatchStart',s.running?t('timerRunning'):(s.elapsed>0?t('resume'):t('start')));
 $('stopwatchStart').disabled=s.running;$('stopwatchPause').disabled=!s.running;$('stopwatchLap').disabled=!s.running;
 setText('countdownStatus',c.completed?t('timerFinished'):(c.running?t('timerRunning'):''));
 const active=c.running||s.running;setText('dashboardTimerDisplay',active?(c.running?timerFormat(countdownRemaining()):timerFormat(elapsedStopwatch(),true)):'—');
 setText('dashboardTimerState',active?(c.running?t('countdown'):t('stopwatch')):t('timerIdle'));
 const list=$('stopwatchLaps');if(list.childElementCount!==s.laps.length){list.replaceChildren();s.laps.forEach((value,index)=>{let li=document.createElement('li');li.textContent=`${t('lap')} ${index+1} — ${timerFormat(value,true)}`;list.append(li);});}
 scheduleStopwatchFrame();
}
function setTimerTab(tab){timerState.tab=tab;saveTimers();renderTimerUI();}
$('countdownTab').onclick=()=>setTimerTab('countdown');$('stopwatchTab').onclick=()=>setTimerTab('stopwatch');
function setCountdownInput(){let minutes=Number($('countdownMinutes').value), seconds=Number($('countdownSeconds').value);if(!Number.isFinite(minutes)||!Number.isFinite(seconds)||minutes<0||seconds<0)return;
 minutes=Math.min(999,Math.floor(minutes));seconds=Math.min(59,Math.floor(seconds));timerState.countdown.duration=(minutes*60+seconds)*1000;timerState.countdown.remaining=timerState.countdown.duration;timerState.countdown.completed=false;countdownAlerted=false;saveTimers();renderTimerUI();}
$('countdownMinutes').onchange=setCountdownInput;$('countdownSeconds').onchange=setCountdownInput;
document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{if(timerState.countdown.running)return;$('countdownMinutes').value=b.dataset.minutes;$('countdownSeconds').value='0';setCountdownInput();});
$('countdownStart').onclick=()=>{const c=timerState.countdown;if(c.running)return;if(c.remaining<=0){setCountdownInput();}if(c.remaining<=0){toast(t('minutes')+'?');return;}c.endAt=Date.now()+c.remaining;c.running=true;c.completed=false;countdownAlerted=false;saveTimers();renderTimerUI();};
$('countdownPause').onclick=()=>{const c=timerState.countdown;c.remaining=countdownRemaining();c.running=false;c.endAt=null;saveTimers();renderTimerUI();};
$('countdownReset').onclick=()=>{let c=timerState.countdown;c.running=false;c.endAt=null;c.completed=false;countdownAlerted=false;setCountdownInput();renderTimerUI();};
$('stopwatchStart').onclick=()=>{const s=timerState.stopwatch;if(s.running)return;s.startAt=Date.now();stopwatchMonoStart=performance.now();s.running=true;saveTimers();renderTimerUI();};
$('stopwatchPause').onclick=()=>{const s=timerState.stopwatch;if(!s.running)return;s.elapsed=elapsedStopwatch();s.running=false;s.startAt=null;stopwatchMonoStart=null;saveTimers();renderTimerUI();};
$('stopwatchLap').onclick=()=>{const s=timerState.stopwatch;if(!s.running)return;s.laps.push(elapsedStopwatch());s.laps=s.laps.slice(-30);saveTimers();renderTimerUI();};
$('stopwatchReset').onclick=()=>{timerState.stopwatch={elapsed:0,startAt:null,running:false,laps:[]};stopwatchMonoStart=null;saveTimers();renderTimerUI();};
// Windows-native measurements; browser preview never displays fabricated percentages.
let metrics=null,metricsBusy=false,metricsAt=0;
function metricText(v){return typeof v==='number'&&Number.isFinite(v)?`${Math.max(0,Math.min(100,Math.round(v)))}%`:'—';}
function renderMetrics(){
 [['cpu','cpu'],['gpu','gpu'],['ram','ram']].forEach(([key,id])=>{let v=metrics?.[key];$(id+'Value').textContent=metricText(v);$(id+'Mini').textContent=metricText(v);$(id+'Bar').style.width=Number.isFinite(v)?Math.max(0,Math.min(100,v))+'%':'0%';});
 $('ramDetails').textContent=metrics?.memoryTotalGb?`${metrics.memoryUsedGb.toFixed(1)} / ${metrics.memoryTotalGb.toFixed(1)} GB`:'';
 $('systemStatus').textContent=metrics? (settings.language==='ro'?'Date Windows actualizate.':'Windows data updated.') : t('systemDesktopOnly');
 updateOrbitWidgetValues();
}
async function pollMetrics(force=false){
 if(!isTauri()||metricsBusy||$('appView').classList.contains('hidden')||document.hidden)return;
 if(!force&&Date.now()-metricsAt<1850)return;
 metricsBusy=true;metricsAt=Date.now();try{const out=await invoke('system_snapshot');const obj=JSON.parse(out);if(obj&&typeof obj==='object'){metrics=obj;renderMetrics();}}catch(err){console.warn('System monitor:',err);$('systemStatus').textContent=t('systemFailed')+' '+String(err).slice(0,140);}finally{metricsBusy=false;}
}
$('systemRefresh').onclick=()=>pollMetrics(true);
// F11 controls the native Tauri window, not only the inner WebView document.
let fullScreenBusy=false;
async function toggleFullScreen(){if(fullScreenBusy)return;fullScreenBusy=true;try{if(isTauri()){const active=await invoke('toggle_fullscreen');$('fullscreenBtn').setAttribute('aria-pressed',String(active));}else if(document.fullscreenElement){await document.exitFullscreen();}else{await document.documentElement.requestFullscreen();}}catch(err){toast(String(err));}finally{fullScreenBusy=false;}}
$('fullscreenBtn').onclick=toggleFullScreen;
window.addEventListener('keydown',evt=>{if(evt.key==='F11'&&!evt.repeat){evt.preventDefault();toggleFullScreen();}});
document.addEventListener('fullscreenchange',()=>{$('fullscreenBtn').setAttribute('aria-pressed',String(!!document.fullscreenElement));});

function updateClock(){
  setText('clock',new Date().toLocaleTimeString(settings.language==='ro'?'ro-RO':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
}
function tickBackground(){
  if(!$('appView').classList.contains('hidden')) dueCheck();
  pollMetrics();
  if(settings.city && weatherRequestedAt && Date.now()-weatherRequestedAt>15*60*1000 && !weatherLoading && !$('appView').classList.contains('hidden')) refreshWeather();
}
async function init() {
  applyLanguage();
  // ORBIT 3.0 uses Windows voices or official online Azure voices. No Piper startup requirement.
  if(settings.voiceEngine!=='system'){settings.voiceEngine='system';saveSettings();}
  renderVoiceEngine();
  $('voiceSpeed').value=String(settings.rate);$('voicePitch').value=String(settings.pitch);
  $('voiceVolume').value = String(Math.round(normalizedVolume()*100)); $('voiceVolumeValue').textContent = `${Math.round(normalizedVolume()*100)}%`;
  updateAllSliderTracks();
  applyAppearance();
  applyOrbitCustomization();
  $('rateValue').textContent=Number(settings.rate).toFixed(2)+'×';$('pitchValue').textContent=Number(settings.pitch).toFixed(2);
  $('speakReminders').checked=!!settings.speakReminders;$('minimizeTrayToggle').checked=!!settings.closeToTray;
  setReminderDateTime(localValue(new Date(Date.now()+30*60000)));
  if('speechSynthesis' in window){speechSynthesis.onvoiceschanged=populateVoices;populateVoices();setTimeout(populateVoices,900);}
  if(isTauri()){
    invoke('tts_list').then(voices=>{nativeVoices=Array.isArray(voices)?voices:[];populateVoices();}).catch(error=>{
      logAssistant('tts:list-error',String(error));renderVoiceEngine();
    });
  }
  if(isTauri()){try{$('startupToggle').checked=await autostartIsEnabled();}catch(err){console.warn(err);}}
  setLoggedIn();
  const durationSeconds=Math.floor(timerState.countdown.duration/1000);
  $('countdownMinutes').value=String(Math.floor(durationSeconds/60));$('countdownSeconds').value=String(durationSeconds%60);
  renderTimerUI();updateClock();tickBackground();
  setInterval(updateClock,1000);
  setInterval(tickBackground,5000);
  setInterval(()=>pollMetrics(),2000);
  setInterval(()=>{if(timerState.countdown.running||timerState.stopwatch.running){paintTimerDisplays();}},100);
}
// ORBIT 3.1 — Native local notes, never written into the installer directory.
let notes = [], noteSelected = null, noteSaveTimer = 0, noteDictation = false, lastReferencedNote = null;
function listDate(value) {
  const d = new Date(value); return Number.isFinite(d.getTime())
    ? d.toLocaleString(settings.language==='ro'?'ro-RO':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
}
function browserSaveNotes() { localStorage.setItem('orbit31_preview_notes',JSON.stringify(notes)); }
async function loadNotes() {
  if (isTauri()) notes = await invoke('notes_list');
  else notes = read('orbit31_preview_notes', []);
  if (!Array.isArray(notes)) notes=[];
  if (noteSelected && !notes.some(n=>n.id===noteSelected)) noteSelected=null;
  renderNotes();
}
function renderNotes() {
  const q=$('notesSearch').value.toLocaleLowerCase().trim(), list=$('notesList');
  list.replaceChildren();
  const matching=notes.filter(n=>`${n.title||''} ${n.body||''}`.toLocaleLowerCase().includes(q));
  matching.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||new Date(b.updatedAt)-new Date(a.updatedAt));
  $('notesCount').textContent=`${notes.length} ${settings.language==='ro'?'notițe':'notes'}`;
  if(!matching.length) { const blank=document.createElement('p');blank.className='small muted';blank.textContent=q?'Nothing matches your search.':'No notes yet.';list.append(blank); }
  for (const note of matching) {
    const btn=document.createElement('button');btn.type='button';btn.className='note-list-row'+(note.id===noteSelected?' selected':'');
    const title=document.createElement('strong');title.textContent=(note.pinned?'◆  ':'')+(note.title||note.body?.split('\n')[0]?.slice(0,52)||'Untitled note');
    const preview=document.createElement('span');preview.textContent=(note.body||'No additional text').replace(/\s+/g,' ').slice(0,90);
    const timestamp=document.createElement('small');timestamp.textContent=listDate(note.updatedAt);
    btn.append(title,preview,timestamp);btn.onclick=()=>{flushNoteSave().catch(err=>toast(String(err)));selectNote(note.id);};list.append(btn);
  }
  const selected=notes.find(n=>n.id===noteSelected);
  $('notesFields').classList.toggle('hidden',!selected);
  $('notesEmpty').classList.toggle('hidden',!!selected);
  for(const id of ['notePin','noteDictate','noteDelete']) $(id).disabled=!selected;
  if(selected) $('notePin').textContent=selected.pinned?'Unpin':'Pin';
}
function selectNote(id) {
  noteSelected=id;
  const n=notes.find(x=>x.id===id);
  if(n) {
    $('noteTitle').value=n.title||'';
    $('noteBody').value=n.body||'';
    $('noteTimestamp').textContent='Edited '+listDate(n.updatedAt);
    lastReferencedNote=id;
  }
  renderNotes();
}
async function saveNote(id,title,body,pinned) {
  if (isTauri()) return await invoke('notes_upsert',{id:id||'',title,body,pinned});
  // Browser-only preview mode, the real Windows app uses native notes.json.
  const now=new Date().toISOString();
  const copy={id:id||crypto.randomUUID(),title,body,pinned,createdAt:notes.find(n=>n.id===id)?.createdAt||now,updatedAt:now};
  const index=notes.findIndex(n=>n.id===copy.id);
  if(index>=0)notes[index]=copy;else notes.push(copy);
  browserSaveNotes();return copy;
}
async function createNote(text='') {
  await flushNoteSave();
  const entry=await saveNote('',text.trim().slice(0,70),'',false);
  if(isTauri())notes=await invoke('notes_list');
  selectNote(entry.id);showPage('notes');
  if(text) $('noteBody').focus(); else $('noteTitle').focus();
  return entry;
}
function scheduleNoteSave() {
  if(!noteSelected)return;
  $('notesSaveStatus').textContent='Saving…';
  clearTimeout(noteSaveTimer);
  noteSaveTimer=setTimeout(()=>flushNoteSave().catch(err=>{toast('Could not save note: '+err);$('notesSaveStatus').textContent='Save error';}),480);
}
async function flushNoteSave() {
  if(!noteSelected)return;
  clearTimeout(noteSaveTimer);noteSaveTimer=0;
  const id=noteSelected, title=$('noteTitle').value, body=$('noteBody').value;
  const existing=notes.find(n=>n.id===id);if(!existing)return;
  if(title===existing.title && body===existing.body) return;
  const updated=await saveNote(id,title,body,!!existing.pinned);
  notes=notes.map(n=>n.id===id?updated:n);renderNotes();
  $('notesSaveStatus').textContent='Saved locally · '+listDate(updated.updatedAt);
}
$('newNote').onclick=$('notesEmptyNew').onclick=()=>createNote().catch(err=>toast(String(err)));
$('notesSearch').oninput=renderNotes;
$('noteTitle').oninput=$('noteBody').oninput=scheduleNoteSave;
$('notePin').onclick=async()=>{
  const n=notes.find(x=>x.id===noteSelected);if(!n)return;
  try{await flushNoteSave();const updated=await saveNote(n.id,n.title,n.body,!n.pinned);notes=notes.map(x=>x.id===n.id?updated:x);renderNotes();}
  catch(err){toast(String(err));}
};
$('noteDelete').onclick=async()=>{
  if(!noteSelected||!confirm('Delete this note permanently?'))return;
  const id=noteSelected;
  try{
    clearTimeout(noteSaveTimer);noteSaveTimer=0;
    if(isTauri())await invoke('notes_delete',{id});
    notes=notes.filter(n=>n.id!==id);if(!isTauri())browserSaveNotes();
    noteSelected=null;renderNotes();toast('Note deleted.');
  }catch(err){toast(String(err));}
};

// Voice activation: native Windows recognizer + command engine. Microphone is opt-in.
let speechState='off';
const logAssistant=(stage,message)=>{
  console.info('[ORBIT assistant]',stage,message);
  if(isTauri())invoke('assistant_log',{stage,message:String(message).slice(0,850)}).catch(error=>console.warn('Assistant logging unavailable:',error));
};
function assistantFeedback(message){ $('assistantFeedback').textContent=message; }

function updateSpeechState(state, message='') {
  if(speechPlaybackActive && state!=='speaking') return;
  speechState=state;
  document.body.classList.toggle('orbit-listening',state==='listening');
  document.body.classList.toggle('orbit-armed',state==='armed');
  const label={off:'Mic off',armed:'Ready · Hey ORBIT',listening:'Listening…',hypothesis:'Recognizing…',rejected:'Not understood',thinking:'Thinking…',speaking:'Speaking…',heard:'Command received',audio_problem:'Microphone audio issue',error:'Assistant error',idle:'Ready'}[state]||state;
  $('speechStatus').textContent=label+(message?' · '+message:'');
  $('voiceCaption').textContent=$('speechStatus').textContent;
  $('voiceTalk').setAttribute('aria-pressed',String(state==='listening'));
  document.body.classList.toggle('orbit-thinking',state==='thinking');
  document.body.classList.toggle('orbit-speaking',state==='speaking');
  document.body.dataset.assistantStatus=state;
}
function recognitionLocale(){return 'auto';}
async function talk() {
  if (!isTauri()) {toast('Microphone commands require the Windows app.');return;}
  try {await invoke('voice_push_to_talk',{language:recognitionLocale()});updateSpeechState('listening','Speak now');}
  catch(err){updateSpeechState('error',String(err.message||err));toast(String(err));}
}
$('voiceTalk').onclick=$('pushToTalkSettings').onclick=talk;
$('noteDictate').onclick=async()=>{if(!noteSelected)return;noteDictation=true;await talk();};
$('wakeToggle').onchange=async(e)=>{
  if(!isTauri()){e.target.checked=false;toast('Hands-free mode needs the Windows application.');return;}
  settings.wakeEnabled=e.target.checked;settings.speechLanguage=recognitionLocale();
  try {
    if(e.target.checked){await invoke('voice_enable',{language:recognitionLocale()});updateSpeechState('armed','Say Hey ORBIT');}
    else {await invoke('voice_disable');updateSpeechState('off');}
    saveSettings();
  }catch(err){e.target.checked=false;settings.wakeEnabled=false;saveSettings();updateSpeechState('error',String(err));toast(String(err));}
};
$('voiceOff').onclick=async()=>{
  try{if(isTauri())await invoke('voice_disable');}catch(err){toast(String(err));}
  settings.wakeEnabled=false;saveSettings();$('wakeToggle').checked=false;updateSpeechState('off');
};
$('speechLanguage').onchange=async(e)=>{
  settings.speechLanguage='auto';saveSettings();
  if(settings.wakeEnabled){$('wakeToggle').checked=false;await $('voiceOff').onclick();$('wakeToggle').checked=true;await $('wakeToggle').onchange({target:$('wakeToggle')});}
};
function localizeResponse(message) {
  if(settings.language!=='ro')return message;
  const exact={'Opening Windows Settings.':'Deschid setările Windows.','Audio muted.':'Sunetul a fost oprit.','Audio unmuted.':'Sunetul a fost pornit.','Brightness updated.':'Luminozitatea a fost actualizată.','Note saved.':'Notița a fost salvată.','Cancelled.':'Am anulat.','What should I write?':'Ce vrei să notez?','Choose a number from the app list.':'Alege un număr din lista de aplicații.'};
  if(exact[message])return exact[message];
  return message.replace(/^Opening (.+)\.$/,'Deschid $1.').replace(/^Windows volume is (\d+) percent\.$/,'Volumul Windows este la $1 la sută.').replace(/^What percentage should I set (volume|brightness) to\? Use a number from 0 to 100\.$/,(_,kind)=>'La ce nivel vrei '+(kind==='volume'?'volumul':'luminozitatea')+'? Alege un număr între 0 și 100.').replace(/^Which app\? /,'Ce aplicație dorești? ').replace('Say or type its number, or cancel.','Spune sau scrie numărul aplicației ori spune „cancel”.');
}
async function handleSpeech(text, fromVoice=false) {
  const original=String(text||'').trim();
  if(!original){assistantFeedback('Enter a command first.');return;}
  const lower=original.toLocaleLowerCase().trim().replace(/[.!?]+$/,'');
  const clean=normalizeCommand(lower);
  logAssistant(fromVoice?'recognized-text':'typed-input',original);
  updateSpeechState('thinking',original.slice(0,100));
  assistantFeedback('Understanding: “'+original+'”');
  const respond=(message)=>{const translated=localizeResponse(message);assistantFeedback(translated);void speak(translated);};
  try {
    if(!clean||/^(?:hey|hi|hello)\s*orbit$/.test(clean)) {respond('I am ready. Say a command or type it below.');return;}
    if(/^(help|commands|what can you do|ajutor|comenzi)$/.test(clean)){
      respond('Try open Chrome, launch Spotify, turn volume up, set brightness to fifty percent, open Bluetooth settings, create a note, or show reminders.');return;
    }
    if(noteDictation) {
      noteDictation=false;
      if(!noteSelected)await createNote();
      $('noteBody').value+=($('noteBody').value?'\n':'')+original;
      await flushNoteSave();respond('Note saved.');return;
    }
    const choiceText = ({one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'})[clean] || clean;
    const selection = choiceText.match(/^(?:number |option )?([1-9])$/);
    if (pendingAppChoices.length && selection) {
      const app = pendingAppChoices[Number(selection[1])-1];
      if (!app) {respond('Choose a number from the app list.');return;}
      await invoke('launch_catalog_app',{path:app.path});pendingAppChoices=[];respond('Opening '+app.name+'.');return;
    }
    if (clean === 'cancel') {pendingAppChoices=[];respond('Cancelled.');return;}
    const desktop = parseDesktopCommand(clean);
    if (desktop?.question) {respond(desktop.question);return;}
    if (desktop?.command) {
      const result = await invoke(desktop.command,desktop.args);
      respond(desktop.command==='settings_open'?'Opening Windows Settings.':desktop.command==='volume_mute'?(desktop.args.enabled?'Audio muted.':'Audio unmuted.'):desktop.command.startsWith('volume')?'Windows volume is '+result+' percent.':'Brightness updated.');return;
    }
    // Preserve ORBIT navigation commands before resolving Windows applications.
    const internalPage = desktop?.app && {notite:'notes',notitele:'notes',mementouri:'reminders',mementourile:'reminders',sarcini:'reminders',sarcinile:'reminders',notes:'notes',reminders:'reminders',tasks:'reminders',timers:'timers',weather:'weather',dashboard:'dashboard',presets:'presets','system monitor':'system','pc performance':'system'}[desktop.app];
    if(internalPage){showPage(internalPage);respond('Opening '+desktop.app+'.');return;}
    if (desktop?.app && !/widget/.test(desktop.app)) {
      const apps = await invoke('list_installed_apps');
      const matches = matchApps(desktop.app,apps);
      if(matches.length===1){await invoke('launch_catalog_app',{path:matches[0].path});pendingAppChoices=[];respond('Opening '+matches[0].name+'.');return;}
      if(matches.length>1){pendingAppChoices=matches.slice(0,9);respond('Which app? '+pendingAppChoices.map((app,i)=>(i+1)+'. '+app.name).join('; ')+'. Say or type its number, or cancel.');return;}
      const builtins={calculatorul:'calculator','editorul de text':'notepad',fisierele:'explorer',calculator:'calculator',calc:'calculator',notepad:'notepad',explorer:'explorer','file explorer':'explorer',files:'explorer'};
      if(builtins[desktop.app]){await invoke('launch_known_app',{name:builtins[desktop.app]});respond('Opening '+desktop.app+'.');return;}
      respond('I could not find '+desktop.app+'. Try its installed name, or add its executable through Presets → Browse files.');return;
    }
    // Windows-control commands. Distinct input/processing/response events are logged.
    const volume=clean.match(/(?:set|change|turn|put|make)?\s*(?:the|my|system)?\s*(?:volume|sound)(?:\s+(?:to|at|on))?\s+(\d{1,3})(?:\s*percent|\s*%)?/)
      ||clean.match(/(?:seteaz[aă]|schimb[aă])\s+(?:volumul|volum)\s+(?:la\s+)?(\d{1,3})/);
    const brightness=clean.match(/(?:set|change|turn)?\s*(?:the|screen)?\s*brightness(?:\s+(?:to|at))?\s+(\d{1,3})(?:\s*percent|\s*%)?/)
      ||clean.match(/(?:seteaz[aă]|schimb[aă])\s+luminozitatea\s+(?:la\s+)?(\d{1,3})/);
    if(volume){const n=Math.min(100,Math.max(0,+volume[1]));logAssistant('command','volume_set '+n);await invoke('volume_set',{percent:n});respond('Windows volume set to '+n+' percent.');return;}
    if(brightness){const n=Math.min(100,Math.max(0,+brightness[1]));logAssistant('command','brightness_set '+n);await invoke('brightness_set',{percent:n});respond('Brightness set to '+n+' percent.');return;}
    if(/\b(unmute|unmute audio)\b/.test(clean)||/porn[eș]te sunetul/.test(clean)){logAssistant('command','unmute');await invoke('volume_mute',{enabled:false});respond('Audio unmuted.');return;}
    if(/\bmute\b/.test(clean)||/opre[sș]te sunetul/.test(clean)){logAssistant('command','mute');await invoke('volume_mute',{enabled:true});assistantFeedback('Windows audio muted.');return;}
    const apps=[
      {re:/\b(calculator|calc|calculatorul)\b/,name:'calculator',display:'Calculator'},
      {re:/\b(notepad|editorul de text)\b/,name:'notepad',display:'Notepad'},
      {re:/\b(explorer|file explorer|files|fi[sș]ierele)\b/,name:'explorer',display:'File Explorer'},
      {re:/\b(settings|windows settings|set[aă]ri(?:le)?)\b/,name:'settings',display:'Settings'}
    ];
    if(/^(?:open|start|launch|run|please open|can you open|deschide|porn[eș]te)\b/.test(clean)){
      const found=apps.find(a=>a.re.test(clean));
      if(found){logAssistant('command','launch_known_app '+found.name);await invoke('launch_known_app',{name:found.name});respond('Opening '+found.display+'.');return;}
    }
    const makeNote=clean.match(/(?:take|make|create|write|adaug[aă]|creeaz[aă]) (?:a |o )?(?:note|noti[tț][aă])(?: that says| saying| cu textul)?[\s:,-]*(.*)$/);
    if(makeNote){
      const rest=makeNote[1].trim();showPage('notes');await createNote(rest?'Quick note':'');
      if(rest){$('noteBody').value=rest;await flushNoteSave();respond('Note saved.');}
      else {noteDictation=true;respond('What should I write?');if(fromVoice)setTimeout(()=>talk(),1700);}
      return;
    }
    if(/^(?:open|show|go to|deschide|arat[aă]) (?:my |the )?(?:notes|noti[tț]e(?:le)?)$/.test(clean)){showPage('notes');respond('Opening notes.');return;}
    if(/^(?:open|show|go to|deschide|arat[aă]) (?:my |the )?(?:reminders|tasks|mementouri(?:le)?|sarcini(?:le)?)$/.test(clean)){showPage('reminders');respond('Opening reminders.');return;}
    if(/(?:show|open|display|arat[aă]|deschide) (?:my |the )?(?:system monitor|pc performance|pc stats|performance|monitorizare|performan[tț]a)/.test(clean)){showPage('system');await pollMetrics(true);respond('PC performance is on screen.');return;}
    const searchNote=clean.match(/^(?:find|search|look for|caut[aă]) (?:my )?note(?:s)? (?:about |called |for )?(.+)$/);
    if(searchNote){showPage('notes');$('notesSearch').value=searchNote[1];renderNotes();respond('Searching your notes.');return;}
    if(/^(?:read|read it|read that|read note|read my note)(?: aloud)?$/.test(clean) && lastReferencedNote){
      const item=notes.find(n=>n.id===lastReferencedNote);if(item){respond((item.title?item.title+'. ':'')+item.body.slice(0,520));return;}
    }
    if(/(?:show|open) (?:desktop |performance )?widget/.test(clean)){await invoke('mini_widget_show');respond('Performance overlay opened.');return;}
    if(/(?:hide|close) (?:desktop |performance )?widget/.test(clean)){await invoke('mini_widget_hide');respond('Performance overlay hidden.');return;}
    if(/^(?:what time is it|time|cat este ceasul|c[aâ]t este ceasul)$/.test(clean)){
      respond('It is '+new Date().toLocaleTimeString(settings.language==='ro'?'ro-RO':'en-GB',{hour:'2-digit',minute:'2-digit'})+'.');return;
    }
    const unsupported='I understood “'+original+'”, but that is not a supported command. Type “help” for commands.';
    logAssistant('command:unsupported',original);respond(unsupported);
  } catch(err){
    const message='Command failed: '+String(err?.message||err);
    logAssistant('command:error',message);console.error('ORBIT command:',err);assistantFeedback(message);toast(message);
    updateSpeechState('error',message);
  } finally {
    // Keep recognition from silently getting stuck after one command.
    if(fromVoice&&isTauri())invoke('voice_command_complete').catch(err=>logAssistant('recognition:rearm_error',String(err)));
    if(speechState==='thinking')updateSpeechState(settings.wakeEnabled?'armed':'idle');
  }
}
$('assistantCommandForm').onsubmit=event=>{
  event.preventDefault();const command=$('assistantCommandInput').value.trim();
  if(!command)return;
  $('assistantCommandInput').value='';handleSpeech(command,false);
};
async function refreshAssistantDiagnostics(){
  if(!isTauri()){$('assistantDiagnosticsText').textContent='Open the Windows app to view native logs. Browser mode only shows console messages.';return;}
  try{$('assistantDiagnosticsText').textContent=await invoke('assistant_log_get');}
  catch(error){$('assistantDiagnosticsText').textContent='Cannot load log: '+String(error);}
}
$('assistantDiagnosticsRefresh').onclick=refreshAssistantDiagnostics;
$('assistantDiagnosticsFolder').onclick=()=>isTauri()?invoke('assistant_log_folder').catch(err=>toast(String(err))):toast('Available in Windows app only.');
if(globalThis.chrome?.webview){
  chrome.webview.addEventListener('message',({data})=>{
    if(data?.orbitEvent==='tts'){
      speechPlaybackActive=data.state==='speaking';
      if(data.state==='speaking')updateSpeechState('speaking',data.message||'');
      else if(data.state==='error'){updateSpeechState('error',data.message||'');assistantFeedback(data.message||'Voice output failed');}
      else if(data.state==='idle')updateSpeechState(settings.wakeEnabled?'armed':'idle');
      return;
    }
    if(data?.orbitEvent!=='speech')return;
    if(data.state==='hypothesis'){
      updateSpeechState('hypothesis',data.message||'');return;
    }
    if(data.state==='rejected'){logAssistant('recognition:rejected',data.message||'');updateSpeechState('listening',data.message||'Please repeat or type the command.');assistantFeedback(data.message||'Please repeat or type the command.');return;}
    if(data.state==='audio_problem'){updateSpeechState('error',data.message||'Audio problem');return;}
    if(data.state==='heard'&&data.message){updateSpeechState('thinking',data.message);void handleSpeech(data.message,true);return;}
    updateSpeechState(data.state||'idle',data.message||'');
  });
}

// GitHub Releases update flow; asks before launching a verified installer.
let upcomingUpdate='';
$('saveUpdateRepository').onclick=async()=>{
  if(!isTauri())return toast('Updater is only available inside ORBIT for Windows.');
  try{await invoke('update_repo_set',{repository:$('updateRepository').value.trim()});toast('Update repository saved.');}
  catch(err){toast(String(err.message||err));}
};
$('checkUpdates').onclick=async()=>{
  if(!isTauri())return toast('Updater is only available inside ORBIT for Windows.');
  $('updateStatus').textContent='Checking official GitHub Releases…';
  try {
    const info=await invoke('update_check');
    upcomingUpdate=info.hasUpdate&&info.installer&&info.checksum?info.latest:'';
    $('updateStatus').textContent=info.hasUpdate?`New version ${info.latest}. ${upcomingUpdate?'Installer and checksum available.':'Installer or SHA-256 checksum missing.'}`:info.message;
    $('installUpdate').classList.toggle('hidden',!upcomingUpdate);
    $('installUpdate').textContent=`Install ORBIT ${upcomingUpdate}`;
  }catch(err){$('updateStatus').textContent=String(err.message||err);$('installUpdate').classList.add('hidden');}
};
$('installUpdate').onclick=async()=>{
  if(!upcomingUpdate||!confirm('Download the verified ORBIT '+upcomingUpdate+' installer and run it? Save your work first.'))return;
  $('updateStatus').textContent='Downloading and checking SHA-256…';
  try{$('updateStatus').textContent=await invoke('update_install',{version:upcomingUpdate});}
  catch(err){$('updateStatus').textContent=String(err.message||err);}
};
$('miniWidgetButton').onclick=async()=>{try{await invoke('mini_widget_show');toast('Performance widget opened.');}catch(err){toast(String(err));}};
if(isTauri())invoke('update_repo_get').then(name=>{$('updateRepository').value=name||'';}).catch(console.warn);
// Sync previously saved opt-in microphone preference with native recognition on startup.
$('speechLanguage').value=recognitionLocale();
$('wakeToggle').checked=!!settings.wakeEnabled;
if(settings.wakeEnabled&&isTauri()){
  invoke('voice_enable',{language:recognitionLocale()}).then(()=>updateSpeechState('armed','Say Hey ORBIT')).catch(err=>{
    settings.wakeEnabled=false;saveSettings();$('wakeToggle').checked=false;updateSpeechState('error',String(err.message||err));
  });
}

// ORBIT 3.2: Local-first personalization, versioned Windows backups and UI enhancements.
let orbitUserName = '';
let orbitStateTimer = 0;
let orbitStateBusy = false;
let orbitStateDirty = false;
const orbitWidgetTypes = ['cpu','ram','gpu','disk','network'];
function orbitStatePayload(){
  return JSON.stringify({version:4,settings,tasks,presets,timers:read(KEYS.timers,{}),savedAt:new Date().toISOString()});
}
function scheduleOrbitStateSave(){
  orbitStateDirty=true;
  try{localStorage.setItem('orbit321_modified_at',String(Date.now()));}catch{}
  clearTimeout(orbitStateTimer);
  orbitStateTimer=setTimeout(flushOrbitState,600);
}
async function flushOrbitState(){
  if(!isTauri()||orbitStateBusy||!orbitStateDirty)return;
  orbitStateBusy=true;
  orbitStateDirty=false;
  try{await invoke('state_save',{payload:orbitStatePayload()});}
  catch(error){orbitStateDirty=true;console.warn('ORBIT settings backup:',error);}
  finally{orbitStateBusy=false;if(orbitStateDirty)orbitStateTimer=setTimeout(flushOrbitState,1200);}
}
async function bootstrapOrbit32(){
  if(isTauri()){
    try{
      const json=await invoke('state_load');
      if(json){
        const data=JSON.parse(json);
        // Prefer newer browser changes over a stale disk snapshot after a crash.
        const diskTime=Date.parse(data?.savedAt||'')||0;
        const browserTime=Number(localStorage.getItem('orbit321_modified_at')||0);
        if(data && typeof data==='object' && Number(data.version)>=2 && diskTime>=browserTime){
          if(data.settings&&typeof data.settings==='object'){settings={...defaults,...data.settings};localStorage.setItem(KEYS.settings,JSON.stringify(settings));}
          if(Array.isArray(data.tasks)){tasks=data.tasks;localStorage.setItem(KEYS.tasks,JSON.stringify(tasks));}
          if(Array.isArray(data.presets)){presets=data.presets;localStorage.setItem(KEYS.presets,JSON.stringify(presets));}
          if(data.timers&&typeof data.timers==='object'){localStorage.setItem(KEYS.timers,JSON.stringify(data.timers));timerState=readTimerState();}
        }
      }else scheduleOrbitStateSave();
    }catch(error){console.warn('ORBIT recovered from browser storage:',error);}
    try{
      const json=await invoke('profile_load');
      const data=json?JSON.parse(json):null;
      if(data?.name && typeof data.name==='string')orbitUserName=data.name.slice(0,45);
    }catch(error){console.warn('Profile could not be loaded:',error);}
  }else orbitUserName=read('orbit32_username','');
  wireOrbit32UI();
  if(!orbitUserName) await showOrbitWelcome();
}
function showOrbitWelcome(){
  const overlay=$('orbitWelcome');
  overlay.classList.remove('hidden');
  $('orbitWelcomeName').focus();
  let index=0;const line='A smarter day begins here.';
  $('orbitWelcomeTyped').textContent='';
  const typing=setInterval(()=>{if(index>=line.length){clearInterval(typing);return;}$('orbitWelcomeTyped').textContent+=line[index++];},40);
  return new Promise(resolve=>{
    $('orbitWelcomeForm').onsubmit=async event=>{
      event.preventDefault();const name=$('orbitWelcomeName').value.trim();if(!name)return;
      try{if(isTauri())await invoke('profile_save',{name});else localStorage.setItem('orbit32_username',JSON.stringify(name));
        orbitUserName=name;overlay.classList.add('orbit-welcome-leaving');
        setTimeout(()=>{overlay.classList.add('hidden');overlay.classList.remove('orbit-welcome-leaving');resolve();},400);
      }catch(error){toast('Could not save profile: '+String(error));}
    };
  });
}
function applyOrbitCustomization(){
  const theme=settings.orbitTheme||'dark';
  document.documentElement.dataset.orbitTheme=theme==='auto'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;
  document.documentElement.dataset.orbitMotion=settings.orbitMotion||'full';
  document.documentElement.dataset.orbitFont=settings.orbitFont||'segoe';
}
function wireOrbit32UI(){
  const controls={orbitThemeSetting:'orbitTheme',orbitFontSetting:'orbitFont',orbitMotionSetting:'orbitMotion'};
  for(const [id,key] of Object.entries(controls)){
    $(id).value=settings[key]||({orbitTheme:'dark',orbitFont:'segoe',orbitMotion:'full'}[key]);
    $(id).onchange=event=>{settings[key]=event.target.value;saveSettings();applyOrbitCustomization();};
  }
  $('orbitNameSetting').value=orbitUserName;
  $('orbitNameSetting').onchange=async event=>{
    const name=event.target.value.trim();if(!name)return;
    try{if(isTauri())await invoke('profile_save',{name});else localStorage.setItem('orbit32_username',JSON.stringify(name));orbitUserName=name;renderDashboard();$('userAvatar').textContent=name[0].toUpperCase();}
    catch(error){toast(String(error));}
  };
  $('orbitResetProfile').onclick=async()=>{
    if(!confirm('Reset your name and show the welcome screen again?'))return;
    if(isTauri())await invoke('profile_reset');else localStorage.removeItem('orbit32_username');
    orbitUserName='';location.reload();
  };
  $('orbitExportSettings').onclick=async()=>{try{if(!isTauri())return toast('Export requires the Windows app.');await flushOrbitState();const ok=await invoke('settings_export');if(ok)toast('Settings exported.');}catch(error){toast(String(error));}};
  $('orbitImportSettings').onclick=async()=>{
    if(!confirm('Import settings and replace current reminders and presets? Export first if needed.'))return;
    try{if(!isTauri())return toast('Import requires the Windows app.');const json=await invoke('settings_import');if(json){const data=JSON.parse(json);if(data.settings&&typeof data.settings==='object')localStorage.setItem(KEYS.settings,JSON.stringify(data.settings));if(Array.isArray(data.tasks))localStorage.setItem(KEYS.tasks,JSON.stringify(data.tasks));if(Array.isArray(data.presets))localStorage.setItem(KEYS.presets,JSON.stringify(data.presets));location.reload();}}
    catch(error){toast(String(error));}
  };
  $('orbitResetAll').onclick=async()=>{
    if(!confirm('Reset all ORBIT settings, reminders and presets? This cannot be undone. Notes will remain.'))return;
    try{clearTimeout(orbitStateTimer);orbitStateDirty=false;if(isTauri())await invoke('settings_reset');Object.values(KEYS).forEach(k=>localStorage.removeItem(k));localStorage.removeItem('orbit32_username');localStorage.removeItem('orbit321_modified_at');orbitUserName='';location.reload();}
    catch(error){toast(String(error));}
  };
  $('addOrbitWidget').onclick=()=>{
    const hidden=orbitWidgetTypes.filter(type=>settings.orbitHiddenWidgets?.includes(type));
    if(!hidden.length)return toast('All widgets are already visible.');
    const type=hidden.includes($('orbitWidgetPicker').value)?$('orbitWidgetPicker').value:hidden[0];
    settings.orbitHiddenWidgets=settings.orbitHiddenWidgets.filter(x=>x!==type);
    saveSettings();renderOrbitWidgets();
  };
  const updateSidebar = () => {
    const collapsed = !!settings.orbitSidebarCollapsed;
    document.body.classList.toggle('orbit-sidebar-collapsed', collapsed);
    $('sidebarCollapse').setAttribute('aria-expanded', String(!collapsed));
    $('sidebarCollapse').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    $('sidebarCollapse').title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    document.querySelectorAll('.side-nav .nav-btn').forEach(button => {
      const label = button.querySelector('[data-i18n]').textContent.trim();
      button.setAttribute('aria-label', label);
      button.title = label;
      button.dataset.tooltip = label;
    });
  };
  $('sidebarCollapse').onclick = () => {
    settings.orbitSidebarCollapsed = !settings.orbitSidebarCollapsed;
    updateSidebar();
    saveSettings();
  };
  updateSidebar();
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey && event.key.toLowerCase()==='k'){event.preventDefault();openOrbitPalette();}
    if(event.key==='Escape')closeOrbitPalette();
  });
  $('orbitPalette').addEventListener('click',event=>{if(event.target===$('orbitPalette'))closeOrbitPalette();});
  $('orbitPaletteSearch').oninput=refreshOrbitPalette;
  applyOrbitCustomization();
}
function closeOrbitPalette(){$('orbitPalette').classList.add('hidden');}
function openOrbitPalette(){$('orbitPalette').classList.remove('hidden');$('orbitPaletteSearch').value='';refreshOrbitPalette();$('orbitPaletteSearch').focus();}
function refreshOrbitPalette(){
  const term=$('orbitPaletteSearch').value.trim().toLowerCase();
  const actions=[...['dashboard','notes','reminders','presets','timers','weather','system','settings'].map(id=>({title:'Open '+id,do:()=>showPage(id)})),
    {title:'Add reminder',do:()=>{showPage('reminders');$('taskText')?.focus();}},
    {title:'Create note',do:()=>{showPage('notes');$('newNote')?.click();}},
    {title:'Show performance overlay',do:()=>invoke('mini_widget_show')},
    {title:'Check updates',do:()=>{showPage('settings');$('checkUpdates').click();}}];
  $('orbitPaletteResults').replaceChildren();
  for(const action of actions.filter(a=>a.title.toLowerCase().includes(term)).slice(0,9)){
    const button=document.createElement('button');button.type='button';button.textContent='↗  '+action.title;
    button.onclick=()=>{closeOrbitPalette();Promise.resolve(action.do()).catch(error=>toast(String(error)));};
    $('orbitPaletteResults').append(button);
  }
}
function orbitWidgetNumber(type) {
  if(type==='network'){
    const down=metrics?.networkDownKBps,up=metrics?.networkUpKBps;
    return Number.isFinite(down)&&Number.isFinite(up)?`↓ ${down.toFixed(1)} · ↑ ${up.toFixed(1)} KB/s`:'—';
  }
  return metricText(metrics?.[type]);
}
function updateOrbitWidgetValues(){
  document.querySelectorAll('.orbit-widget[data-widget]').forEach(card=>{
    const type=card.dataset.widget;
    card.querySelector('.orbit-widget-value').textContent=orbitWidgetNumber(type);
    const fill=card.querySelector('.orbit-widget-track span');
    if(fill)fill.style.width=type==='network'?'0%':Number.isFinite(metrics?.[type])?Math.max(0,Math.min(100,metrics[type]))+'%':'0%';
  });
}
function renderOrbitWidgets(){
  const grid=$('orbitWidgetGrid');if(!grid)return;
  const hidden=orbitWidgetTypes.filter(type=>settings.orbitHiddenWidgets?.includes(type));
  const picker=$('orbitWidgetPicker');const selected=picker.value;
  picker.replaceChildren();
  hidden.forEach(type=>{const option=document.createElement('option');option.value=type;option.textContent=type.toUpperCase();picker.append(option);});
  if(hidden.includes(selected))picker.value=selected;
  picker.classList.toggle('hidden',hidden.length===0);
  $('addOrbitWidget').disabled=hidden.length===0;
  const order=Array.isArray(settings.orbitWidgetOrder)?settings.orbitWidgetOrder:orbitWidgetTypes;
  const visible=orbitWidgetTypes.filter(type=>!settings.orbitHiddenWidgets?.includes(type));
  visible.sort((a,b)=>(order.includes(a)?order.indexOf(a):100)-(order.includes(b)?order.indexOf(b):100));
  grid.replaceChildren();
  for(const type of visible){
    const card=document.createElement('article');card.className='orbit-widget';card.dataset.widget=type;
    card.draggable=true;card.setAttribute('aria-label',type.toUpperCase()+' performance widget');
    const title=document.createElement('strong');title.textContent=({ram:'MEMORY',network:'NETWORK ↓ / ↑',disk:'DISK USED'}[type]||type.toUpperCase());
    const close=document.createElement('button');close.type='button';close.textContent='×';close.className='orbit-widget-close';
    close.title='Hide '+type+' widget';close.setAttribute('aria-label','Hide '+type+' widget');
    close.onclick=()=>{card.classList.add('orbit-widget-removing');setTimeout(()=>{
      settings.orbitHiddenWidgets=[...new Set([...(settings.orbitHiddenWidgets||[]),type])];
      saveSettings();renderOrbitWidgets();
    },190);};
    const val=document.createElement('b');val.className='orbit-widget-value';val.textContent=orbitWidgetNumber(type);
    const bar=document.createElement('div');bar.className='orbit-widget-track';const fill=document.createElement('span');bar.append(fill);
    card.append(title,close,val,bar);
    card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',type);event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
    card.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';});
    card.addEventListener('drop',event=>{
      event.preventDefault();const source=event.dataTransfer.getData('text/plain');if(!visible.includes(source)||source===type)return;
      const arranged=[...visible];arranged.splice(arranged.indexOf(source),1);arranged.splice(arranged.indexOf(type),0,source);
      settings.orbitWidgetOrder=[...arranged,...orbitWidgetTypes.filter(x=>!arranged.includes(x))];saveSettings();renderOrbitWidgets();
    });
    grid.append(card);
  }
  updateOrbitWidgetValues();
}
window.addEventListener('pagehide',()=>{if(orbitStateDirty)flushOrbitState();});

bootstrapOrbit32().then(init).catch(error=>{console.error('ORBIT startup:',error);toast(String(error));init();});

initializeOrb();

