import assert from 'node:assert/strict';
import {parseDesktopCommand as parse, matchApps} from '../Web/src/commands.js';
for(const [phrase,command,args] of [
 ['Could you please set volume to fifty percent','volume_set',{percent:50}],
 ['turn up the volume','volume_adjust',{delta:10}],
 ['lower brightness by twenty','brightness_adjust',{delta:-20}],
 ['increase volume to thirty five percent','volume_set',{percent:35}],
 ['mute','volume_mute',{enabled:true}],['unmute audio','volume_mute',{enabled:false}],
 ['open Bluetooth settings','settings_open',{page:'bluetooth'}],
 ['Hey Orbit, open wifi settings','settings_open',{page:'network-wifi'}]
]) assert.deepEqual(parse(phrase),{command,args},phrase);
assert.ok(parse('set volume to 200').question);
assert.equal(parse('take a note saying open Chrome'),null);
assert.equal(parse('do not open Chrome'),null);
assert.deepEqual(parse('please launch Spotify for me'),{app:'spotify'});
const apps=[{name:'Google Chrome',path:'chrome'},{name:'Visual Studio Code',path:'code'},{name:'Microsoft Word',path:'word'},{name:'Microsoft Word Viewer',path:'viewer'}];
assert.equal(matchApps('chrome',apps)[0].path,'chrome');
assert.equal(matchApps('vs code',apps)[0].path,'code');
assert.equal(matchApps('word',apps).length,1);
assert.equal(matchApps('unknown',apps).length,0);
assert.equal(matchApps('microsoft',apps).length,2);
console.log('Command parser and app matching checks passed');
for(let percent=0;percent<=100;percent++) {
  assert.deepEqual(parse(`Hey Orbit volume ${percent}%`),{command:'volume_set',args:{percent}});
}
assert.deepEqual(parse('Hey Orbit open Brave'),{app:'brave'});
assert.deepEqual(parse('Hey Orbit brightness 60%'),{command:'brightness_set',args:{percent:60}});
assert.deepEqual(parse('Hei Orbit setează volumul la cincizeci la sută'),{command:'volume_set',args:{percent:50}});
assert.deepEqual(parse('setează luminozitatea la douăzeci și cinci la sută'),{command:'brightness_set',args:{percent:25}});
assert.deepEqual(parse('deschide setările bluetooth'),{command:'settings_open',args:{page:'bluetooth'}});

