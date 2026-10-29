/** Actual Chrome saved-cut acceptance. Synthetic media only; absence is BLOCKED. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {startServer} from './server.mjs';

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scope='saved-cut-preview',startedAt=Date.now(),errors=[],releasePending=[];
let stage='load-playwright',folder,server,browser,page;
const redact=value=>String(value).replaceAll(server?.token??'__NO_TOKEN__','[redacted]').replace(/token=[^&\s"']+/g,'token=[redacted]');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
function step(name){stage=name;console.log(JSON.stringify({event:'BROWSER_STAGE',scope,stage,elapsedMs:Date.now()-startedAt}));}
async function uiRequest(path,action,status=200){
  const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST'),action()]);
  assert.equal(response.status(),status,`UI ${path} status`);await response.finished();return response;
}
async function edit(action,path='/api/edit'){
  const response=await uiRequest(path,action);
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
  return response;
}
async function download(control,path){const pending=page.waitForEvent('download');await control.click();await(await pending).saveAs(path);}
async function snapshot(workspace){
  const result={};
  for(const name of ['project.aivs.json','media.json','bindings.json','last-job.json','output-history.json']){
    try{result[name]=sha(await readFile(join(workspace,name)));}catch(error){if(error.code!=='ENOENT')throw error;result[name]=null;}
  }
  async function walk(relative){
    let entries;try{entries=await readdir(join(workspace,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){const path=relative+'/'+entry.name;if(entry.isDirectory())await walk(path);else if(entry.isFile())result[path]=sha(await readFile(join(workspace,path)));}
  }
  for(const directory of ['assets','exports','jobs'])await walk(directory);
  return result;
}
async function beginPreview(startSec=.1){
  await page.locator('#saved-preview-start').fill(String(startSec));
  const response=await uiRequest('/api/preview',()=>page.getByRole('button',{name:'保存したカットを確認',exact:true}).click(),202);
  const body=await response.json();assert.equal(body.status,'RUNNING');assert.match(body.id,/^[a-f0-9]{32}$/);
  const posted=response.request().postDataJSON();assert.deepEqual(Object.keys(posted).sort(),['clipId','startSec']);assert.equal(posted.startSec,startSec);
  assert.ok(response.request().headers()['x-aivs-token']===server.token,'Preview request did not use current authorization');
  return {id:body.id,posted,revision:Number(response.request().headers()['x-aivs-revision'])};
}
async function readyPreview(startSec=.1){
  const adoption=page.waitForResponse(r=>/^\/api\/preview\/[a-f0-9]{32}$/.test(new URL(r.url()).pathname),{timeout:185000});
  const media=page.waitForResponse(r=>/^\/previews\/[a-f0-9]{32}$/.test(new URL(r.url()).pathname),{timeout:185000});
  const started=await beginPreview(startSec),response=await adoption;
  assert.equal(response.status(),200);const view=await response.json();assert.equal(view.id,started.id);assert.equal(view.status,'PASS');
  assert.equal(view.report.projectRevision,started.revision);assert.equal(view.report.clipId,started.posted.clipId);
  assert.equal(view.report.wholeFileDecode,'PASS');assert.equal(view.download,'/previews/'+view.id);
  const streamed=await media;assert.ok([200,206].includes(streamed.status()));
  assert.equal(new URL(streamed.url()).pathname,view.download);
  await page.waitForFunction(()=>{const v=document.getElementById('saved-preview-video');return !v.hidden&&v.readyState>=2&&v.videoWidth>0;});
  assert.match(await page.locator('#saved-preview-interval').textContent(),/カット 0\.1–1\.0秒 \/ 全1\.0秒（保存済み）/);
  assert.match(await page.locator('#saved-preview-status').textContent(),/保存したカットを表示/);
  const properties=await page.locator('#saved-preview-video').evaluate(v=>({muted:v.muted,rate:v.playbackRate,width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
  assert.equal(properties.muted,true);assert.equal(properties.rate,1);
  assert.equal(properties.width,view.report.width);assert.equal(properties.height,view.report.height);
  assert.ok(Math.abs(properties.duration-view.report.window.durationSec)<.11);
  return {started,view,properties,mediaStatus:streamed.status()};
}
async function browserFrame(id,time){
  return page.evaluate(async({id,time})=>{
    const video=document.getElementById(id);video.pause();
    if(!video.requestVideoFrameCallback)throw new Error('BROWSER_FRAME_CALLBACK_UNAVAILABLE');
    let timeout,callback,onSeek;
    try{
      const decoded=new Promise(resolve=>{
        callback=video.requestVideoFrameCallback((_,metadata)=>resolve(metadata));
      });
      const seeked=new Promise(resolve=>{onSeek=resolve;video.addEventListener('seeked',onSeek,{once:true});});
      video.currentTime=time;
      const [metadata]=await Promise.race([Promise.all([decoded,seeked]),new Promise((_,reject)=>{
        timeout=setTimeout(()=>reject(new Error('VIDEO_FRAME_TIMEOUT')),10000);
      })]);
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      canvas.getContext('2d').drawImage(video,0,0);
      return {requestedSec:time,presentedSec:metadata.mediaTime,currentTime:video.currentTime,
        width:canvas.width,height:canvas.height,png:canvas.toDataURL('image/png').split(',')[1]};
    }finally{clearTimeout(timeout);if(callback!==undefined)video.cancelVideoFrameCallback(callback);if(onSeek)video.removeEventListener('seeked',onSeek);}
  },{id,time});
}
async function timestamps(path){
  const result=await exec('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',path]);
  return JSON.parse(result.stdout).frames.map(frame=>Number(frame.best_effort_timestamp_time));
}
async function decodedFrame(path,time){
  const times=await timestamps(path);let index=0;
  for(let i=0;i<times.length;i++)if(times[i]<=time+1e-6)index=i;
  const result=await exec('ffmpeg',['-v','error','-i',path,'-vf',`select=eq(n\\,${index})`,'-frames:v','1',
    '-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:16*1024**2});
  return {pixels:result.stdout,presentedSec:times[index]};
}
function picture(pixels,width,height){
  assert.equal(pixels.length,width*height*3);let white=0,minX=width,maxX=-1,minY=height,maxY=-1,rows=[];
  for(let y=0;y<height;y++){let visible=false;for(let x=0;x<width;x++){const at=(y*width+x)*3;
    if(Math.min(pixels[at],pixels[at+1],pixels[at+2])>210){white++;visible=true;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
    if(visible)rows.push(y);
  }
  const rowGroups=rows.length?1+rows.slice(1).filter((y,i)=>y>rows[i]+1).length:0;
  const at=(Math.floor(height/4)*width+Math.floor(width/2))*3;
  return {white,rowGroups,bounds:[minX,minY,maxX,maxY],color:[pixels[at],pixels[at+1],pixels[at+2]]};
}
function difference(a,b){
  assert.equal(a.length,b.length);let total=0,large=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;if(d>24)large++;}
  const result={meanAbsoluteDifference:total/a.length,fractionAbove24:large/a.length};
  assert.ok(result.meanAbsoluteDifference<3,JSON.stringify(result));assert.ok(result.fractionAbove24<.005,JSON.stringify(result));return result;
}
async function replay(){
  await page.locator('#saved-preview-video').evaluate(async v=>{v.pause();v.currentTime=0;await v.play();});
  await page.waitForFunction(()=>{const v=document.getElementById('saved-preview-video');return v.currentTime>.12&&!v.paused;});
  const advanced=await page.locator('#saved-preview-video').evaluate(v=>v.currentTime);
  await page.waitForFunction(()=>document.getElementById('saved-preview-video').ended);
  const result=await page.locator('#saved-preview-video').evaluate(v=>({ended:v.ended,paused:v.paused,currentTime:v.currentTime,duration:v.duration,rate:v.playbackRate}));
  assert.ok(advanced>.12);assert.equal(result.ended,true);assert.equal(result.paused,true);assert.equal(result.rate,1);
  assert.ok(Math.abs(result.currentTime-result.duration)<.05);assert.ok(result.duration<1.01);return {advanced,...result};
}
async function staleRace(kind,workspace){
  await page.locator('#clips button').first().click();
  let release,heldResolve;
  const gate=new Promise(resolve=>{release=resolve;});releasePending.push(release);
  const held=new Promise(resolve=>{heldResolve=resolve;});
  const pattern='**/api/preview/*';
  await page.route(pattern,async route=>{
    const response=await route.fetch({timeout:180000}),body=await response.body();
    heldResolve({status:response.status(),view:JSON.parse(body)});await gate;
    await route.fulfill({response,body});
  });
  const before=await snapshot(workspace),started=await beginPreview();
  let captured,heldTimer;
  try{captured=await Promise.race([held,new Promise((_,reject)=>{heldTimer=setTimeout(()=>reject(new Error('HELD_ADOPTION_TIMEOUT')),185000);heldTimer.unref();})]);}
  finally{clearTimeout(heldTimer);}
  assert.equal(captured.status,200);assert.equal(captured.view.id,started.id);assert.equal(captured.view.status,'PASS');
  assert.deepEqual(await snapshot(workspace),before,'preview must preserve saved files even while adoption is delayed');
  if(kind==='selection')await page.locator('#clips button').nth(1).click();
  else await edit(async()=>{await page.locator('#project-name').fill('Changed while preview reply waits');await page.locator('#project-name').press('Tab');});
  const afterChange=await snapshot(workspace);
  assert.equal(await page.locator('#saved-preview-video').isHidden(),true);
  const delivered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/preview/'+started.id);
  release();await(await delivered).finished();
  // Let the actual fetch/json continuation and two browser paints complete.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#saved-preview-video').getAttribute('src'),null);
  assert.equal(await page.locator('#saved-preview-video').isHidden(),true);
  assert.equal(await page.locator('#saved-preview-video').evaluate(v=>v.paused),true);
  assert.deepEqual(await snapshot(workspace),afterChange);
  await page.unroute(pattern);return {kind,delayedReportRevision:captured.view.report.projectRevision,oldResultAdopted:false};
}
async function failureState(){
  if(!page||page.isClosed())return {capture:'PAGE_NOT_OPEN'};let timer;
  try{return await Promise.race([page.evaluate(()=>{
    const get=id=>document.getElementById(id),v=get('saved-preview-video');
    return {capture:'OK',notice:(get('notice')?.textContent??'').slice(0,500),status:(get('saved-preview-status')?.textContent??'').slice(0,500),
      interval:(get('saved-preview-interval')?.textContent??'').slice(0,160),selected:document.querySelector('#clips .selected')?.textContent,
      video:v?{hidden:v.hidden,paused:v.paused,currentTime:v.currentTime,readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,errorCode:v.error?.code??null}:null};
  }),new Promise(resolve=>{timer=setTimeout(()=>resolve({capture:'TIMED_OUT'}),1000);})]);}
  catch(error){return {capture:'FAILED',reason:redact(error.message).slice(0,300)};}finally{clearTimeout(timer);}
}

try{
  step('load-playwright');let playwright,playwrightVersion;
  try{playwright=await import('playwright');playwrightVersion=createRequire(import.meta.url)('playwright/package.json').version;}
  catch{if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');
    const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/aivs-browser.js');
    try{playwright=require('playwright');playwrightVersion=require('playwright/package.json').version;}catch{throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');}}
  step('require-browser-executable');const executablePath=process.env.AIVS_BROWSER_EXECUTABLE||playwright.chromium.executablePath();
  if(!existsSync(executablePath))throw new Error('BROWSER_EXECUTABLE_UNAVAILABLE');
  step('generate-public-fixture');folder=await mkdtemp(join(tmpdir(),'aivs-browser-preview-'));
  const source=join(folder,'blue-red.mp4'),workspace=join(folder,'workspace');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1',
    '-f','lavfi','-i','color=c=red:s=320x180:r=30:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
    '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-preset','ultrafast','-c:a','aac','-t','2',source]);
  const original=await readFile(source);
  step('start-editor');server=await startServer({workspace,port:0});
  browser=await playwright.chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
  step('import-trim-and-save-caption');await edit(()=>page.locator('#video-files').setInputFiles(source),'/api/import');
  await page.locator('#trim-start').fill('0.5');await page.locator('#duration').fill('1');await page.locator('#caption').fill('日本語の字幕\n確認テスト');
  await edit(()=>page.locator('#apply').click());
  await edit(()=>page.locator('#add-clip').click());await page.locator('#clips button').first().click();
  const saved=await json(join(workspace,'project.aivs.json'));
  assert.equal(saved.project.timeline[0].sourceInSec,.5);assert.equal(saved.project.timeline[0].durationSec,1);
  assert.equal(saved.project.timeline[0].effects[0].parameters.text,'日本語の字幕\n確認テスト');assert.equal(saved.project.timeline.length,2);
  assert.match(await page.locator('#source-preview-label').textContent(),/素材を確認/);
  const before=await snapshot(workspace);
  step('preview-real-saved-cut');const preview=await readyPreview();
  assert.deepEqual(await snapshot(workspace),before);assert.deepEqual(await readFile(source),original);
  assert.deepEqual(preview.view.report.sourceIdentities,saved.project.sourceRefs);
  assert.deepEqual(preview.view.report.window,{startSec:.1,endSec:1,durationSec:.9,totalSec:1,sourceInSec:.6,sourceDurationSec:.9,speed:1});
  const previewDownload=await page.request.get(server.url+preview.view.download+'?token='+server.token);
  assert.equal(previewDownload.status(),200);const previewBytes=await previewDownload.body();assert.equal(sha(previewBytes),preview.view.report.outputSha256);
  const previewPath=join(folder,'preview.mp4');await writeFile(previewPath,previewBytes);
  await exec('ffmpeg',['-v','error','-xerror','-i',previewPath,'-f','null','-']);
  step('replay-to-bounded-end');const replays=[await replay(),await replay()];
  step('render-and-download-completed-video');await uiRequest('/api/render',()=>page.locator('#render').click(),202);
  await page.locator('#download').waitFor({state:'visible',timeout:185000});
  const qaButton=page.getByRole('button',{name:'検査記録を保存',exact:true});await qaButton.waitFor();
  const finalPath=join(folder,'final.mp4'),qaPath=join(folder,'qa.json');
  await download(page.locator('#download'),finalPath);await download(qaButton,qaPath);
  const qa=await json(qaPath),finalBytes=await readFile(finalPath);assert.equal(sha(finalBytes),qa.sha256);
  assert.equal(qa.whole_file_decode_checked,true);assert.deepEqual(qa.captionRasters,preview.view.report.captionRasters);
  await exec('ffmpeg',['-v','error','-xerror','-i',finalPath,'-f','null','-']);
  step('compare-intrinsic-browser-frames');const samples=[],raster=preview.view.report.captionRasters[0];
  assert.equal(raster.lineCount,2);assert.equal(raster.glyphCoverage,'CMAP_VERIFIED');
  for(const [index,time,channel] of [[0,.15,2],[1,.7,0]]){
    const captured=await browserFrame('saved-preview-video',time);
    const png=join(folder,`preview-frame-${index}.png`);await writeFile(png,Buffer.from(captured.png,'base64'));
    const decoded=await exec('ffmpeg',['-v','error','-i',png,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:16*1024**2});
    const own=await decodedFrame(previewPath,captured.presentedSec),exported=await decodedFrame(finalPath,.1+captured.presentedSec);
    assert.ok(Math.abs(own.presentedSec-captured.presentedSec)<=1/preview.view.report.fps+1e-6);
    assert.ok(Math.abs(exported.presentedSec-(.1+captured.presentedSec))<=1/preview.view.report.fps+1e-6);
    const actual=picture(decoded.stdout,captured.width,captured.height),expected=picture(exported.pixels,captured.width,captured.height);
    assert.ok(actual.color[channel]>220);assert.ok(expected.color[channel]>220);assert.ok(actual.white>200);assert.equal(actual.rowGroups,2);assert.equal(expected.rowGroups,2);
    assert.ok(actual.bounds[0]>=raster.safeInsets[0]&&actual.bounds[2]<captured.width-raster.safeInsets[0]);
    assert.ok(actual.bounds[1]>=raster.safeInsets[1]&&actual.bounds[3]<captured.height-raster.safeInsets[1]);
    assert.ok(actual.bounds.every((value,i)=>Math.abs(value-expected.bounds[i])<=2));
    samples.push({requestedPreviewSec:time,browserPreviewPtsSec:captured.presentedSec,previewDecodedPtsSec:own.presentedSec,
      matchedExportSec:.1+captured.presentedSec,exportPtsSec:exported.presentedSec,
      browserVersusPreview:difference(decoded.stdout,own.pixels),browserVersusExport:difference(decoded.stdout,exported.pixels),
      actualCaption:actual,exportCaption:expected});
  }
  step('delayed-adoption-selection-and-revision');const races=[];
  for(const kind of ['selection','revision'])races.push(await staleRace(kind,workspace));
  step('save-undo-redo-and-reopen');
  for(const action of ['undo','redo']){await edit(()=>page.locator('#'+action).click(),'/api/'+action);assert.equal(await page.locator('#saved-preview-video').getAttribute('src'),null);}
  const savedPath=join(folder,'reopened.aivs.json');await download(page.locator('#save-project'),savedPath);
  await uiRequest('/api/relink/prepare',()=>page.locator('#open-project').setInputFiles(savedPath));
  await page.waitForFunction(()=>{const open=document.getElementById('source-relink-open');return open&&!open.disabled;});
  await uiRequest('/api/relink/open',()=>page.locator('#source-relink-open').click());await page.locator('#source-relink').waitFor({state:'hidden'});
  assert.equal(await page.locator('#saved-preview-video').getAttribute('src'),null);
  const reopened=await json(join(workspace,'project.aivs.json')),preserved=await snapshot(workspace);
  assert.deepEqual(reopened.project.audioClips,saved.project.audioClips);assert.deepEqual(reopened.project.audioBuses,saved.project.audioBuses);
  step('preview-reopened-revision');const current=await readyPreview();assert.equal(current.view.report.projectRevision,reopened.project.revision);
  assert.deepEqual(await snapshot(workspace),preserved);assert.deepEqual(await readFile(source),original);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_SYNTHETIC_BROWSER',scope,runtime:{node:process.version,playwright:playwrightVersion,browser:browser.version()},
    inputSha256:sha(original),projectSha256:before['project.aivs.json'],previewSha256:sha(previewBytes),outputSha256:sha(finalBytes),
    previewReport:preview.view.report,mediaStatus:preview.mediaStatus,properties:preview.properties,replays,samples,races,
    currentRevision:current.view.report.projectRevision,wholeFileDecode:'PASS',sourceAndSessionPreservation:true,
    existingOutputAndHistoryPreservation:true,frameToleranceSec:1/preview.view.report.fps,
    pixelTolerance:{meanAbsoluteDifference:3,fractionAbove24:.005,captionBoundsPixels:2},
    physicalDevice:'NOT_RUN',audioMixPreviewParity:'NOT_CLAIMED',subframePixelIdentity:'NOT_CLAIMED'}));
}catch(error){
  const blocked=/UNAVAILABLE/.test(error.message);
  console.error(JSON.stringify({status:blocked?'BLOCKED':'FAIL',scope,stage,elapsedMs:Date.now()-startedAt,
    reason:redact(error.message).slice(0,2000),stack:redact(error.stack??'').slice(0,2500),
    pageErrorCount:errors.length,pageErrors:errors.slice(0,10).map(message=>redact(message).slice(0,500)),
    ui:JSON.parse(redact(JSON.stringify(await failureState())))}));process.exitCode=blocked?2:1;
}finally{
  for(const release of releasePending)release();
  if(browser)await browser.close();if(server)await server.close();if(folder)await rm(folder,{recursive:true,force:true});
}
