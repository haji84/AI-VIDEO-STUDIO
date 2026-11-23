import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';
import {startServer} from './server.mjs';

const exec = promisify(execFile);
const scope = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const token = 'test-google-access-token';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function startTestEditor(t, options = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'aivs-photos-'));
  const workspace = join(temp, '作業 フォルダ');
  let app;
  t.after(async () => {
    await app?.close();
    await rm(temp, {recursive: true, force: true});
  });
  app = await startServer({workspace, port: 0, googlePhotosOptions: options});
  const call = (path, method = 'GET', revision = 0) => fetch(app.url + path, {
    method,
    headers: {'X-AIVS-Token': app.token, 'X-AIVS-Revision': String(revision)},
  });
  return {app, call, workspace};
}

function selectedVideo(id, baseUrl, processingStatus = 'READY') {
  return {id, type: 'VIDEO', mediaFile: {filename: `${id}.mov`, mimeType: 'video/quicktime', baseUrl,
    mediaFileMetadata: {videoMetadata: {processingStatus}}}};
}

test('Google Photos setup is optional and sends no requests at startup or on an unconfigured start', async t => {
  let networkCalls = 0;
  const {call} = await startTestEditor(t, {
    client: null,
    request: async () => { networkCalls++; throw new Error('unexpected request'); },
  });
  const state = await (await call('/api/state')).json();
  assert.equal(state.googlePhotos.phase, 'SETUP_REQUIRED');
  assert.equal(state.session.project.sourceRefs.length, 0);
  assert.equal((await call('/api/google-photos/start', 'POST')).status, 409);
  assert.equal(networkCalls, 0);
});

