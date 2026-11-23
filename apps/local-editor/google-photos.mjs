import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {open} from 'node:fs/promises';

const scope = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const pickerApi = 'https://photospicker.googleapis.com/v1';
const oauthPath = '/google-photos/oauth';
const authorizationMs = 10 * 60_000;
const apiTimeoutMs = 20_000;
const videoTimeoutMs = 60 * 60_000;
const maxJsonBytes = 512 * 1024;
const maxClientBytes = 32 * 1024;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const downloadRedirects = new Set(['video-downloads.googleusercontent.com']);
const mediaHost = /^lh\d+\.googleusercontent\.com$/;

function fail(message, status = 409) {
  throw Object.assign(new Error(message), {status});
}

function checkedHttps(value) {
  let url;
  try { url = new URL(value); } catch { fail('Google フォトの接続先を確認できません。', 502); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    fail('Google フォトの接続先を確認できません。', 502);
  }
  return url;
}

function secondsToMs(duration) {
  return typeof duration === 'string' && /^\d+(?:\.\d{1,9})?s$/.test(duration)
    ? Number(duration.slice(0, -1)) * 1000 : undefined;
}

async function loadClient(file) {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxClientBytes) throw new Error('Invalid OAuth client file');
    const buffer = Buffer.alloc(maxClientBytes + 1);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxClientBytes) throw new Error('Invalid OAuth client file');
    const {installed} = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    return {clientId: installed?.client_id, clientSecret: installed?.client_secret};
  } finally {
    await handle.close();
  }
}

function validClient(client) {
  return typeof client?.clientId === 'string' && /^[\w-]{1,192}\.apps\.googleusercontent\.com$/.test(client.clientId)
    && (client.clientSecret === undefined || (typeof client.clientSecret === 'string' && /^[-\w]{1,256}$/.test(client.clientSecret)));
}

async function readJson(response) {
  let bytes = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maxJsonBytes) throw new Error('Google response too large');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Google response');
    return data;
  } catch { fail('Google フォトからの応答を読み取れませんでした。', 502); }
}

async function discard(response) {
  await response.body?.cancel().catch(() => {});
}

