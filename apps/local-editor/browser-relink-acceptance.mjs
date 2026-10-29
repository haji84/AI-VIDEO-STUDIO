/** Real Chrome UI recovery across two workspaces; only generated media is used. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {startServer} from './server.mjs';

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const savedNotice='端末内に保存済み',errors=[],tokens=[];
let folder,browser,serverA,serverB;
const bytes=path=>readFile(path);
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const session=workspace=>json(join(workspace,'project.aivs.json'));
const registry=workspace=>json(join(workspace,'media.json'));

// Observe a request made by a real UI control; never perform a replacement API mutation.
async function uiRequest(page,path,action,status=200){
  const [response]=await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST'),action()
  ]);
  assert.equal(response.status(),status,`UI request ${path} status`);
  await response.finished();
}
async function editThroughUI(page,path,action){
  await uiRequest(page,path,action);
  await page.waitForFunction(text=>document.getElementById('notice').textContent===text,savedNotice);
}
async function visit(server){
  tokens.push(server.token);
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(text=>document.getElementById('notice').textContent===text,savedNotice);
  return page;
}
async function download(page,control,path){
  const pending=page.waitForEvent('download');await control.click();
  await(await pending).saveAs(path);
}
async function missing(page,count){
  await page.locator('#source-relink').waitFor({state:'visible'});
  await page.waitForFunction(n=>document.querySelectorAll('#source-relink-missing li').length===n&&
    !document.getElementById('source-relink-files').disabled,count);
  assert.equal(await page.locator('#source-relink-open').isDisabled(),true);
}
async function workspaceSnapshot(workspace){
  const files=['project.aivs.json','media.json',...(await readdir(join(workspace,'assets'))).sort().map(name=>'assets/'+name)];
  return Object.fromEntries(await Promise.all(files.map(async name=>[name,sha(await bytes(join(workspace,name)))])));
}

try{
  let playwright,playwrightVersion;
  try{playwright=await import('playwright');playwrightVersion=createRequire(import.meta.url)('playwright/package.json').version;}
  catch{
    if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');
    const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/aivs-browser.js');
    try{playwright=require('playwright');playwrightVersion=require('playwright/package.json').version;}
    catch{throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');}
  }
  const executablePath=process.env.AIVS_BROWSER_EXECUTABLE||playwright.chromium.executablePath();
  if(!existsSync(executablePath))throw new Error('BROWSER_EXECUTABLE_UNAVAILABLE');
  folder=await mkdtemp(join(tmpdir(),'aivs-browser-relink-'));
  const fixtures=join(folder,'originals'),wrongDir=join(folder,'wrong-same-name');
  await mkdir(fixtures);await mkdir(wrongDir);
  const video=join(fixtures,'source.mp4'),music=join(fixtures,'music.wav'),wrongMusic=join(wrongDir,'music.wav');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=2',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',video]);
  for(const [path,frequency] of [[music,880],[wrongMusic,660]])await exec('ffmpeg',[
    '-v','error','-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000:duration=2`,'-c:a','pcm_s16le',path]);
  const originals=await Promise.all([video,music,wrongMusic].map(bytes)),inputHashes=originals.map(sha);
  assert.notEqual(inputHashes[1],inputHashes[2]);
  const aDir=join(folder,'workspace-a'),bDir=join(folder,'workspace-b');
  browser=await playwright.chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  serverA=await startServer({workspace:aDir,port:0});let page=await visit(serverA);

  // A real saved session has two roles for the same MP4 plus a WAV only in Redo.
  await editThroughUI(page,'/api/import',()=>page.locator('#video-files').setInputFiles(video));
  await page.locator('#clips button').first().waitFor();
  await page.locator('#duration').fill('1.5');await page.locator('#caption').fill('保存して再開');
  await editThroughUI(page,'/api/edit',()=>page.locator('#apply').click());
  await editThroughUI(page,'/api/import',()=>page.locator('#bgm-file').setInputFiles(video));
  await page.getByRole('button',{name:/BGM · source\.mp4/}).waitFor();
  await editThroughUI(page,'/api/import',()=>page.locator('#bgm-file').setInputFiles(music));
  await page.getByRole('button',{name:/BGM · music\.wav/}).waitFor();
  await editThroughUI(page,'/api/undo',()=>page.locator('#undo').click());
  assert.equal(await page.getByRole('button',{name:/BGM · music\.wav/}).count(),0);
  const savedPath=join(folder,'saved-project.aivs.json');
  await download(page,page.locator('#save-project'),savedPath);
  const savedBytes=await bytes(savedPath),saved=JSON.parse(savedBytes);
  assert.deepEqual(saved,await session(aDir));
  assert.equal(saved.project.timeline[0].durationSec,1.5);
  assert.equal(saved.project.timeline[0].effects.find(e=>e.type==='caption').parameters.text,'保存して再開');
  assert.deepEqual(saved.project.sourceRefs.map(s=>s.mediaKind),['video','audio']);
  assert.deepEqual(saved.project.sourceRefs.map(s=>s.sha256),[inputHashes[0],inputHashes[0]]);
  assert.ok(saved.undo.length>0);assert.equal(saved.redo.length,1);
  assert.equal(saved.redo[0].sourceRefs.length,3);
  const videoId=saved.project.sourceRefs[0].assetId,mp4AudioId=saved.project.sourceRefs[1].assetId;
  const historicalSource=saved.redo[0].sourceRefs.find(s=>s.sha256===inputHashes[1]);
  assert.equal(historicalSource.mediaKind,'audio');
  const historicalId=historicalSource.assetId,sourceIds=[videoId,mp4AudioId,historicalId];
  assert.equal(new Set(sourceIds).size,3);
  assert.equal(new Set(saved.redo[0].sourceRefs.map(s=>s.sha256)).size,2);
  const aSnapshot=await workspaceSnapshot(aDir);
  await page.close();await serverA.close();serverA=undefined;

  serverB=await startServer({workspace:bDir,port:0});page=await visit(serverB);
  const initialBytes=await bytes(join(bDir,'project.aivs.json')),initial=JSON.parse(initialBytes);
  await uiRequest(page,'/api/relink/prepare',()=>page.locator('#open-project').setInputFiles(savedPath));
  await missing(page,3);
  assert.deepEqual(await bytes(join(bDir,'project.aivs.json')),initialBytes);

  // One selected physical MP4 must satisfy both immutable role IDs.
  await uiRequest(page,'/api/relink/media',()=>page.locator('#source-relink-files').setInputFiles(video));
  await missing(page,1);
  const partial=await registry(bDir);
  assert.deepEqual(new Set(partial.map(s=>s.assetId)),new Set([videoId,mp4AudioId]));
  assert.equal(new Set(partial.map(s=>s.file)).size,1);
  assert.equal(sha(await bytes(join(bDir,'assets',partial[0].file))),inputHashes[0]);
  assert.deepEqual(await bytes(join(bDir,'project.aivs.json')),initialBytes);
  const partialSnapshot=await workspaceSnapshot(bDir);

  // Same filename and duration do not authorize different bytes or implicit Open.
  await uiRequest(page,'/api/relink/media',()=>page.locator('#source-relink-files').setInputFiles(wrongMusic),400);
  await page.waitForFunction(()=>document.getElementById('source-relink-status').textContent.includes('一致しません'));
  await missing(page,1);
  assert.deepEqual(await workspaceSnapshot(bDir),partialSnapshot);
  await page.close();await serverB.close();serverB=undefined;

  // Restart discards the pending plan, retains verified bytes, and still needs explicit Open.
  serverB=await startServer({workspace:bDir,port:0});page=await visit(serverB);
  assert.equal(await page.locator('#source-relink').isVisible(),false);
  assert.deepEqual(await bytes(join(bDir,'project.aivs.json')),initialBytes);
  await uiRequest(page,'/api/relink/prepare',()=>page.locator('#open-project').setInputFiles(savedPath));
  await missing(page,1);assert.deepEqual(await workspaceSnapshot(bDir),partialSnapshot);
  await uiRequest(page,'/api/relink/media',()=>page.locator('#source-relink-files').setInputFiles(music));
  await page.waitForFunction(()=>!document.getElementById('source-relink-open').disabled);
  assert.equal(await page.locator('#source-relink-missing li').count(),0);
  assert.equal(await page.locator('#source-relink-files').isDisabled(),true);
  assert.deepEqual(await bytes(join(bDir,'project.aivs.json')),initialBytes);
  const recoveredRegistry=await registry(bDir);
  assert.deepEqual(new Set(recoveredRegistry.map(s=>s.assetId)),new Set(sourceIds));
  assert.equal(new Set(recoveredRegistry.map(s=>s.file)).size,2);
  for(const entry of recoveredRegistry)assert.equal(sha(await bytes(join(bDir,'assets',entry.file))),entry.source.sha256);
  await uiRequest(page,'/api/relink/open',()=>page.locator('#source-relink-open').click());
  await page.locator('#source-relink').waitFor({state:'hidden'});
  const expected=structuredClone(saved);expected.project.revision=initial.project.revision+1;
  assert.deepEqual(await session(bDir),expected);
  assert.equal(await page.locator('#duration').inputValue(),'1.5');
  assert.equal(await page.locator('#caption').inputValue(),'保存して再開');
  assert.equal(await page.locator('#undo').isDisabled(),false);
  assert.equal(await page.locator('#redo').isDisabled(),false);

  await editThroughUI(page,'/api/redo',()=>page.locator('#redo').click());
  await page.getByRole('button',{name:/BGM · music\.wav/}).waitFor();
  assert.deepEqual((await session(bDir)).project.sourceRefs,saved.redo[0].sourceRefs);
  await editThroughUI(page,'/api/undo',()=>page.locator('#undo').click());
  assert.equal(await page.getByRole('button',{name:/BGM · music\.wav/}).count(),0);
  assert.deepEqual((await session(bDir)).project.sourceRefs,saved.project.sourceRefs);
  await editThroughUI(page,'/api/redo',()=>page.locator('#redo').click());
  await page.getByRole('button',{name:/BGM · music\.wav/}).click();
  await page.locator('#audio-gainDb').fill('-3');
  await editThroughUI(page,'/api/edit',()=>page.locator('#audio-save').click());
  const edited=await session(bDir);
  assert.equal(edited.project.audioClips.find(a=>a.assetId===historicalId).gainDb,-3);
  assert.ok(edited.undo.length>0);
  await page.reload();await page.getByRole('button',{name:/BGM · music\.wav/}).click();
  assert.equal(await page.locator('#audio-gainDb').inputValue(),'-3');
  assert.deepEqual(await session(bDir),edited);
  await page.close();await serverB.close();serverB=undefined;
  serverB=await startServer({workspace:bDir,port:0});page=await visit(serverB);
  assert.deepEqual(await session(bDir),edited);
  await page.getByRole('button',{name:/BGM · music\.wav/}).click();
  assert.equal(await page.locator('#audio-gainDb').inputValue(),'-3');
  assert.equal(await page.locator('#caption').inputValue(),'保存して再開');
  const beforeRender=await bytes(join(bDir,'project.aivs.json'));

  await uiRequest(page,'/api/render',()=>page.locator('#render').click(),202);
  await page.locator('#download').waitFor({state:'visible',timeout:60000});
  const qaButton=page.getByRole('button',{name:'検査記録を保存',exact:true});await qaButton.waitFor();
  const qaPath=join(folder,'recovered-inspection.json');await download(page,qaButton,qaPath);
  const qaBytes=await bytes(qaPath),report=JSON.parse(qaBytes);
  assert.equal(report.inspection.schema,'aivs-output-inspection-v1');
  assert.equal(report.projectId,saved.project.projectId);assert.equal(report.projectRevision,edited.project.revision);
  const playback=await page.evaluate(async()=>{
    const output=document.getElementById('output');await output.play();const before=output.currentTime;
    await new Promise(resolve=>setTimeout(resolve,400));
    return {advanced:output.currentTime>before,width:output.videoWidth};
  });
  assert.equal(playback.advanced,true);assert.ok(playback.width>0);
  const outputPath=join(folder,'recovered-output.mp4');await download(page,page.locator('#download'),outputPath);
  const output=await bytes(outputPath);assert.equal(sha(output),report.sha256);
  await exec('ffmpeg',['-v','error','-xerror','-i',outputPath,'-f','null','-']);
  const decoded=await exec('ffmpeg',['-v','error','-i',outputPath,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],
    {encoding:'buffer',maxBuffer:1024**2});
  assert.ok(decoded.stdout.length>=(4800+24000)*4);
  let real=0,imaginary=0;
  for(let i=0;i<24000;i++){
    const sample=decoded.stdout.readFloatLE((4800+i)*4),angle=2*Math.PI*880*i/48000;
    real+=sample*Math.cos(angle);imaginary-=sample*Math.sin(angle);
  }
  const historicalBgmAmplitude=2*Math.hypot(real,imaginary)/24000;
  assert.ok(historicalBgmAmplitude>.004,'historical 880Hz BGM must be present after UI Redo and render');
  assert.deepEqual(await bytes(join(bDir,'project.aivs.json')),beforeRender);
  assert.deepEqual(await workspaceSnapshot(aDir),aSnapshot);
  for(const [index,path] of [video,music,wrongMusic].entries())assert.deepEqual(await bytes(path),originals[index]);
  assert.equal((await readdir(join(bDir,'assets'))).some(name=>name.endsWith('.tmp')),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS_SYNTHETIC_BROWSER',scope:'two-workspace-source-relink',
    runtime:{node:process.version,playwright:playwrightVersion,browser:browser.version()},
    inputs:{videoSha256:inputHashes[0],historicalBgmSha256:inputHashes[1],wrongSameNameBgmSha256:inputHashes[2]},
    savedProjectSha256:sha(savedBytes),previousWorkspaceSha256:sha(initialBytes),recoveredProjectSha256:sha(beforeRender),
    qaSha256:sha(qaBytes),outputSha256:sha(output),bytes:output.length,sourceIds:sourceIds.length,physicalFiles:2,
    sameMp4RecoveredBothRoles:true,partialFailurePreservesSession:true,restartRequiresExplicitOpen:true,
    savedHistoryRecovered:true,manualGainSurvivesRestart:true,historicalBgmAmplitude,playback,wholeFileDecode:'PASS',
    originalsAndFirstWorkspaceUnchanged:true,physicalDevice:'NOT_RUN'}));
}catch(error){
  const blocked=/UNAVAILABLE/.test(error.message);let reason=String(error.message);
  for(const token of tokens)reason=reason.replaceAll(token,'[redacted]');
  console.error(JSON.stringify({status:blocked?'BLOCKED':'FAIL',scope:'two-workspace-source-relink',reason:reason.slice(0,2000)}));
  process.exitCode=blocked?2:1;
}finally{
  if(browser)await browser.close();
  if(serverA)await serverA.close();
  if(serverB)await serverB.close();
  if(folder)await rm(folder,{recursive:true,force:true});
}
