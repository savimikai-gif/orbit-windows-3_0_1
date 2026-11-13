export function normalizeCommand(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[.!?,]+$/,'').replace(/^(?:(?:hey|okay|ok)\s+)?orbit[, ]*/, '')
    .replace(/^(?:please |can you |could you |would you |will you |i want you to )+/, '')
    .replace(/\s+(?:please|for me)$/, '').trim();
}
const numbers = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100};
function numeric(text) {
  return text.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred))?\b/g, words => {
    const parts=words.split(/[ -]+/);return String(parts[1]==='hundred'?numbers[parts[0]]*100:parts.reduce((sum,word)=>sum+numbers[word],0));
  });
}
export const settingsPages = {'setari':'','setarile':'','setari bluetooth':'bluetooth','setarile bluetooth':'bluetooth','setari wifi':'network-wifi','setari de sunet':'sound','setari ecran':'display','settings':'','windows settings':'','display':'display','display settings':'display','brightness settings':'display','sound settings':'sound','audio settings':'sound','bluetooth':'bluetooth','bluetooth settings':'bluetooth','wifi':'network-wifi','wi-fi':'network-wifi','wifi settings':'network-wifi','network settings':'network','windows update':'windowsupdate','installed apps':'appsfeatures','microphone settings':'privacy-microphone','camera settings':'privacy-webcam','personalization':'personalization','power settings':'powersleep','notifications':'notifications','date and time':'dateandtime','printers':'printers','mouse settings':'mousetouchpad','keyboard settings':'keyboard','accessibility':'easeofaccess','storage settings':'storagesense','default apps':'defaultapps','accounts':'accounts'};
export function parseDesktopCommand(text) {
  let clean=normalizeCommand(text);
  const romanian={'seteaza':'set','schimba':'change','mareste':'increase','ridica':'increase','scade':'decrease','redu':'reduce','volumul':'volume','volum':'volume','sunetul':'sound','luminozitatea':'brightness','luminozitate':'brightness','la':'to','cu':'by','procente':'percent','suta':'hundred','cincizeci':'fifty','douazeci':'twenty','treizeci':'thirty','patruzeci':'forty','saizeci':'sixty','saptezeci':'seventy','optzeci':'eighty','nouazeci':'ninety','zece':'ten'};
  clean=clean.replace(/\b\w+\b/g,word=>romanian[word]||word);
  clean=numeric(clean);
  if (/^(?:unmute|unmute (?:the )?(?:sound|audio|volume)|turn (?:the )?sound on)$/.test(clean)) return {command:'volume_mute',args:{enabled:false}};
  if (/^(?:mute|mute (?:the )?(?:sound|audio|volume)|turn (?:the )?sound off)$/.test(clean)) return {command:'volume_mute',args:{enabled:true}};
  const level=clean.match(/^(?:(set|change|put|make|turn|increase|raise|decrease|lower|reduce|turn up|turn down)\s+)?(?:the |my |system |screen )?(volume|sound|brightness)(?:\s+(up|down))?(?:\s+(to|at|by))?(?:\s+(\d{1,3}))?(?:\s*(?:percent|%))?$/);
  if(level){
    const [,verb,kind,direction,preposition,value]=level;
    const relative=preposition!=='to'&&preposition!=='at'&&(direction||/increase|raise|decrease|lower|reduce|up|down/.test(verb||''));
    const target=kind==='brightness'?'brightness':'volume';
    if(relative){const sign=direction==='down'||/decrease|lower|reduce|down/.test(verb||'')?-1:1;return {command:target+'_adjust',args:{delta:sign*Number(value??10)}};}
    if(value!==undefined&&Number(value)<=100)return {command:target+'_set',args:{percent:Number(value)}};
    return {question:'What percentage should I set '+target+' to? Use a number from 0 to 100.'};
  }
  const open=clean.match(/^(?:open|launch|start|run|bring up|show|go to|deschide|porneste)\s+(?:the |my )?(.+)$/);
  if(open){const name=open[1].replace(/\s+(?:app|application)$/,'');if(Object.hasOwn(settingsPages,name))return {command:'settings_open',args:{page:settingsPages[name]}};return {app:name};}
  return null;
}
const aliases={'chrome':'google chrome','edge':'microsoft edge','word':'microsoft word','excel':'microsoft excel','powerpoint':'microsoft powerpoint','vs code':'visual studio code','vscode':'visual studio code','code':'visual studio code','file explorer':'explorer','calc':'calculator'};
export function matchApps(query, apps) {
  const key=normalizeCommand(query);const target=aliases[key]||key;
  const nameKey=name=>normalizeCommand(name).replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  const candidates=apps.map(app=>{const name=nameKey(app.name);return {app,score:name===target||name===key?3:name.includes(target)||name.includes(key)?2:0};}).filter(x=>x.score>0);
  const best=Math.max(0,...candidates.map(x=>x.score));
  return [...new Map(candidates.filter(x=>x.score===best).map(x=>[nameKey(x.app.name),x.app])).values()];
}