export async function createGooglePhotosImport({clientFile, client, request = fetch, openExternal} = {}) {
  let credentials = client;
  let setup = 'SETUP_REQUIRED';
  if (client === undefined && clientFile) {
    try { credentials = await loadClient(clientFile); } catch { setup = 'SETUP_INVALID'; }
  }
  if (credentials) setup = validClient(credentials) ? (openExternal ? 'READY' : 'UNAVAILABLE') : 'SETUP_INVALID';
  let flow;

  const authHeader = entry => ({Authorization: `Bearer ${entry.accessToken}`});
  const sessionUrl = entry => `${pickerApi}/sessions/${encodeURIComponent(entry.sessionId)}`;
  const expires = entry => Date.now() >= entry.expiresAt;
  const state = () => ({phase: flow ? (expires(flow) ? 'EXPIRED' : flow.phase) : setup});
  const signalFor = (entry, timeout) => AbortSignal.any([entry.controller.signal, AbortSignal.timeout(timeout)]);

  async function googleRequest(url, options) {
    try { return await request(url, options); }
    catch { fail('Google フォトに接続できませんでした。通信を確認して再試行してください。', 502); }
  }

  async function googleJson(url, options, entry) {
    const response = await googleRequest(url, {
      ...options, redirect: 'error', signal: signalFor(entry, apiTimeoutMs),
    });
    if (!response.ok) {
      await discard(response);
      if (response.status === 403) fail('Google フォトへのアクセスを確認してください。接続設定と Google アカウントをご確認ください。', 403);
      if (response.status === 401 || response.status === 404) fail('Google フォトの選択を開き直してください。', 410);
      fail('Google フォトから選択情報を取得できませんでした。再試行してください。', 502);
    }
    return readJson(response);
  }

  async function removeSession(entry) {
    if (!entry.sessionId || !entry.accessToken) return;
    try {
      const response = await request(sessionUrl(entry), {
        method: 'DELETE', headers: authHeader(entry), redirect: 'error', signal: AbortSignal.timeout(4000),
      });
      await discard(response);
    } catch { /* Google also expires its own temporary sessions. */ }
  }

  async function cancel(entry = flow) {
    if (!entry) return;
    if (entry === flow) flow = undefined;
    entry.controller.abort();
    const cleanup = removeSession(entry);
    entry.accessToken = undefined;
    await cleanup;
  }

  function interrupt() {
    const entry = flow;
    entry?.controller.abort();
    return async () => { if (entry) await cancel(entry); };
  }

  async function start({origin, projectId, maxCount}) {
    if (setup !== 'READY') fail('Google フォトの直接取込には Mac の接続設定が必要です。');
    if (flow && !expires(flow)) fail('Google フォトで選択中です。取り込みを続けるか、キャンセルしてください。');
    await cancel();
    const secretState = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const redirectUri = `${origin}${oauthPath}`;
    const entry = {projectId, maxCount, secretState, verifier, redirectUri, phase: 'AUTHORIZING',
      controller: new AbortController(), expiresAt: Date.now() + authorizationMs};
    flow = entry;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({client_id: credentials.clientId, redirect_uri: redirectUri,
      response_type: 'code', scope, state: secretState, access_type: 'online', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url')});
    try { await openExternal(url.href); }
    catch {
      await cancel(entry);
      fail('ブラウザを開けませんでした。Mac のブラウザを確認して再試行してください。', 502);
    }
  }

  async function authorize(params, projectId) {
    const entry = flow;
    const supplied = params.get('state') ?? '';
    if (!entry || entry.phase !== 'AUTHORIZING' || entry.projectId !== projectId || expires(entry)
      || params.getAll('state').length !== 1 || !/^[\w-]{43}$/.test(supplied)
      || !timingSafeEqual(Buffer.from(entry.secretState), Buffer.from(supplied))) {
      fail('この Google フォト接続は無効です。編集画面からやり直してください。', 400);
    }
    entry.phase = 'CONNECTING';
    const verifier = entry.verifier;
    delete entry.verifier;
    delete entry.secretState;
    try {
      const code = params.get('code');
      if (params.has('error') || params.getAll('code').length !== 1 || !code || code.length > 4096) {
        fail('Google フォトの接続が完了しませんでした。編集画面からやり直せます。', 400);
      }
      const body = new URLSearchParams({code, client_id: credentials.clientId, redirect_uri: entry.redirectUri,
        grant_type: 'authorization_code', code_verifier: verifier});
      if (credentials.clientSecret) body.set('client_secret', credentials.clientSecret);
      const grant = await googleJson('https://oauth2.googleapis.com/token', {method: 'POST', body}, entry);
      const lifetime = Number(grant.expires_in);
      if (typeof grant.access_token !== 'string' || !/^[A-Za-z0-9.\-_~+/=]{1,4096}$/.test(grant.access_token)
        || !Number.isFinite(lifetime) || lifetime <= 0
        || (typeof grant.scope === 'string' && !grant.scope.split(/\s+/).includes(scope))) {
        fail('Google フォトの読み取り許可を確認できませんでした。', 403);
      }
      entry.accessToken = grant.access_token;
      entry.expiresAt = Date.now() + lifetime * 1000;
      const session = await googleJson(`${pickerApi}/sessions`, {method: 'POST',
        headers: {...authHeader(entry), 'Content-Type': 'application/json'},
        body: JSON.stringify({pickingConfig: {maxItemCount: String(entry.maxCount)}})}, entry);
      if (typeof session.id !== 'string' || !session.id || session.id.length > 1024
        || /[\x00-\x1f\x7f]/.test(session.id) || session.id === '.' || session.id === '..') {
        fail('Google フォトの選択を開始できませんでした。', 502);
      }
      entry.sessionId = session.id;
      if (entry !== flow) fail('Google フォトの接続は取り消されました。');
      const pickerUrl = checkedHttps(session.pickerUri);
      if (pickerUrl.hostname !== 'photos.google.com') fail('Google フォトの選択画面を確認できませんでした。', 502);
      const sessionExpiry = Date.parse(session.expireTime);
      if (Number.isFinite(sessionExpiry)) entry.expiresAt = Math.min(entry.expiresAt, sessionExpiry);
      entry.nextPollAt = Date.now() + (secondsToMs(session.pollingConfig?.pollInterval) ?? 0);
      const pollTimeout = secondsToMs(session.pollingConfig?.timeoutIn);
      if (pollTimeout !== undefined) entry.pollUntil = Date.now() + pollTimeout;
      entry.phase = 'SELECTING';
      return pickerUrl.href;
    } catch (error) {
      await cancel(entry);
      throw error;
    }
  }

  async function listPicked(entry) {
    const items = new Map(), pageTokens = new Set();
    let pageToken;
    for (;;) {
      const url = new URL(`${pickerApi}/mediaItems`);
      url.searchParams.set('sessionId', entry.sessionId);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await googleJson(url, {headers: authHeader(entry)}, entry);
      if (page.mediaItems !== undefined && !Array.isArray(page.mediaItems)) fail('Google フォトの選択内容を確認できません。', 502);
      for (const item of page.mediaItems ?? []) {
        if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 1024) fail('Google フォトの選択内容を確認できません。', 502);
        items.set(item.id, item);
        if (items.size > entry.maxCount) fail('Google フォトで選択した素材の数が上限を超えています。');
      }
      pageToken = page.nextPageToken;
      if (!pageToken) return [...items.values()];
      if (typeof pageToken !== 'string' || pageToken.length > 4096 || pageTokens.has(pageToken) || pageTokens.size >= entry.maxCount) {
        fail('Google フォトの選択一覧を最後まで取得できませんでした。', 502);
      }
      pageTokens.add(pageToken);
    }
  }

  async function downloadVideo(entry, media, receive) {
    const base = checkedHttps(media.baseUrl);
    if (!mediaHost.test(base.hostname)) fail('Google フォトの動画の取得先を確認できませんでした。', 502);
    base.pathname += '=dv';
    let url = base;
    const signal = signalFor(entry, videoTimeoutMs);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const headers = {'Accept-Encoding': 'identity', ...(url.origin === base.origin ? authHeader(entry) : {})};
      const response = await googleRequest(url, {headers, signal, redirect: 'manual'});
      try {
        if (redirectStatuses.has(response.status)) {
          const location = response.headers.get('location');
          if (!location) fail('Google フォトの動画の取得先を確認できませんでした。', 502);
          const next = checkedHttps(new URL(location, url));
          if (!mediaHost.test(next.hostname) && !downloadRedirects.has(next.hostname)
            && !next.hostname.endsWith('.googlevideo.com')) fail('Google フォトの動画の取得先を確認できませんでした。', 502);
          url = next;
          continue;
        }
        if (response.status !== 200 || !response.body) fail('Google フォトから動画を取得できませんでした。選択し直してください。', 502);
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (type && !type.startsWith('video/') && type !== 'application/octet-stream') {
          fail('Google フォトから動画データを取得できませんでした。', 502);
        }
        const encoding = response.headers.get('content-encoding');
        const length = !encoding || encoding === 'identity' ? response.headers.get('content-length') : null;
        // The Picker supplies a high-quality video rendition via =dv.
        const filename = typeof media.filename === 'string' && media.filename
          ? media.filename.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160) : 'Google フォトの動画.mp4';
        const extension = type === 'video/webm' ? '.webm' : type === 'video/x-matroska' ? '.mkv' : type === 'video/quicktime' ? '.mov' : '.mp4';
        return await receive({label: filename, extension, body: response.body, length});
      } finally { await discard(response); }
    }
    fail('Google フォトの動画の取得先を確認できませんでした。', 502);
  }

  async function importSelection(projectId, receive) {
    const entry = flow;
    if (!entry || entry.projectId !== projectId || expires(entry)) {
      fail('編集画面から Google フォトの動画を選び直してください。');
    }
    if (entry.phase !== 'SELECTING') fail('Google の画面で接続を完了してから取り込んでください。');
    if (entry.pollUntil !== undefined && Date.now() >= entry.pollUntil) {
      await cancel(entry);
      fail('Google フォトの選択時間が過ぎました。動画を選び直してください。');
    }
    if (Date.now() < entry.nextPollAt) fail('Google フォトの選択を少し待ってから取り込んでください。');
    entry.nextPollAt = Date.now() + 2000;
    let session;
    try { session = await googleJson(sessionUrl(entry), {headers: authHeader(entry)}, entry); }
    catch (error) {
      if (error.status === 410 || error.status === 403) await cancel(entry);
      throw error;
    }
    if (session.mediaItemsSet !== true) {
      entry.nextPollAt = Date.now() + (secondsToMs(session.pollingConfig?.pollInterval) ?? 2000);
      fail('Google フォトで動画を選び「完了」を押してから取り込んでください。');
    }
    const report = {imported: 0, pending: 0, photosSkipped: 0, videosSkipped: 0, failed: 0};
    try {
      for (const item of await listPicked(entry)) {
        if (entry.controller.signal.aborted) break;
        if (item.type !== 'VIDEO') { report.photosSkipped++; continue; }
        if (item.mediaFile?.mediaFileMetadata?.videoMetadata?.processingStatus !== 'READY') {
          report.videosSkipped++; continue;
        }
        try {
          const result = await downloadVideo(entry, item.mediaFile, receive);
          report[result]++;
        }
        catch (error) {
          if (entry.controller.signal.aborted) break;
          report.failed++;
          report.error ??= error.status ? error.message : '動画を作業フォルダに保存できませんでした。';
        }
      }
      return report;
    } finally { await cancel(entry); }
  }

  return {state, start, authorize, importSelection, interrupt};
}