test('a picked video becomes an editable local asset through the Google OAuth and Picker contract', async t => {
  const fixtures = await mkdtemp(join(tmpdir(), 'aivs-photos-fixture-'));
  t.after(() => rm(fixtures, {recursive: true, force: true}));
  const videoFile = join(fixtures, 'fixture.mp4');
  await exec('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=24:d=2',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v','libx264','-c:a','aac','-shortest',videoFile]);
  const fixtureBytes = await readFile(videoFile);
  let permissionUrl;
  const calls = [];
  const {app, call, workspace} = await startTestEditor(t, {
    client: {clientId: 'fixture.apps.googleusercontent.com', clientSecret: 'fixture-secret'},
    openExternal: async url => { permissionUrl = new URL(url); },
    request: async (input, options) => {
      const url = new URL(input);
      const headers = new Headers(options.headers);
      const method = options.method ?? 'GET';
      calls.push([method, url.hostname, url.pathname]);
      if (url.href === 'https://oauth2.googleapis.com/token') {
        const params = new URLSearchParams(options.body);
        assert.equal(params.get('redirect_uri'), permissionUrl.searchParams.get('redirect_uri'));
        assert.equal(digestForPkce(params.get('code_verifier')), permissionUrl.searchParams.get('code_challenge'));
        assert.equal(params.get('code'), 'fixture-authorization-code');
        return Response.json({access_token: token, expires_in: 3600, token_type: 'Bearer'});
      }
      if (url.hostname === 'photospicker.googleapis.com') assert.equal(headers.get('authorization'), `Bearer ${token}`);
      if (url.pathname === '/v1/sessions') {
        assert.equal(JSON.parse(options.body).pickingConfig.maxItemCount, '100');
        return Response.json({id: 'fixture-session', pickerUri: 'https://photos.google.com/picker/fixture',
          expireTime: new Date(Date.now() + 300000).toISOString(), mediaItemsSet: false});
      }
      if (url.pathname === '/v1/sessions/fixture-session') {
        if (method === 'DELETE') return new Response(null, {status: 204});
        return Response.json({id: 'fixture-session', mediaItemsSet: true});
      }
      if (url.pathname === '/v1/mediaItems') {
        assert.equal(url.searchParams.get('sessionId'), 'fixture-session');
        return url.searchParams.has('pageToken')
          ? Response.json({mediaItems: [selectedVideo('練習動画', 'https://lh3.googleusercontent.com/p/ready')]})
          : Response.json({mediaItems: [{id:'photo', type:'PHOTO'}, selectedVideo('処理中','https://lh3.googleusercontent.com/p/wait','PROCESSING')], nextPageToken: 'page-2'});
      }
      if (url.href === 'https://lh3.googleusercontent.com/p/ready=dv') {
        assert.equal(headers.get('authorization'), `Bearer ${token}`);
        return new Response(null, {status: 302, headers: {Location: 'https://video-downloads.googleusercontent.com/fixture'}});
      }
      if (url.href === 'https://video-downloads.googleusercontent.com/fixture') {
        assert.equal(headers.has('authorization'), false);
        return new Response(fixtureBytes, {headers: {'Content-Type': 'video/mp4'}});
      }
      assert.fail(`Unexpected request: ${method} ${url.hostname}${url.pathname}`);
    },
  });

  assert.equal((await fetch(app.url + '/api/google-photos/start',{method:'POST'})).status, 403);
  assert.equal((await call('/api/google-photos/start','POST')).status, 200);
  assert.equal(permissionUrl.origin, 'https://accounts.google.com');
  assert.equal(permissionUrl.searchParams.get('scope'), scope);
  assert.equal(permissionUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(permissionUrl.searchParams.get('access_type'), 'online');
  assert.equal(permissionUrl.searchParams.get('redirect_uri'), app.url + '/google-photos/oauth');
  const callback = new URL(permissionUrl.searchParams.get('redirect_uri'));
  callback.searchParams.set('code', 'fixture-authorization-code');
  callback.searchParams.set('state', 'wrong-state');
  assert.equal((await fetch(callback,{redirect:'manual'})).status, 400);
  assert.deepEqual(calls, []);
  callback.searchParams.set('state', permissionUrl.searchParams.get('state'));
  const redirect = await fetch(callback,{redirect:'manual'});
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('location'), 'https://photos.google.com/picker/fixture');
  assert.equal((await fetch(callback,{redirect:'manual'})).status, 400);
  assert.equal(calls.filter(([, host]) => host === 'oauth2.googleapis.com').length, 1);
  assert.equal(calls.some(([, , path]) => path === '/v1/mediaItems'), false);

  const response = await call('/api/google-photos/import', 'POST');
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.deepEqual(state.googleImport, {imported: 1, pending: 0, photosSkipped: 1, videosSkipped: 1, failed: 0});
  assert.equal(state.session.project.timeline.length, 1);
  assert.equal(state.session.project.audioClips.length, 1);
  assert.equal(state.sources[0].label, '練習動画.mov');
  const [asset] = JSON.parse(await readFile(join(workspace,'media.json'),'utf8'));
  assert.equal(digest(await readFile(join(workspace,'assets',asset.file))),digest(fixtureBytes));
  assert.equal(state.googlePhotos.phase, 'READY');
  assert.deepEqual(calls.at(-1), ['DELETE','photospicker.googleapis.com','/v1/sessions/fixture-session']);
  assert.doesNotMatch(JSON.stringify(state), /fixture-secret|test-google-access-token|lh3\.googleusercontent/);
  assert.equal((await call('/api/google-photos/import', 'POST', state.session.project.revision)).status, 409);
});

function digestForPkce(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function pickerSession(t, {sessionStatus = 200, downloads} = {}) {
  const config = await mkdtemp(join(tmpdir(),'aivs-photos-config-'));
  t.after(() => rm(config, {recursive:true, force:true}));
  const clientFile = join(config,'google-photos-client.json');
  await writeFile(clientFile, JSON.stringify({installed:{client_id:'fixture.apps.googleusercontent.com'}}),{mode:0o600});
  let permissionUrl, deleted = 0;
  const editor = await startTestEditor(t, {
    clientFile, openExternal: async url => { permissionUrl = new URL(url); },
    request: async (input, options) => {
      const url = new URL(input);
      if (url.href === 'https://oauth2.googleapis.com/token') return Response.json({access_token:token,expires_in:3600});
      if (url.href === 'https://photospicker.googleapis.com/v1/sessions') {
        return Response.json({id:'picker-fixture',pickerUri:'https://photos.google.com/picker/fixture'});
      }
      if (url.href === 'https://photospicker.googleapis.com/v1/sessions/picker-fixture') {
        if (options.method === 'DELETE') { deleted++; return new Response(null,{status:204}); }
        return Response.json({mediaItemsSet:true},{status:sessionStatus});
      }
      if (url.hostname === 'photospicker.googleapis.com' && url.pathname === '/v1/mediaItems') {
        return Response.json({mediaItems:[selectedVideo('fixture','https://lh3.googleusercontent.com/p/video')]});
      }
      if (url.href === 'https://lh3.googleusercontent.com/p/video=dv' && downloads) return downloads(options);
      assert.fail(`Unexpected destination: ${url.hostname}`);
    },
  });
  assert.equal((await editor.call('/api/google-photos/start','POST')).status,200);
  const callback = new URL(permissionUrl.searchParams.get('redirect_uri'));
  callback.searchParams.set('code','fixture-authorization-code');
  callback.searchParams.set('state',permissionUrl.searchParams.get('state'));
  assert.equal((await fetch(callback,{redirect:'manual'})).status,303);
  return {...editor, deletionCount:() => deleted};
}

test('an expired Picker session allows a new connection without a separate cancellation', async t => {
  const {call,deletionCount} = await pickerSession(t,{sessionStatus:404});
  const failed = await call('/api/google-photos/import','POST');
  assert.equal(failed.status,410);
  assert.equal((await (await call('/api/state')).json()).googlePhotos.phase,'READY');
  assert.equal(deletionCount(),1);
  assert.equal((await call('/api/google-photos/start','POST')).status,200);
});

test('Google Photos cancellation interrupts a partial video and releases the workspace', {timeout:5000}, async t => {
  const began = Promise.withResolvers();
  const {app,call,workspace,deletionCount} = await pickerSession(t,{downloads:({signal}) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([0,0,0,24]));
      signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});
      began.resolve();
    },
  }),{headers:{'Content-Type':'video/mp4','Content-Length':'100'}})});
  const importing = call('/api/google-photos/import','POST');
  await began.promise;
  assert.equal((await fetch(app.url+'/api/google-photos/cancel',{method:'POST'})).status,403);
  const cancelled = await call('/api/google-photos/cancel','POST');
  assert.equal(cancelled.status,200);
  const state = await cancelled.json();
  assert.equal(state.session.project.sourceRefs.length,0);
  assert.equal(state.pendingImports.length,0);
  assert.equal(state.googlePhotos.phase,'READY');
  await (await importing).json();
  assert.deepEqual(await readdir(join(workspace,'assets')),[]);
  assert.equal(deletionCount(),1);
});

test('a non-Google video redirect creates no asset and triggers no further download request', async t => {
  const {call,workspace,deletionCount} = await pickerSession(t,{downloads:() => new Response(null,{
    status:302,headers:{Location:'https://unrelated.example.invalid/video'},
  })});
  const state = await (await call('/api/google-photos/import','POST')).json();
  assert.equal(state.googleImport.failed,1);
  assert.match(state.googleImport.error,/取得先/);
  assert.equal(state.session.project.sourceRefs.length,0);
  assert.deepEqual(await readdir(join(workspace,'assets')),[]);
  assert.equal(deletionCount(),1);
});
