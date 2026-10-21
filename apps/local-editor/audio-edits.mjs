/** Explicit audio edits use the shared project validator and never touch media. */
import {validateProject} from '../../packages/project/project.mjs';
const editable=['startSec','endSec','trimInSec','speed','gainDb','loop','fadeInSec','fadeOutSec'];
function find(project,id){const index=project.audioClips.findIndex(a=>a.id===id);if(index<0)throw new Error('AUDIO_CLIP_NOT_FOUND: 音声を選び直してください');return index;}
export function editAudioClip(project,id,changes){
  validateProject(project);
  if(!changes||Object.getPrototypeOf(changes)!==Object.prototype||Object.keys(changes).some(k=>!editable.includes(k)))
    throw new Error('UNSUPPORTED_AUDIO_EDIT: 配置・使用範囲・音量・フェードを指定してください');
  const p=structuredClone(project),a=p.audioClips[find(p,id)];
  if(!Object.keys(changes).some(k=>a[k]!==changes[k]))return p;
  Object.assign(a,changes);
  // Manually edited app-created slots become explicit independent audio.
  // This prevents future cut trims/BGM resizing from overwriting their timing.
  if(p.timeline.some(c=>a.id==='audio_'+c.clipId)||/^audio_bgm_[a-f0-9]{32}$/.test(a.id)){
    let index=1;while(p.audioClips.some(other=>other.id==='audio_manual_'+index))index++;
    a.id='audio_manual_'+index;
  }
  validateProject(p);return p;
}
export function removeAudioClip(project,id){
  validateProject(project);const p=structuredClone(project);p.audioClips.splice(find(p,id),1);validateProject(p);return p;
}
