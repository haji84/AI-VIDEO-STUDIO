export const resumableVideoThreshold = 16 * 1024 ** 2;
const maxVideoBytes = 16 * 1024 ** 3;

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
      !Array.isArray(chunkHashes) || chunkHashes.length !== Math.ceil(file.size / chunkBytes) ||
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
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxVideoBytes) {
    throw new Error('この動画のサイズには対応していません。');
  }
  const saved = receipt ? readReceipt(receipt, file) : null;
  const chunkBytes = saved?.chunkBytes ?? resumableVideoThreshold;
  const chunkHashes = [];
  for (let first = 0; first < file.size; first += chunkBytes) {
    const hash = await hashBlob(file.slice(first, first + chunkBytes));
    if (saved && saved.chunkHashes[chunkHashes.length] !== hash) {
      throw new Error('最初に選んだ動画と内容が違います。再開するには同じ動画を選んでください。');
    }
    chunkHashes.push(hash);
  }
  const record = saved ?? readReceipt(await request(start, {
    method: 'POST', body: JSON.stringify({name: file.name, totalBytes: file.size, chunkHashes}),
  }), file);
  if (record.chunkBytes !== chunkBytes || record.chunkHashes.some((value, index) => value !== chunkHashes[index])) {
    throw new Error('保存した動画の再開位置を確認できません。');
  }
  const {uploadId, offset} = record;
  onProgress(record);

  for (let first = offset; first < file.size; first += chunkBytes) {
    const end = Math.min(first + chunkBytes, file.size);
    const body = file.slice(first, end);
    const index = first / chunkBytes;
    const hash = chunkHashes[index];
    const next = readReceipt(await request(chunk, {method: 'POST', body, headers: {
      'X-AIVS-Upload-Id': uploadId,
      'X-AIVS-Upload-Offset': String(first),
      'X-AIVS-Chunk-SHA256': hash,
    }}), file);
    if (next.uploadId !== uploadId || next.chunkBytes !== chunkBytes || next.offset !== end ||
        next.chunkHashes[index] !== hash) {
      throw new Error('保存した動画の再開位置を確認できません。');
    }
    onProgress(next);
  }

  return request(finish, {method: 'POST', body: JSON.stringify({uploadId})});
}
