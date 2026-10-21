import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const html=readFileSync(new URL('./AUDIO_COMPAT_LAB.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('inline JS compiles',()=>{assert.ok(js);new Script(js)});
test('no outbound media requests or external script resources',()=>{
 assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
 assert.doesNotMatch(html,/https?:\/\/|<script[^>]+src\s*=|<form\b/i);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|WebSocket|EventSource/i);
});
test('iOS defaults to local compatibility mode',()=>{
 assert.match(html,/id="compatAudio"/);
 assert.match(js,/\$\('compatAudio'\)\.checked=result\.browser\.family==='iOS'/);
 assert.match(js,/sourceOnly&&\$\('compatAudio'\)\.checked/);
});
test('local original MP4 decoder has a hard memory ceiling',()=>{
 assert.match(js,/MAX_SOURCE_AUDIO_DECODE_BYTES=96\*1024\*1024/);
 assert.match(js,/decodeAudioData\(await file\.arrayBuffer\(\)\)/);
 assert.match(js,/SOURCE_AUDIO_DECODE_LIMIT_96MIB/);
 assert.match(js,/SOURCE_AUDIO_DECODE_FAILED_USE_NATIVE_BACKEND/);
});
test('decoded audio routed as an AudioBufferSource',()=>{
 assert.match(js,/ctx\.createBufferSource\(\)/);
 assert.match(js,/sourceNode\.connect\(original\)/);
 assert.match(js,/sourceNode\.start\(startAt,/);
 assert.match(js,/v\.muted=bufferedOriginal/);
 assert.match(js,/await resetToStart\(v\)/);
});
test('fail closed if requested original or mixed output is silent',()=>{
 assert.match(js,/FIRST_FOUR_SECONDS_SOURCE_AUDIO_SILENT/);
 assert.match(js,/SOURCE_ORIGINAL_AUDIO_SIGNAL_ZERO/);
 assert.match(js,/SOURCE_OUTPUT_AUDIO_SIGNAL_ZERO/);
 assert.match(js,/originalPeakRms<SOURCE_SIGNAL_RMS_FLOOR/);
 assert.match(js,/outputPeakRms<SOURCE_SIGNAL_RMS_FLOOR/);
});
test('capture explicit audio source mode and metrics',()=>{
 for(const x of ['audioSourceMode','sourceBufferPeakRms','originalSignalPeakRms','outputSignalPeakRms']) assert.match(js,new RegExp(x));
 assert.match(js,/containerCodecCompatibility:'NOT_VERIFIED_ON_IOS'/);
});
test('user acceptance still requires replay, audible signal and 4 checks',()=>{
 assert.match(js,/result\.export\.originalSignalPeakRms>=SOURCE_SIGNAL_RMS_FLOOR/);
 assert.match(js,/result\.export\.outputSignalPeakRms>=SOURCE_SIGNAL_RMS_FLOOR/);
 assert.match(js,/result\.replay\.status==='REPLAY_ADVANCED'/);
 assert.match(js,/Object\.values\(checks\)\.every\(Boolean\)/);
});
test('source only ignores additional BGM SE and narration',()=>{
 assert.match(js,/!sourceOnly&&\$\(inputId\)\.files/);
 assert.match(js,/if\(!sourceOnly\)for\(const bus of Object\.keys\(outputs\)\)/);
 assert.match(js,/extraTracks:sourceOnly\?\[\]/);
});
test('source is a read-only local Blob, output is a separate file',()=>{
 assert.match(js,/URL\.createObjectURL\(f\)/);
 assert.match(js,/new MediaStream\(\[videoTrack,audioTrack\]\)/);
 assert.match(html,/MP4を保存/);
 assert.match(js,/result\.export=\{status:'AUDIO_MIX_EXPORT_FAILED'/);
});