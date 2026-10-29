/** Actual Chromium acceptance. Missing browser exits BLOCKED; never a fake pass. */
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {startServer} from './server.mjs';
const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');let folder,server,browser,page;
const errors=[],startedAt=Date.now();let stage='load-playwright';
const redact=value=>String(value).replaceAll(server?.token??'__NO_TOKEN__','[redacted]');
function step(name){stage=name;console.log(JSON.stringify({event:'BROWSER_STAGE',scope:'existing-editor',stage,elapsedMs:Date.now()-startedAt}));}
async function failureState(){
  if(!page||page.isClosed())return {capture:'PAGE_NOT_OPEN'};
  let timer;
  try{return await Promise.race([page.evaluate(()=>{
    const get=id=>document.getElementById(id),text=id=>(get(id)?.textContent??'').slice(0,500),value=id=>(get(id)?.value??'').slice(0,64);
    const video=id=>{const v=get(id);return v?{currentTime:v.currentTime,readyState:v.readyState,networkState:v.networkState,
      paused:v.paused,ended:v.ended,width:v.videoWidth,height:v.videoHeight,errorCode:v.error?.code??null,errorMessage:(v.error?.message??'').slice(0,300)}:null;};
    return {capture:'OK',notice:text('notice'),cameraOptions:get('camera')?.options.length??0,
      selectedCamera:(get('camera')?.selectedOptions[0]?.textContent??'').slice(0,160),duration:value('duration'),
      videoInputFileCount:get('video-files')?.files.length??0,bgmInputFileCount:get('bgm-file')?.files.length??0,
      undoDisabled:get('undo')?.disabled??null,redoDisabled:get('redo')?.disabled??null,
      firstCut:{analyseDisabled:get('first-cut-analyse')?.disabled??null,confirmPresent:!!get('first-cut-confirm'),
        confirmChecked:get('first-cut-confirm')?.checked??null,applyDisabled:get('first-cut-apply')?.disabled??null,
        previewButtons:document.querySelectorAll('#first-cut ol button').length,preview:video('first-cut-preview')},
      audio:{savePresent:!!get('audio-save'),removePresent:!!get('audio-remove'),start:value('audio-startSec'),end:value('audio-endSec')},
      renderState:text('render-state'),downloadVisible:!!get('download')&&!get('download').hidden,output:video('output')};
  }),new Promise(resolve=>{timer=setTimeout(()=>resolve({capture:'TIMED_OUT'}),1000);})]);}
  catch(error){return {capture:'FAILED',reason:redact(error.message).slice(0,300)};}
  finally{clearTimeout(timer);}
}
try{
  step('load-playwright');
  let playwright,playwrightVersion;
  try{playwright=await import('playwright');playwrightVersion=createRequire(import.meta.url)('playwright/package.json').version;}
  catch{if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');
    const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/aivs-browser.js');
    try{playwright=require('playwright');playwrightVersion=require('playwright/package.json').version;}catch{throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');}}
  const executablePath=process.env.AIVS_BROWSER_EXECUTABLE||playwright.chromium.executablePath();
  step('require-browser-executable');
  if(!existsSync(executablePath))throw new Error('BROWSER_EXECUTABLE_UNAVAILABLE');
  step('generate-first-video');
  folder=await mkdtemp(join(tmpdir(),'aivs-browser-'));
  const source=join(folder,'synthetic.mp4');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=2',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',source]);
  step('start-server-and-browser');server=await startServer({workspace:join(folder,'project-data'),port:0});
  browser=await playwright.chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1280,height:1000}});
  step('open-editor');
  page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);
  step('import-first-video');
  await page.locator('#video-files').setInputFiles(source);
  await page.locator('#clips button').first().waitFor();
  const clear=join(folder,'synthetic-clear.mp4');
  step('generate-second-video');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=2','-c:v','libx264',clear]);
  step('import-second-video');await page.locator('#video-files').setInputFiles(clear);
  step('wait-second-video-import');
  await page.waitForFunction(()=>document.querySelectorAll('#camera option').length===2&&document.getElementById('video-files').value==='');
  step('configure-manual-sync');await page.locator('#camera').selectOption({index:1});await page.locator('#sync-offset').fill('0');await page.locator('#sync-confirm').check();
  await page.locator('#apply-sync').click();step('wait-sync-saved');await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
  step('analyse-first-cut');await page.locator('#first-cut-analyse').click();await page.locator('#first-cut-confirm').waitFor({timeout:60000});
  step('play-first-cut-preview');
  assert.equal(await page.locator('#first-cut-apply').isDisabled(),true);await page.locator('#first-cut ol button').first().click();
  step('wait-first-cut-preview-advance');await page.waitForFunction(()=>document.getElementById('first-cut-preview').currentTime>.1);
  step('confirm-and-apply-first-cut');await page.locator('#first-cut-confirm').check();await page.locator('#first-cut-apply').click();
  step('wait-first-cut-applied');
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み'&&document.getElementById('first-cut-confirm')===null);
  assert.equal(await page.locator('#camera option:checked').textContent(),'synthetic-clear.mp4');
  // First-cut keeps the original soundtrack independent of its replacement video.
  // Explicitly fit that soundtrack before shortening the video; never expect a silent truncation.
  const beforeAudioTrim=JSON.parse(await readFile(join(folder,'project-data','project.aivs.json'),'utf8'));
  const originalSourceAudio=beforeAudioTrim.project.audioClips.find(audio=>audio.bus==='source');
  assert.ok(originalSourceAudio);assert.equal(originalSourceAudio.endSec,2);
  assert.equal(beforeAudioTrim.project.sourceRefs.find(source=>source.assetId===originalSourceAudio.assetId).sha256,sha(await readFile(source)));
  step('explicitly-trim-preserved-original-audio');await page.getByRole('button',{name:/元音声 · synthetic\.mp4/}).click();
  await page.locator('#audio-endSec').fill('1');await page.locator('#audio-save').click();
  step('wait-original-audio-trim-saved');
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み'&&Number(document.getElementById('audio-endSec').value)===1);
  const afterAudioTrim=JSON.parse(await readFile(join(folder,'project-data','project.aivs.json'),'utf8'));
  const expectedAudio=beforeAudioTrim.project.audioClips.map(audio=>audio.id===originalSourceAudio.id?{...audio,endSec:1}:audio);
  assert.deepEqual(afterAudioTrim.project.audioClips,expectedAudio);
  assert.deepEqual(afterAudioTrim.project.audioBuses,beforeAudioTrim.project.audioBuses);
  assert.deepEqual(afterAudioTrim.project.sourceRefs,beforeAudioTrim.project.sourceRefs);
  assert.deepEqual(afterAudioTrim.project.timeline,beforeAudioTrim.project.timeline);
  step('edit-trim-and-caption');await page.locator('#duration').fill('1');await page.locator('#caption').fill('SYNTHETIC CAPTION');
  await page.getByRole('button',{name:'このカットを保存',exact:true}).click();
  step('wait-trim-saved');await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
  step('undo-trim');await page.getByRole('button',{name:'戻す',exact:true}).click();
  step('wait-undo-duration');
  await page.waitForFunction(()=>Number(document.getElementById('duration').value)===2);
  step('redo-trim');await page.getByRole('button',{name:'やり直す',exact:true}).click();
  step('wait-redo-duration');
  await page.waitForFunction(()=>Number(document.getElementById('duration').value)===1);
  step('download-saved-project');const projectDownload=page.waitForEvent('download');await page.getByRole('button',{name:'プロジェクト保存',exact:true}).click();
  const project=await projectDownload,projectPath=join(folder,'downloaded-project.json');await project.saveAs(projectPath);
  assert.equal(JSON.parse(await readFile(projectPath,'utf8')).project.timeline[0].durationSec,1);
  assert.deepEqual(JSON.parse(await readFile(projectPath,'utf8')).project.audioClips,expectedAudio);
  step('reload-saved-project');await page.reload();await page.waitForFunction(()=>Number(document.getElementById('duration').value)===1);
  const music=join(folder,'synthetic-bgm.wav');
  step('generate-bgm');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.4','-c:a','pcm_s16le',music]);
  step('import-bgm');await page.locator('#bgm-file').setInputFiles(music);
  step('wait-bgm-import');
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み'&&document.getElementById('bgm-file').value==='');
  step('edit-bgm-timing-and-fades');await page.getByRole('button',{name:/BGM · synthetic-bgm/}).click();
  await page.locator('#audio-startSec').fill('0.2');await page.locator('#audio-endSec').fill('0.9');
  await page.locator('#audio-fadeInSec').fill('0.15');await page.locator('#audio-fadeOutSec').fill('0.2');
  await page.locator('#audio-save').click();
  step('wait-bgm-edit-saved');await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み'&&Number(document.getElementById('audio-startSec').value)===.2);
  step('undo-bgm-edit');await page.getByRole('button',{name:'戻す',exact:true}).click();
  step('wait-bgm-selection-cleared');
  await page.waitForFunction(()=>document.getElementById('audio-save')===null);
  step('redo-bgm-edit');await page.getByRole('button',{name:'やり直す',exact:true}).click();
  step('wait-bgm-redo-saved');
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
  assert.equal(await page.locator('#audio-remove').count(),0);
  step('reload-bgm-edits');await page.reload();await page.getByRole('button',{name:/BGM · synthetic-bgm/}).click();
  assert.equal(await page.locator('#audio-startSec').inputValue(),'0.2');
  assert.equal(await page.locator('#audio-fadeOutSec').inputValue(),'0.2');
  step('render-output');await page.getByRole('button',{name:'完成動画を作る',exact:true}).click();
  await page.locator('#download').waitFor({state:'visible',timeout:60000});
  await page.getByRole('button',{name:'検査記録を保存',exact:true}).waitFor();
  step('download-output-qa');const qaDownload=page.waitForEvent('download');await page.getByRole('button',{name:'検査記録を保存',exact:true}).click();
  const qaPath=join(folder,'inspection.json');await(await qaDownload).saveAs(qaPath);
  assert.equal(JSON.parse(await readFile(qaPath,'utf8')).inspection.schema,'aivs-output-inspection-v1');
  step('play-output');const result=await page.evaluate(async()=>{const v=document.getElementById('output');await v.play();const a=v.currentTime;
    await new Promise(resolve=>setTimeout(resolve,400));return {advanced:v.currentTime>a,width:v.videoWidth};});
  assert.equal(result.advanced,true);assert.ok(result.width>0);
  step('download-output');const download=page.waitForEvent('download');await page.locator('#download').click();
  const file=await download,path=join(folder,'browser-output.mp4');await file.saveAs(path);
  step('decode-and-verify-output');await exec('ffmpeg',['-v','error','-xerror','-i',path,'-f','null','-']);assert.deepEqual(errors,[]);
  const output=await readFile(path),qa=await readFile(qaPath);
  assert.equal(JSON.parse(qa).sha256,sha(output),'downloaded output must match its QA record');
  console.log(JSON.stringify({status:'PASS_SYNTHETIC_BROWSER',scope:'existing-editor',
    runtime:{node:process.version,playwright:playwrightVersion,browser:browser.version()},
    inputs:{videoSha256:sha(await readFile(source)),clearVideoSha256:sha(await readFile(clear)),bgmSha256:sha(await readFile(music))},
    savedProjectSha256:sha(await readFile(projectPath)),qaSha256:sha(qa),outputSha256:sha(output),
    playback:result,wholeFileDecode:'PASS',bytes:output.length,physicalDevice:'NOT_RUN'}));
}catch(error){const blocked=/UNAVAILABLE/.test(error.message),reason=redact(error.message).slice(0,2000),stack=redact(error.stack??'').slice(0,3000);
  const ui=JSON.parse(redact(JSON.stringify(await failureState())));
  console.error(JSON.stringify({status:blocked?'BLOCKED':'FAIL',scope:'existing-editor',stage,elapsedMs:Date.now()-startedAt,
    reason,sourceLocation:stack.match(/browser-acceptance\.mjs:\d+:\d+/)?.[0]??null,stack,
    pageErrorCount:errors.length,pageErrors:errors.slice(0,10).map(message=>redact(message).slice(0,500)),ui}));process.exitCode=blocked?2:1;}
finally{if(browser)await browser.close();if(server)await server.close();if(folder)await rm(folder,{recursive:true,force:true});}
