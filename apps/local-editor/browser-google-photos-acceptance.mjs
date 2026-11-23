/** Google Photos contract fixtures at the provider boundary, real Chrome, editor, and MP4. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve, sep} from 'node:path';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';

const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = resolve(import.meta.dirname,'../..');
const temp = await mkdtemp(join(tmpdir(), 'aivs-google-photos-browser-'));
const workspace=join(temp,'選択動画 編集');
const input=join(temp,'練習用動画.mp4');
const errors=[];
let app, browser, googleAuth, phase='offline-entry', selected=false, deleted=false;
let localSourceHash;

const fixture = {client:{clientId:'fixture.apps.googleusercontent.com'},
  openExternal:async url=>{googleAuth = new URL(url);},
  request:async(input, init)=>{
    const url=new URL(input);
    if(url.href==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture-token',expires_in:3600});
    if(url.href==='https://photospicker.googleapis.com/v1/sessions')return Response.json({id:'fixture-session',
      pickerUri:'https://photos.google.com/picker/fixture',expireTime:new Date(Date.now()+300000).toISOString()});
    if(url.href==='https://photospicker.googleapis.com/v1/sessions/fixture-session'){
      if(init.method==='DELETE'){deleted=true;return new Response(null,{status:204});}
      return Response.json({mediaItemsSet:selected,pollingConfig:{pollInterval:'0s'}});
    }
    if(url.pathname==='/v1/mediaItems'&&url.hostname==='photospicker.googleapis.com')return Response.json({mediaItems:[
      {id:'video-fixture',type:'VIDEO',mediaFile:{filename:'練習用動画.mp4',baseUrl:'https://lh3.googleusercontent.com/p/fixture',
        mediaFileMetadata:{videoMetadata:{processingStatus:'READY'}}}}, {id:'photo-fixture',type:'PHOTO'},
    ]});
    if(url.href==='https://lh3.googleusercontent.com/p/fixture=dv')return new Response(await readFile(join(temp,'練習用動画.mp4')),{headers:{'Content-Type':'video/mp4'}});
    assert.fail(`unexpected fixture request ${url.hostname}${url.pathname}`);
  },
};

async function load(page) {
  await page.goto(app.url);
  await page.waitForFunction(()=>document.getElementById('notice').textContent==='端末内に保存済み');
}

async function mutation(page,path,action,status=200) {
  const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path),action()]);
  assert.equal(response.status(),status);
}

async function playback(page) {
  const player=page.locator('#output');
  await player.waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>document.getElementById('output').readyState>=2);
  await player.evaluate(video=>video.play());
  await page.waitForFunction(()=>{const video=document.getElementById('output');return video.ended||video.error;});
  const view=await player.evaluate(video=>({ended:video.ended,width:video.videoWidth,height:video.videoHeight,durationSec:video.duration}));
  assert.equal(view.ended,true);
  return view;
}

async function download(page, filepath) {
  const [item]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
  await item.saveAs(filepath);
  return readFile(filepath);
}

try{
  const python=process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3');
  const tools=JSON.parse((await exec(python,['-m','engine.media_tools','--resolve'],{cwd:root})).stdout);
  await exec(tools.ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24:d=4','-f','lavfi','-i',
    'sine=frequency=440:sample_rate=48000:duration=4','-c:v','libx264','-c:a','aac','-shortest',input]);
  const inputHash=hash(await readFile(input));
  browser=await chromium.launch({headless:true,executablePath:process.env.AIVS_BROWSER_EXECUTABLE||chromium.executablePath()});
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  app=await startServer({workspace:join(temp,'offline'),port:0,googlePhotosOptions:{client:null}});
  await load(page);
  await page.locator('#google-photos summary').click();
  assert.equal(await page.locator('#google-photos a').getAttribute('href'),'https://photos.google.com/');
  assert.equal(await page.locator('#google-photos-start').isVisible(),false);
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#google-photos-local').click()]);
  await mutation(page,'/api/import',()=>chooser.setFiles(input));
  await page.waitForFunction(()=>document.getElementById('camera').options.length===1);
  const offline=JSON.parse(await readFile(join(temp,'offline','project.aivs.json'),'utf8'));
  localSourceHash=offline.project.sourceRefs[0].sha256;
  assert.equal(localSourceHash,inputHash);
  await page.goto('about:blank');await app.close();app=undefined;

  phase='picker-to-browser-output';
  app=await startServer({workspace,port:0,googlePhotosOptions:fixture});
  await load(page);await page.locator('#google-photos summary').click();
  await mutation(page,'/api/google-photos/start',()=>page.locator('#google-photos-start').click());
  assert.equal(googleAuth.hostname,'accounts.google.com');
  const callback=new URL(googleAuth.searchParams.get('redirect_uri'));
  callback.searchParams.set('state',googleAuth.searchParams.get('state'));
  callback.searchParams.set('code','fixture-authorization-code');
  assert.equal((await fetch(callback,{redirect:'manual'})).headers.get('Location'),'https://photos.google.com/picker/fixture');
  await mutation(page,'/api/google-photos/import',()=>page.locator('#google-photos-import').click(),409);
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('「完了」'));
  selected=true;
  await mutation(page,'/api/google-photos/import',()=>page.locator('#google-photos-import').click());
  await page.waitForFunction(()=>document.getElementById('camera').options.length===1);
  assert.match(await page.locator('#google-photos-status').textContent(),/動画を 1 本追加しました/);
  assert.equal(deleted,true);
  const project=JSON.parse(await readFile(join(workspace,'project.aivs.json'),'utf8'));
  assert.equal(project.project.sourceRefs[0].sha256,inputHash);
  assert.equal(project.project.audioClips.length,1);
  await mutation(page,'/api/first-cut',()=>page.locator('#first-cut-analyse').click(),202);
  await page.locator('#first-cut-confirm').waitFor({timeout:60000});
  assert.equal(await page.locator('#first-cut-apply').isDisabled(),true);
  await page.locator('#first-cut ol button').first().click();
  await page.waitForFunction(()=>document.getElementById('first-cut-preview').currentTime>.1);
  await page.locator('#first-cut-confirm').check();
  await mutation(page,'/api/first-cut/apply',()=>page.locator('#first-cut-apply').click());
  await page.locator('#caption').fill('取り込み確認');
  await mutation(page,'/api/edit',()=>page.locator('#apply').click());
  await mutation(page,'/api/render',()=>page.locator('#render').click(),202);
  const played=await playback(page), out=join(temp,'output.mp4');
  const bytes=await download(page,out);
  await exec(tools.ffmpeg,['-v','error','-xerror','-i',out,'-map','0:v:0','-map','0:a:0','-f','null','-']);
  const {stdout}=await exec(tools.ffprobe,['-v','error','-show_streams','-show_format','-of','json',out]);
  const info=JSON.parse(stdout),video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');
  const receipt=JSON.parse(await readFile(join(workspace,'last-job.json'),'utf8'));
  assert.equal(receipt.sha256,hash(bytes));
  phase='offline-restart-and-replay';
  await page.goto('about:blank');await app.close();app=undefined;
  app=await startServer({workspace,port:0,googlePhotosOptions:{client:null}});
  await load(page);
  const replay=await playback(page);
  assert.equal(hash(await download(page,join(temp,'replayed.mp4'))),hash(bytes));
  assert.equal(hash(await readFile(input)),inputHash);assert.deepEqual(errors,[]);
  const evidence={status:'PASS_SYNTHETIC_BROWSER',scope:'google-photos-import',provider:'FIXTURE_ONLY',
    runtime:{platform:process.platform,arch:process.arch,node:process.version,browser:browser.version()},
    inputSha256:inputHash,downloadedFileInputSha256:localSourceHash,outputSha256:hash(bytes),bytes:bytes.length,
    media:{videoCodec:video.codec_name,audioCodec:audio.codec_name,frames:Number(video.nb_frames)},
    playback:played,replayAfterRestart:replay,wholeFileDecode:'PASS',restartReadback:'SHA256_MATCH'};
  if(process.env.AIVS_EVIDENCE_DIR){
    const target=resolve(process.env.AIVS_EVIDENCE_DIR),realRoot=await realpath(root);
    assert.ok(target!==root&&!target.startsWith(root+sep),'evidence must stay outside source');
    await mkdir(target,{recursive:true});
    const realTarget=await realpath(target);assert.ok(realTarget!==realRoot&&!realTarget.startsWith(realRoot+sep),'evidence must stay outside source');
    const id=randomUUID();await writeFile(join(realTarget,'google-photos-'+id+'.mp4'),bytes,{flag:'wx'});
    await writeFile(join(realTarget,'google-photos-'+id+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify(evidence));
}catch(error){
  // Browser fixtures use test credentials. The local editor session token is still private.
  const message=String(error.message).replaceAll(app?.token??'[never-matches]','[redacted]');
  console.error(JSON.stringify({status:'FAIL',phase,reason:message.slice(0,1000)}));process.exitCode=1;
}finally{
  await browser?.close();await app?.close();await rm(temp,{recursive:true,force:true});
}
