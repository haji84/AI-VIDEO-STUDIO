import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {resumableVideoThreshold, resumeVideoUpload} from './video-upload.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const uploadId = 'asset_' + 'a'.repeat(32);
const file = new File(['abcdefghij'], '日本語サンプル.mp4');
const receipt = {
  uploadId, name: file.name, totalBytes: file.size, offset: 4, chunkBytes: 4,
  chunkHashes: ['abcd', 'efgh', 'ij'].map(sha256),
};

test('a reselected video verifies its saved prefix and sends only missing bytes', async () => {
  const offsets = [];
  const notices = [];
  const result = await resumeVideoUpload({file, receipt, onProgress: record => notices.push(record.offset),
    request: async (path, {body, headers}) => {
      if (path.endsWith('/finish')) {
        assert.deepEqual(JSON.parse(body), {uploadId});
        return {sources: [{assetId: uploadId}]};
      }
      assert.equal(path, '/api/import/resume/chunk');
      const offset = Number(headers['X-AIVS-Upload-Offset']);
      offsets.push(offset);
      assert.equal(headers['X-AIVS-Upload-Id'], uploadId);
      const text = await body.text();
      assert.equal(text, (await file.text()).slice(offset, offset + 4));
      assert.equal(headers['X-AIVS-Chunk-SHA256'], sha256(text));
      return {...receipt, offset: offset + body.size};
    }});
  assert.deepEqual(offsets, [4, 8]);
  assert.deepEqual(notices, [4, 8, 10]);
  assert.equal(result.sources[0].assetId, uploadId);
});

test('a different source with the same name and size cannot append to the saved video', async () => {
  for (const text of ['ABCDxxxxxx', 'abcdefghXX']) {
    const different = new File([text], file.name);
    await assert.rejects(resumeVideoUpload({file: different, receipt, onProgress: () => {},
      request: () => assert.fail('a different video body was sent')}), /同じ動画/);
  }
});

test('an unexpected server acknowledgement stops processing before finish', async () => {
  const calls = [];
  const chunkHashes = [sha256('abcdefghij')];
  await assert.rejects(resumeVideoUpload({file, receipt: null, onProgress: () => {},
    request: async (path, {body}) => {
      calls.push(path);
      if (path.endsWith('/start')) {
        assert.deepEqual(JSON.parse(body), {name: file.name, totalBytes: file.size, chunkHashes});
        return {...receipt, offset: 0, chunkBytes: resumableVideoThreshold, chunkHashes};
      }
      return {...receipt, offset: 8, chunkBytes: resumableVideoThreshold, chunkHashes};
    }}), /再開位置/);
  assert.deepEqual(calls, ['/api/import/resume/start', '/api/import/resume/chunk']);
});
