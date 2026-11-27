import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, win32} from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import test from 'node:test';
import {createSystemBrowserOpener} from './system-browser.mjs';

const exec = promisify(execFile);

const windowsCleanupTimeout = 5000;

async function finishWindowsLauncher(stopTree, childExit, removeWorkspace, timeoutMs = windowsCleanupTimeout) {
  let stage = 'process-tree stop';
  let timer;
  const cleanup = new AbortController();
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('WINDOWS_LAUNCHER_CLEANUP_UNCONFIRMED: ' + stage));
      cleanup.abort();
    }, timeoutMs);
  });
  try {
    await Promise.race([stopTree(), deadline]);
    stage = 'launcher exit';
    await Promise.race([childExit, deadline]);
    stage = 'workspace removal';
    await Promise.race([removeWorkspace(cleanup.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

test('Windows launcher cleanup fails within its deadline when the launcher never exits', async () => {
  let removed = false;
  await assert.rejects(
    finishWindowsLauncher(async () => {}, new Promise(() => {}), async () => { removed = true; }, 20),
    /WINDOWS_LAUNCHER_CLEANUP_UNCONFIRMED: launcher exit/,
  );
  assert.equal(removed, false);
});

function startWorkspaceCleanup(args, signal) {
  return spawn(process.execPath, args, {windowsHide:true, stdio:'ignore', signal, killSignal:'SIGKILL'});
}

async function removeWorkspaceInChild(folder, signal) {
  // Recursive removal can outlive its timeout. The deadline stops this worker only.
  const script = "const {rm}=require('node:fs/promises');rm(process.argv[1],{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{process.exitCode=1;})";
  const cleanup = startWorkspaceCleanup(['-e',script,'--',folder], signal);
  try {
    const [code] = await once(cleanup,'exit');
    if (code !== 0) throw new Error('WINDOWS_LAUNCHER_WORKSPACE_REMOVE_FAILED');
  } finally {
    cleanup.unref();
  }
}

test('workspace removal deletes the selected fixture and preserves neighboring data', async () => {
  const root = await mkdtemp(join(tmpdir(),'aivs-cleanup-test-'));
  const fixture = join(root,'合成 素材');
  const retained = join(root,'retained.txt');
  try {
    await mkdir(fixture);
    await writeFile(join(fixture,'fixture.txt'),'temporary data');
    await writeFile(retained,'keep');
    await finishWindowsLauncher(async () => {}, Promise.resolve(), signal => removeWorkspaceInChild(fixture, signal));
    await assert.rejects(readFile(join(fixture,'fixture.txt')), {code:'ENOENT'});
    assert.equal(await readFile(retained,'utf8'),'keep');
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});

test('workspace removal deadline terminates only its owned cleanup process', async () => {
  let cleanup, exited;
  try {
    await assert.rejects(
      finishWindowsLauncher(async () => {}, Promise.resolve(), signal => {
        cleanup = startWorkspaceCleanup(['-e','setInterval(() => {}, 1000)'], signal);
        exited = new Promise(resolve => cleanup.once('exit', resolve));
        return once(cleanup, 'exit');
      }, 100),
      /WINDOWS_LAUNCHER_CLEANUP_UNCONFIRMED: workspace removal/,
    );
    const terminated = await Promise.race([exited.then(() => true), delay(1000,false,{ref:false})]);
    assert.equal(terminated,true,'the expired cleanup process still owns an event-loop handle');
  } finally {
    if (cleanup?.exitCode === null && cleanup.signalCode === null) cleanup.kill('SIGKILL');
    await exited;
  }
});

test('Windows sends the full browser address as data and keeps the PowerShell command fixed', async () => {
  const calls = [];
  const open = createSystemBrowserOpener({platform:'win32', environment:{SystemRoot:'C:\\Windows'},
    execute:async (...args) => { calls.push(args); }});
  const address = 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2Fgoogle-photos%2Foauth&state=sample';
  await open(address);
  const [[file,args,options]] = calls;
  assert.equal(file,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.ok(args.includes('-NoProfile'));
  assert.ok(args.includes('-NonInteractive'));
  assert.ok(args.at(-1).includes('$env:AIVS_BROWSER_URL'));
  assert.doesNotMatch(args.join(' '), /accounts\.google\.com|redirect_uri|sample/);
  assert.equal(options.env.AIVS_BROWSER_URL,address);
  assert.equal(options.windowsHide,true);
});

test('the native opener permits the app UI and Google sign-in only', async () => {
  const calls = [];
  const open = createSystemBrowserOpener({platform:'darwin', execute:async (...args) => { calls.push(args); }});
  await open('http://127.0.0.1:8765');
  assert.deepEqual(calls[0].slice(0,2),['/usr/bin/open',['http://127.0.0.1:8765/']]);
  for(const url of ['file:///example','https://example.invalid','http://other-host.invalid:8765',
     'https://user@accounts.google.com/','https://accounts.google.com:8443/']){
    await assert.rejects(open(url),/INVALID_SYSTEM_BROWSER_URL/);
  }
  assert.equal(calls.length,1);
  assert.equal(createSystemBrowserOpener({platform:'linux'}),undefined);
});

test('Windows launches the local editor from its cmd entry point in a Japanese workspace', {
  skip:process.platform!=='win32',timeout:30000,
}, async t => {
  const temp=await mkdtemp(join(tmpdir(),'aivs-windows-launch-'));
  const userProfile=join(temp,'利用者 フォルダ'),configRoot=join(temp,'LocalAppData'),configDir=join(configRoot,'AI VIDEO STUDIO');
  const launcher=join(import.meta.dirname,'..','..','start-windows.cmd');
  const system32=win32.join(process.env.SystemRoot||'C:\\Windows','System32');
  let child,childExit,lines,timer;
  t.after(async()=>{
    clearTimeout(timer);lines?.close();
    // The system browser may retain inherited pipes after the launch checks.
    child?.stdout.destroy();child?.stderr.destroy();
    try {
      await finishWindowsLauncher(async () => {
        if(child?.pid&&child.exitCode===null&&child.signalCode===null){
          const taskkill=win32.join(system32,'taskkill.exe');
          try{await exec(taskkill,['/pid',String(child.pid),'/t','/f'],{windowsHide:true,timeout:windowsCleanupTimeout});}
          catch(error){if(child.exitCode===null&&child.signalCode===null)throw error;}
        }
      }, childExit, signal => removeWorkspaceInChild(temp, signal));
    } finally {
      child?.unref();
    }
  });
  await mkdir(userProfile);await mkdir(configDir,{recursive:true});
  await writeFile(join(configDir,'google-photos-client.json'),JSON.stringify({installed:{client_id:'fixture.apps.googleusercontent.com'}}),{flag:'wx'});
  const env={...process.env,USERPROFILE:userProfile,LOCALAPPDATA:configRoot};
  delete env.AIVS_GOOGLE_PHOTOS_CLIENT_FILE;
  const cmd=process.env.ComSpec||win32.join(system32,'cmd.exe');
  child=spawn(cmd,['/d','/s','/c',`""${launcher}" --port 0"`],{
    cwd:temp,env,windowsVerbatimArguments:true,windowsHide:true,stdio:['ignore','pipe','pipe'],
  });
  childExit=once(child,'exit').catch(()=>{});
  let stderr='';child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
  lines=createInterface({input:child.stdout});
  const url=await new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',code=>reject(new Error(`Launcher exited ${code}: ${stderr}`)));
    lines.on('line',line=>{if(/^http:\/\/127\.0\.0\.1:\d+$/.test(line))resolve(line);});
    timer=setTimeout(()=>reject(new Error('Windows launcher did not return a local address')),10000);
  });
  const response=await fetch(url,{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Google フォトから追加/);
  const [,token]=html.match(/const token='([0-9a-f]{64})'/);
  const stateResponse=await fetch(url+'/api/state',{headers:{'X-AIVS-Token':token},signal:AbortSignal.timeout(5000)});
  assert.equal(stateResponse.status,200);
  const state=await stateResponse.json();
  assert.equal(state.googlePhotos.phase,'READY');
  assert.equal(state.session.project.sourceRefs.length,0);
  const marker=join(userProfile,'AI_VIDEO_STUDIO_DATA','.aivs-local-editor');
  assert.equal(await readFile(marker,'utf8'),'AI VIDEO STUDIO local workspace v1\n');
  const open=createSystemBrowserOpener();
  await open(url+'/?redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2Fgoogle-photos%2Foauth&state=fixture');
  console.log('WINDOWS_LAUNCH_AND_SYSTEM_BROWSER_DISPATCH_OK');
});
