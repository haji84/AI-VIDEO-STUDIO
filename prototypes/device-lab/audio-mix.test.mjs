import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Script} from 'node:vm';
const html=readFileSync(new URL('./AUDIO_MIX_LAB.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('inline JavaScript parses',()=>{assert.ok(script);new Script(script);});
test('network requests and external scripts blocked',()=>{
 assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
 assert.doesNotMatch(html,/<script[^>]*src\s*=/i);
 assert.doesNotMatch(html,/https?:\/\//i);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|WebSocket|EventSource/i);
});
test('input and controls exist',()=>{
 for(const id of ['sourceFile','bgmFile','seFile','narrationFile','originalTrack','bgmGain','seGain','narrationGain','mixExport','outputPlayer','saveOutput','saveJSON','replay'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('four audio buses use on-device Web Audio graph',()=>{
 assert.match(script,/createMediaElementSource\(v\)/);
 assert.match(script,/createMediaStreamDestination\(\)/);
 assert.match(script,/createBufferSource\(\)/);
 assert.match(script,/const outputs=\{bgm:'bgmFile',se:'seFile',narration:'narrationFile'\}/);
 assert.match(script,/originalTrack.*checked\?1:0/);
 assert.match(script,/new MediaStream\(\[videoTrack,audioTrack\]\)/);
});
test('SE scheduled later and BGM looped',()=>{
 assert.match(script,/bus==='se'\?1\.0/);
 assert.match(script,/node\.loop=bus==='bgm'/);
 assert.match(script,/bus==='narration'\?\.3:0/);
});
test('MP4 capability guard and failure reasons',()=>{
 assert.match(script,/MediaRecorder\.isTypeSupported\(type\)/);
 assert.match(script,/MP4_RECORDING_UNSUPPORTED/);
 assert.match(script,/AUDIO_MIX_EXPORT_FAILED/);
 assert.match(script,/AUDIO_NOT_READY/);
});
test('short fixed clip and memory budget',()=>{
 assert.match(script,/const MAX_CLIP_SEC=4/);
 assert.match(script,/const MAX_FILE_AUDIO_BYTES=12\*1024\*1024/);
 assert.match(script,/decoded\.duration>90/);
 assert.match(script,/BACKGROUND_INTERRUPTED/);
});
test('source and supplemental audio local only',()=>{
 assert.match(script,/URL\.createObjectURL\(f\)/);
 assert.match(script,/decoder\.decodeAudioData\(await f\.arrayBuffer\(\)\)/);
 assert.doesNotMatch(script,/FileSystemWritableFileStream|navigator\.mediaDevices\.getUserMedia/);
});
test('result does not claim native editing, AI TTS, or audio verified',()=>{
 assert.match(script,/BROWSER_ONLY_4SEC_NOT_NATIVE/);
 assert.match(script,/No generated Japanese TTS audio/);
 assert.match(script,/RECORDED_AUDIO_CONTENT_REQUIRES_LISTENING/);
 assert.match(script,/NOT_VERIFIED_ON_IOS/);
 assert.match(script,/REPLAY_NOT_CONFIRMED/);
});
test('output replay separate from created Blob',()=>{
 assert.match(script,/status:'SOURCE_AUDIO_MIX_MP4_CREATED'/);
 assert.match(script,/status:success\?'REPLAY_ADVANCED':'REPLAY_NOT_CONFIRMED'/);
 assert.match(script,/URL\.revokeObjectURL\(outputURL\)/);
});
test('inputs locked for duration of export',()=>{
 assert.match(script,/guardedInputs\.forEach\(id=>\$\(id\)\.disabled=true\)/);
 assert.match(script,/guardedInputs\.forEach\(id=>\$\(id\)\.disabled=false\)/);
});
test('source-only mode ignores selected BGM and narration files',()=>{
 assert.match(html,/id="sourceOnlyExport"/);
 assert.match(script,/exportMix\(true\)/);
 assert.match(script,/!sourceOnly&&\$\(inputId\)\.files/);
 assert.match(script,/if\(!sourceOnly\)for\(const bus of Object\.keys\(outputs\)\)/);
 assert.match(script,/original\.gain\.value=sourceOnly\|\|\$\('originalTrack'\)\.checked\?1:0/);
 assert.match(script,/extraTracks:sourceOnly\?\[\]/);
});
test('device reports source and output RMS without promising mux content',()=>{
 assert.match(script,/createAnalyser\(\)/);
 assert.match(script,/getFloatTimeDomainData/);
 assert.match(script,/originalSignalPeakRms/);
 assert.match(script,/RMS is a signal observation, not proof/);
});
test('acceptance requires independent replay and four explicit user checks',()=>{
 for(const id of ['checkSource','checkCaption','checkAudio','checkFiles','acceptanceStatus'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(script,/USER_REPORTED_BROWSER_SOURCE_AUDIO_CAPTION_PASS/);
 assert.match(script,/result\.export\.mode==='SOURCE_ONLY'&&result\.replay\.status==='REPLAY_ADVANCED'/);
 assert.match(script,/Object\.values\(checks\)\.every\(Boolean\)/);
});
test('source-only mode excludes supplementary BGM/SE/narration even if selected',()=>{
 assert.match(html,/id="sourceOnlyExport"/);
 assert.match(script,/exportMix\(true\)/);
 assert.match(script,/!sourceOnly&&\$\(inputId\)\.files/);
 assert.match(script,/if\(!sourceOnly\)for\(const bus of Object\.keys\(outputs\)\)/);
 assert.match(script,/original\.gain\.value=sourceOnly\|\|\$\('originalTrack'\)\.checked\?1:0/);
 assert.match(script,/extraTracks:sourceOnly\?\[\]/);
});
test('local audio signal observability does not auto assert success',()=>{
 assert.match(script,/createAnalyser\(\)/);
 assert.match(script,/getFloatTimeDomainData/);
 assert.match(script,/originalSignalPeakRms/);
 assert.match(script,/RMS is a signal observation, not proof/);
});
test('real-source audio and caption require playback and owner verification',()=>{
 for(const id of ['checkSource','checkCaption','checkAudio','checkFiles','acceptanceStatus']) assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(script,/status:success\?'REPLAY_ADVANCED':'REPLAY_NOT_CONFIRMED'/);
 assert.match(script,/USER_REPORTED_BROWSER_SOURCE_AUDIO_CAPTION_PASS/);
 assert.match(script,/result\.export\.mode==='SOURCE_ONLY'&&result\.replay\.status==='REPLAY_ADVANCED'/);
 assert.match(script,/Object\.values\(checks\)\.every\(Boolean\)/);
});
