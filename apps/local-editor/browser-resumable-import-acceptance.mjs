/** Interrupt a local browser upload, reopen the editor, and verify the imported bytes. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {startServer} from './server.mjs';
import {resumableVideoThreshold as chunkBytes} from './video-upload.mjs';

const exec = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const root = resolve(import.meta.dirname, '../..');
const folder = await mkdtemp(join(tmpdir(), 'aivs-browser-resume-'));
const workspace = join(folder, 'workspace');
const input = join(folder, '再開テスト.mp4');
let server, browser;

try {
  const toolkit = await import('playwright').catch(() => {
    const directory = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (!directory) throw new Error('PLAYWRIGHT_PACKAGE_UNAVAILABLE');
    return createRequire(join(directory, 'aivs-browser.js'))('playwright');
  });
  const python = process.env.AIVS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const {ffmpeg} = JSON.parse((await exec(python, ['-m', 'engine.media_tools', '--resolve'], {cwd: root})).stdout);
  await exec(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=12:d=2', '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=16000:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);
  const video = await readFile(input);
  const free = Buffer.alloc(chunkBytes + 4096 - video.length);
  free.writeUInt32BE(free.length);
  free.write('free', 4);
  const media = Buffer.concat([video, free]);
  await writeFile(input, media);
  const alternate = join(folder, 'different', '再開テスト.mp4');
  await mkdir(join(folder, 'different'));
  const different = Buffer.from(media);
  different[different.length - 1] ^= 1;
  await writeFile(alternate, different);

  browser = await toolkit.chromium.launch({headless: true, executablePath: process.env.AIVS_BROWSER_EXECUTABLE});
  const offsets = [];
  const errors = [];
  async function openEditor(interrupt) {
    server = await startServer({workspace, port: 0});
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/import/resume/chunk', async route => {
      const offset = Number(route.request().headers()['x-aivs-upload-offset']);
      offsets.push(offset);
      if (interrupt && offset === chunkBytes) await route.abort('failed');
      else await route.continue();
    });
    await page.goto(server.url);
    await page.waitForFunction(() => document.getElementById('notice').textContent === '端末内に保存済み');
    return page;
  }
  let page = await openEditor(true);
  await page.locator('#video-files').setInputFiles(input);
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('接続が切れました'));
  assert.deepEqual(offsets, [0, chunkBytes]);
  assert.match(await page.locator('#resumable-import').innerText(), /99% を保存/);
  await page.close();
  await server.close();

  page = await openEditor(false);
  assert.match(await page.locator('#resumable-import').innerText(), /99% を保存/);
  await page.locator('#video-files').setInputFiles(alternate);
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('同じ動画を選んで'));
  assert.deepEqual(offsets, [0, chunkBytes]);
  await page.locator('#video-files').setInputFiles(input);
  await page.waitForFunction(() => document.getElementById('notice').textContent === '端末内に保存済み');
  assert.deepEqual(offsets, [0, chunkBytes, chunkBytes]);
  assert.equal(await page.locator('#resumable-import').isVisible(), false);
  await page.waitForFunction(() => document.getElementById('preview').videoWidth === 160);
  const state = await (await fetch(server.url + '/api/state', {headers: {'X-AIVS-Token': server.token}})).json();
  assert.equal(state.session.project.sourceRefs.length, 1);
  assert.equal(state.session.project.sourceRefs[0].sha256, sha256(media));
  assert.equal(state.resumableImport, null);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({scope: 'browser-resumable-import', verified: true, alteredSuffixRejected: true,
    committedBeforeInterruption: chunkBytes, sentAfterRestart: media.length - chunkBytes, sha256: sha256(media)}));
} finally {
  await browser?.close();
  await server?.close();
  await rm(folder, {recursive: true, force: true});
}
