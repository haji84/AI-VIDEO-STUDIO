/** Generated full MP4/audio probe for the finished-file replay path.
 * Does not establish editor export correctness or browser/native acceptance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {completedClipWindow} from './completed-audio-preview.mjs';
const exec=promisify(execFile);
async function run(command,args){return (await exec(command,args,{maxBuffer:2*1024*1024,timeout:60000})).stdout;}
function amplitude(pcm,freq){
 const n=pcm.length/2,omega=2*Math.PI*freq/48000,cs=Math.cos(omega),sn=Math.sin(omega);
 let prev=0,prev2=0;
 for(let i=0;i<n;i++){const sample=pcm.readInt16LE(i*2)/32768;const q=sample+2*cs*prev-prev2;prev2=prev;prev=q;}
 return Math.sqrt((prev-cs*prev2)**2+(sn*prev2)**2)/n;
}
test('finished MP4 uses the project-global audible window (synthetic four-tone movie)',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'aivs-audible-preview-'));
 try{
  const file=join(folder,'finished.mp4'),duration=16;
  await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',
   '-f','lavfi','-i',`color=c=blue:s=48x48:r=10:d=${duration}`,
   '-f','lavfi','-i',`sine=frequency=300:sample_rate=48000:duration=${duration}`,
   '-f','lavfi','-i','sine=frequency=600:sample_rate=48000:duration=2',
   '-f','lavfi','-i','sine=frequency=900:sample_rate=48000:duration=2',
   '-f','lavfi','-i','sine=frequency=1200:sample_rate=48000:duration=1',
   '-filter_complex','[1:a]volume=0.3[a0];[2:a]adelay=288000S:all=1,volume=0.3[a1];[3:a]adelay=432000S:all=1,volume=0.3[a2];[4:a]adelay=576000S:all=1,volume=0.3[a3];[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0[a]',
   '-map','0:v','-map','[a]','-c:v','mpeg4','-c:a','aac','-b:a','192k','-t',String(duration),file]);
  assert.ok((await stat(file)).size>5000);
  const project={timeline:[{clipId:'clip_second',startSec:3.25,sourceInSec:10,durationSec:20,speed:2}]};
  const window=completedClipWindow(project,'clip_second',2);
  assert.equal(window.startSec,5.25);assert.equal(window.endSec,12.25);
  for (const [time,frequency,present] of [[5.5,600,false],[6.5,600,true],[9.5,900,true],[12.1,1200,true]]) {
   const {stdout}=await exec('ffmpeg',['-hide_banner','-nostdin','-v','error','-ss',String(time),'-i',file,'-vn','-ac','1','-ar','48000','-t','0.15','-f','s16le','pipe:1'],{encoding:'buffer',timeout:60000,maxBuffer:2*1024*1024});
   assert.ok(stdout.length>10000);const measured=amplitude(stdout,frequency);
   assert.ok(present?measured>0.006:measured<0.002,`tone ${frequency} at global ${time}: ${measured}`);
  }
  const inspection=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-of','json',file]));
  assert.ok(inspection.streams.some(s=>s.codec_type==='video'));
  assert.ok(inspection.streams.some(s=>s.codec_type==='audio'));
  await run('ffmpeg',['-hide_banner','-nostdin','-v','error','-i',file,'-f','null','-']);
 }finally{await rm(folder,{recursive:true,force:true});}
});
