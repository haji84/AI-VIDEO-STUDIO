export const resumableVideoThreshold = 16 * 1024 ** 2;

const start = '/api/import/resume/start';
const chunk = '/api/import/resume/chunk';
const finish = '/api/import/resume/finish';

function readReceipt(record, file) {
  if (!record || record.name !== file.name || record.totalBytes !== file.size) {
    throw new Error('中断した読み込みを再開するには同じ動画を選んでください。');
  }
  const {uploadId, offset, chunkBytes, chunkHashes} = record;
  if (!/^asset_[a-f0-9]{32}$/.test(uploadId) || !Number.isSafeInteger(chunkBytes) ||
      chunkBytes <= 0 || chunkBytes > resumableVideoThreshold || !Number.isSafeInteger(offset) ||
      offset < 0 || offset > file.size || (offset !== file.size && offset % chunkBytes !== 0) ||
      !Array.isArray(chunkHashes) || chunkHashes.length !== Math.ceil(offset / chunkBytes) ||
      chunkHashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('保存した動画の再開位置を確認できません。');
  }
  return record;
}

async function hashBlob(blob) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function resumeVideoUpload({file, receipt, request, onProgress}) {
  const record = readReceipt(receipt ?? await request(start, {
    method: 'POST', body: JSON.stringify({name: file.name, totalBytes: file.size}),
  }), file);
  const {uploadId, chunkBytes, chunkHashes, offset} = record;
  onProgress(record);

  for (const [index, expected] of chunkHashes.entries()) {
    const first = index * chunkBytes;
    if (await hashBlob(file.slice(first, Math.min(first + chunkBytes, offset))) !== expected) {
      throw new Error('保存した部分と内容が違います。再開するには同じ動画を選んでください。');
    }
  }

  for (let first = offset; first < file.size; first += chunkBytes) {
    const end = Math.min(first + chunkBytes, file.size);
    const body = file.slice(first, end);
    const hash = await hashBlob(body);
    const next = readReceipt(await request(chunk, {method: 'POST', body, headers: {
      'X-AIVS-Upload-Id': uploadId,
      'X-AIVS-Upload-Offset': String(first),
      'X-AIVS-Chunk-SHA256': hash,
    }}), file);
    if (next.uploadId !== uploadId || next.chunkBytes !== chunkBytes || next.offset !== end ||
        next.chunkHashes.at(-1) !== hash) {
      throw new Error('保存した動画の再開位置を確認できません。');
    }
    onProgress(next);
  }

  return request(finish, {method: 'POST', body: JSON.stringify({uploadId})});
}
