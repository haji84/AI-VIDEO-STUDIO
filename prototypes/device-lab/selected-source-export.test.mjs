import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
const html=readFileSync(new URL('./DEVICE_LAB.html',import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('inline JS syntax compiles',()=>{assert.ok(inline);new Script(inline);});
test('does not call outbound APIs or reference remote assets',()=>{
 assert.doesNotMatch(html,/<script\s+[^>]*src\s*=/i);
 assert.doesNotMatch(html,/https?:\/\//i);
 assert.doesNotMatch(inline,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|sendBeacon\s*\(/i);
});
test('CSP blocks external connections',()=>{
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/object-src 'none'/);
 assert.match(html,/form-action 'none'/);
});
test('selected source controls are wired',()=>{
 for(const id of ['videoFile','video','sourceCanvas','exportSelected','sourceOutput','sourceDownload','verifySourceOutput','exportOutcome']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(inline,/sourceCtx\.drawImage\(v,/);
 assert.match(inline,/sourceCanvas\.captureStream\(24\)/);
 assert.match(inline,/new MediaRecorder\(stream/);
});
test('MP4 codec support checked',()=>{
 assert.match(inline,/MediaRecorder\.isTypeSupported\(type\)/);
 assert.match(inline,/video\/mp4/);
 assert.match(inline,/status:'UNSUPPORTED'/);
});
test('safe length, silent output and scope disclosed',()=>{
 assert.match(html,/最大4秒/);
 assert.match(html,/音声なし/);
 assert.match(inline,/audio:'NOT_INCLUDED'/);
 assert.match(inline,/sourceTimeAdvanceSeconds/);
});
test('independent replay status recorded',()=>{
 assert.match(inline,/SOURCE_CAPTION_MP4_CREATED/);
 assert.match(inline,/REPLAY_ADVANCED/);
 assert.match(inline,/REPLAY_NOT_CONFIRMED/);
});
test('media references use local object URL only',()=>{
 assert.match(inline,/URL\.createObjectURL\(file\)/);
 assert.doesNotMatch(inline,/FileSystemWritableFileStream/);
 assert.match(html,/aivs-selected-video-test\.mp4/);
});