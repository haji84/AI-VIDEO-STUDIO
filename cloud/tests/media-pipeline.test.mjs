/** Local integration acceptance for the real FFmpeg renderer, with fake cloud R2/D1.
 * This does NOT prove actual Cloudflare or Cloud Run deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import worker from '../src/worker.mjs';
import {fixture,api} from './helpers.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const root=resolve(new URL('../../',import.meta.url).pathname);
function run(bin,args,cwd=root){const p=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:30000});
 if(p.error?.code==='ENOENT')return null;
 assert.equal(p.status,0,`${bin} failed: ${p.stderr||p.error?.message}`);
 return p;
}
test('R2-style upload -> frozen job -> real FFmpeg -> R2-style result -> technical completion',async(t)=>{
 if(!run('ffmpeg',['-version'])||!run('python',['--version']))return t.skip('ffmpeg or python unavailable');
 const folder=mkdtempSync(join(tmpdir(),'aivs-smoke-'));
 try{
  const input=join(folder,'camera.mp4');
  run('ffmpeg',['-hide_banner','-nostdin','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=15:duration=2','-f','lavfi','-i','sine=frequency=540:sample_rate=48000:duration=2','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',input]);
  const content=readFileSync(input);
  const f=fixture();
  const proj=await api(worker,f,'/api/projects',{method:'POST',body:{name:'非公開クラウド検証素材',mode:'training'}});
  assert.equal(proj.status,201);const pid=proj.data.project.id;
  const init=await api(worker,f,`/api/projects/${pid}/uploads`,{method:'POST',body:{filename:'camera.mp4',bytes:content.length,fingerprint:sha('local-smoke-sample')}});
  assert.equal(init.status,201,JSON.stringify(init.data));
  const uploaded=await api(worker,f,`/api/uploads/${init.data.uploadId}/parts/1`,{method:'PUT',body:content,headers:{'x-content-sha256':sha(content)}});
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  const done=await api(worker,f,`/api/uploads/${init.data.uploadId}/complete`,{method:'POST',body:{}});
  assert.equal(done.status,200,JSON.stringify(done.data));
  const a=done.data.assetId;
  const clip={id:'clip_first',sourceId:a,start:0,duration:1,speed:1,layout:'single',caption:'訓練開始'};
  assert.equal((await api(worker,f,`/api/projects/${pid}`,{method:'PATCH',body:{expectedRevision:1,timeline:[clip]}})).status,200);
  const queued=await api(worker,f,`/api/projects/${pid}/jobs`,{method:'POST',body:{kind:'render',quality:'review'}});
  assert.equal(queued.status,202);const jid=queued.data.jobId;
  f.env.WORKER_TOKEN='isolated-local-render-test-internal-token-xxx';
  const mp=await api(worker,f,`/api/internal/jobs/${jid}/manifest`,{token:f.env.WORKER_TOKEN});
  assert.equal(mp.status,200);assert.equal(mp.data.manifest.sources.length,1);
  const source=mp.data.manifest.sources[0];
  const fromStorage=f.env.MEDIA.done.get(source.objectKey);
  assert.deepEqual(fromStorage,content);
  const stage=join(folder,'stage.mp4');writeFileSync(stage,fromStorage);
  const manifest={...mp.data.manifest,sources:[{assetId:source.assetId,path:stage}]};
  const json=join(folder,'manifest.json');writeFileSync(json,JSON.stringify(manifest));
  const output=join(folder,'rendered.mp4');
  const render=run('python',['-m','engine.run_manifest','--manifest',json,'--workspace',join(folder,'work'),'--output',output]);
  assert.equal(JSON.parse(render.stdout).technical_ok,true);
  assert.ok(statSync(output).size>1000);
  const decoded=run('ffmpeg',['-hide_banner','-nostdin','-v','error','-i',output,'-f','null','-']);
  assert.equal(decoded.status,0);
  f.env.PROCESSOR_ENABLED='1';f.env.CLOUD_PROCESSING_APPROVED='1';
  const claimed=await api(worker,f,`/api/internal/jobs/${jid}/claim`,{method:'POST',body:{},token:f.env.WORKER_TOKEN});
  assert.equal(claimed.status,200);
  const outputKey=`owner_preview/${pid}/exports/${jid}/result.mp4`;
  f.env.MEDIA.done.set(outputKey,readFileSync(output));
  const completed=await api(worker,f,`/api/internal/jobs/${jid}/report`,{method:'POST',body:{success:true,technicalOk:true,resultKey:outputKey},token:f.env.WORKER_TOKEN});
  assert.equal(completed.status,200);
  assert.equal(completed.data.status,'completed_technical');
  const state=await api(worker,f,`/api/jobs/${jid}`);
  assert.equal(state.data.job.status,'completed_technical');
  console.log('MEDIA_PIPELINE: synthetic real MP4 -> mocked cloud R2/D1 -> FFmpeg -> decoded MP4 -> mocked technical completion');
 }finally{rmSync(folder,{recursive:true,force:true})}
});
