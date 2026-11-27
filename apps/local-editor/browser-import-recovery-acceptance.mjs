/** Two synthetic uploads -> retained retry -> numerical first cut -> actual MP4. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {startServer} from './server.mjs';

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=resolve(import.meta.dirname,'../..'),scope='import-recovery-first-cut';
const previous={PATH:process.env.PATH,AIVS_FFMPEG_DIR:process.env.AIVS_FFMPEG_DIR};
const tokens=[],pageErrors=[];let folder,server,browser,page,stage='dependencies',uploads=0,retries=0;
const step=value=>{stage=value;console.log(JSON.stringify({event:'BROWSER_STAGE',scope,stage}));};
const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function visit(){
 page=await browser.newPage({viewport:{width:1280,height:1000}});tokens.push(server.token);
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('request',request=>{if(request.method()!=='POST')return;const path=new URL(request.url()).pathname;if(path==='/api/import')uploads++;if(path==='/api/import/retry')retries++;});
 await page.goto(server.url);await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
}
async function mutation(path,action,status=200){
 const pending=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path);
 await action();const response=await pending;assert.equal(response.status(),status,`UI ${path}`);await response.finished();return response;
}
async function saved(){await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');}
async function download(control,path){const pending=page.waitForEvent('download');await control.click();await(await pending).saveAs(path);}
async function playOutput(){
 const player=page.locator('#output');
 await player.waitFor({state:'visible'});
 await page.waitForFunction(()=>{const v=document.getElementById('output');return v.readyState>=2&&v.videoWidth>0;});
 await player.evaluate(v=>v.play());
 await page.waitForFunction(()=>document.getElementById('output').currentTime>.1);
 await page.waitForFunction(()=>{const v=document.getElementById('output');return v.ended||v.error;});
 const playback=await player.evaluate(v=>({advanced:v.currentTime>.1,ended:v.ended,width:v.videoWidth,height:v.videoHeight,durationSec:v.duration}));
 assert.equal(playback.ended,true,'output playback did not finish');
 return playback;
}

try{
 let playwright;
 try{playwright=await import('playwright');}
 catch{if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');playwright=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/aivs-browser.js')('playwright');}
 const executablePath=process.env.AIVS_BROWSER_EXECUTABLE||playwright.chromium.executablePath();
 const python=process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3');
 const tools=JSON.parse((await exec(python,['-m','engine.media_tools','--resolve'],{cwd:root})).stdout);
 folder=await mkdtemp(join(tmpdir(),'aivs-import-recovery-'));const workspace=join(folder,'data');
 step('generate-two-owned-synthetic-videos');
 await exec(tools.ffmpeg,['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=12:d=4','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=4','-c:v','libx264','-c:a','aac','-shortest',join(folder,'master.mp4')]);
 await exec(tools.ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=12:d=4','-f','lavfi','-i','sine=frequency=660:sample_rate=16000:duration=4','-c:v','libx264','-c:a','aac','-shortest',join(folder,'clear.mp4')]);
 const originals=await Promise.all(['master.mp4','clear.mp4'].map(name=>readFile(join(folder,name))));
 browser=await playwright.chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 // Keep Node available for the common project validator, but remove media tools
 // from PATH. The application must use its explicit media-tool configuration.
 process.env.PATH=dirname(process.execPath);process.env.AIVS_FFMPEG_DIR=join(folder,'unavailable-tools');
 server=await startServer({workspace,port:0});
 await visit();
 step('upload-failures-retain-completed-bytes');
 for(const [index,name] of ['master.mp4','clear.mp4'].entries()){
  await mutation('/api/import',()=>page.locator('#video-files').setInputFiles(join(folder,name)),400);
  await page.waitForFunction(count=>document.querySelectorAll('#pending-imports button').length===count,index+1);
  const notice=await page.locator('#notice').textContent();
  assert.match(notice,/FFMPEG_TOOLCHAIN_INCOMPLETE/);
  assert.match(notice,/を確認してください。/);
 }
 assert.equal(uploads,2);const pending=await json(join(workspace,'pending-imports.json'));
 assert.deepEqual(pending.map(p=>p.sha256),originals.map(sha));
 assert.equal((await json(join(workspace,'project.aivs.json'))).project.sourceRefs.length,0);
 step('restart-and-retry-without-media-resend');
 await page.close();await server.close();server=undefined;process.env.AIVS_FFMPEG_DIR=dirname(tools.ffmpeg);
 server=await startServer({workspace,port:0});await visit();
 assert.equal(await page.locator('#pending-imports button').count(),2);
 for(const remaining of [1,0]){
  await mutation('/api/import/retry',()=>page.locator('#pending-imports button').first().click());await saved();
  assert.equal(await page.locator('#pending-imports button').count(),remaining);
 }
 assert.equal(uploads,2);assert.equal(retries,2);assert.equal(await page.locator('#camera option').count(),2);
 const imported=await json(join(workspace,'project.aivs.json'));
 assert.deepEqual(imported.project.sourceRefs.map(s=>s.sha256),originals.map(sha));
 step('confirm-known-synthetic-sync-and-generate-first-cut');
 await page.locator('#camera').selectOption({index:1});await page.locator('#sync-offset').fill('0');await page.locator('#sync-confirm').check();
 await mutation('/api/edit',()=>page.locator('#apply-sync').click());await saved();
 await mutation('/api/first-cut',()=>page.locator('#first-cut-analyse').click(),202);
 await page.locator('#first-cut-confirm').waitFor({timeout:60000});
 assert.equal(await page.locator('#first-cut-apply').isDisabled(),true);
 await page.locator('#first-cut ol button').first().click();
 await page.waitForFunction(()=>document.getElementById('first-cut-preview').currentTime>.1);
 await page.locator('#first-cut-confirm').check();await mutation('/api/first-cut/apply',()=>page.locator('#first-cut-apply').click());await saved();
 const applied=await json(join(workspace,'project.aivs.json'));
 assert.ok(applied.project.timeline.length>0);assert.equal(applied.project.timeline[0].sourceId,imported.project.sourceRefs[1].assetId);
 assert.deepEqual(applied.project.audioClips,imported.project.audioClips);
 step('caption-render-replay-and-download');
 await page.locator('#caption').fill('合成素材の復旧確認');await mutation('/api/edit',()=>page.locator('#apply').click());await saved();
 const savedProject=await readFile(join(workspace,'project.aivs.json'));
 await mutation('/api/render',()=>page.locator('#render').click(),202);
 await page.locator('#download').waitFor({state:'visible',timeout:60000});const playback=await playOutput();
 const output=join(folder,'browser-output.mp4'),qaFile=join(folder,'browser-qa.json');
 await download(page.locator('#download'),output);
 await download(page.getByRole('button',{name:'検査記録を保存',exact:true}),qaFile);
 const bytes=await readFile(output),qa=await json(qaFile);assert.equal(qa.sha256,sha(bytes));assert.equal(qa.technical_ok,true);assert.equal(qa.whole_file_decode_checked,true);
 const caption=qa.captionRasters[0];assert.equal(caption?.glyphCoverage,'CMAP_VERIFIED');assert.equal(caption.glyphCodepointsChecked,9);
 await exec(tools.ffmpeg,['-v','error','-xerror','-i',output,'-map','0:v:0','-map','0:a:0','-f','null','-']);
 const metadata=JSON.parse((await exec(tools.ffprobe,['-v','error','-show_format','-show_streams','-of','json',output])).stdout);
 const video=metadata.streams.find(s=>s.codec_type==='video'),audio=metadata.streams.find(s=>s.codec_type==='audio');
 assert.equal(video?.codec_name,'h264');assert.equal(audio?.codec_name,'aac');
 const media={videoCodec:video.codec_name,audioCodec:audio.codec_name,durationSec:Number(metadata.format.duration),videoFrames:Number(video.nb_frames)};
 assert.ok(Math.abs(media.durationSec-playback.durationSec)<.01,'browser and ffprobe durations differ by at least 10 ms');
 assert.equal(media.videoFrames,qa.inspection.decodedVideoFrames);
 const pcm=(await exec(tools.ffmpeg,['-v','error','-i',output,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2})).stdout;
 const amplitude=f=>{let sin=0,cos=0;for(let i=0;i<pcm.length/4;i++){const v=pcm.readFloatLE(i*4),phase=2*Math.PI*f*i/8000;sin+=v*Math.sin(phase);cos+=v*Math.cos(phase);}return 2*Math.hypot(sin,cos)/(pcm.length/4);};
 const originalAudio440=amplitude(440),otherCamera660=amplitude(660);assert.ok(originalAudio440>.04);assert.ok(originalAudio440>otherCamera660*5);
 step('restart-independent-output-readback');
 await page.close();await server.close();server=undefined;server=await startServer({workspace,port:0});await visit();
 const replayAfterRestart=await playOutput(),restoredOutput=join(folder,'restored-output.mp4');await download(page.locator('#download'),restoredOutput);
 assert.equal(sha(await readFile(restoredOutput)),sha(bytes));assert.equal(sha(await readFile(join(workspace,'project.aivs.json'))),sha(savedProject));
 for(const [index,name] of ['master.mp4','clear.mp4'].entries())assert.equal(sha(await readFile(join(folder,name))),sha(originals[index]));
 assert.equal(uploads,2);assert.equal(retries,2);assert.deepEqual(pageErrors,[]);
 const version=async tool=>(await exec(tool,['-version'])).stdout.split('\n')[0];
 const evidence={status:'PASS_SYNTHETIC_BROWSER',scope,runtime:{node:process.version,platform:process.platform,arch:process.arch,browser:browser.version(),ffmpeg:await version(tools.ffmpeg),ffprobe:await version(tools.ffprobe)},
  inputsSha256:originals.map(sha),uploadRequests:uploads,retryRequests:retries,mediaResentOnRetry:false,
  savedProjectSha256:sha(savedProject),outputSha256:sha(bytes),qaSha256:sha(await readFile(qaFile)),bytes:bytes.length,
  firstCut:'NUMERICAL_EXPLICITLY_REVIEWED',originalAudio440,otherCamera660,media,playback,replayAfterRestart,
  caption:{glyphCoverage:caption.glyphCoverage,glyphCodepointsChecked:caption.glyphCodepointsChecked},
  restartReadback:'SHA256_MATCH',wholeFileDecode:'PASS',physicalZBook:'NOT_RUN',zipSource:'UNAVAILABLE',chunkedUpload:'NOT_RUN',remotePhone:'NOT_RUN'};
 if(process.env.AIVS_EVIDENCE_DIR){
  const target=resolve(process.env.AIVS_EVIDENCE_DIR);assert.ok(target!==root&&!target.startsWith(root+sep),'evidence must stay outside source');await mkdir(target,{recursive:true});
  const id=randomUUID();await writeFile(join(target,'recovered-'+id+'.mp4'),bytes,{flag:'wx'});await writeFile(join(target,'evidence-'+id+'.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
 }
 console.log(JSON.stringify(evidence));
}catch(error){
 let message=String(error.message);for(const token of tokens)message=message.replaceAll(token,'[redacted]');
 console.error(JSON.stringify({status:/UNAVAILABLE/.test(message)?'BLOCKED':'FAIL',scope,stage,reason:message.slice(0,2000)}));process.exitCode=/UNAVAILABLE/.test(message)?2:1;
}finally{
 if(browser)await browser.close();if(server)await server.close();
 for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 if(folder)await rm(folder,{recursive:true,force:true});
}
