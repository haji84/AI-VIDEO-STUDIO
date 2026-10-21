import {APIError, MAX_SOURCES, checkedMode, requireText} from './config.mjs';
const finitePositive=x=>typeof x==='number' && Number.isFinite(x) && x>0;
export function validateTimeline(timeline, assets) {
  if(!Array.isArray(timeline)||timeline.length>2000)throw new APIError('Timeline must contain at most 2000 clips');
  if(assets.length>MAX_SOURCES)throw new APIError('Too many source files');
  const names=new Set(assets.map(s=>s.id));
  let total=0;
  for(const s of timeline) {
    if(!s||typeof s!=='object'||!names.has(s.sourceId))throw new APIError('Timeline references a missing camera');
    if(typeof s.id!=='string'||!/^clip_[\w-]{1,70}$/.test(s.id))throw new APIError('Invalid clip id');
    if(typeof s.start!=='number'||!Number.isFinite(s.start)||s.start<0||!finitePositive(s.duration)||s.duration>14400)
      throw new APIError('Invalid clip time');
    if(!finitePositive(s.speed)||s.speed<0.25||s.speed>4)throw new APIError('Invalid clip speed');
    if(s.layout!=='single'&&s.layout!=='split')throw new APIError('Invalid layout');
    if(s.layout==='split'&&(!names.has(s.secondarySourceId)||s.secondarySourceId===s.sourceId))throw new APIError('Invalid second camera');
    if(typeof s.caption!=='string'||s.caption.length>250)throw new APIError('Invalid caption');
    const main=assets.find(a=>a.id===s.sourceId);
    // Durations not yet probed in this preview. Check against duration only when known.
    if(main.durationSeconds!=null && s.start+s.duration>main.durationSeconds+0.2)throw new APIError('Clip exceeds source duration');
    if(s.layout==='split') {
      const second=assets.find(a=>a.id===s.secondarySourceId);
      if(second.durationSeconds!=null && s.start+s.duration>second.durationSeconds+0.2)throw new APIError('Second camera does not cover this clip');
    }
    total+=s.duration/s.speed;
  }
  if(total>14400)throw new APIError('Timeline exceeds 4 hours');
  return {clips:timeline.length,durationSeconds:Math.round(total*1000)/1000};
}
export function projectInput(input) {
  return {name:requireText(input.name||'新規プロジェクト','name',80),mode:checkedMode(input.mode||'training')};
}
export function validateJobRequest(data) {
  if(!['analyze','edit','render'].includes(data.kind))throw new APIError('Invalid job kind');
  if(!['review','hd','fullhd'].includes(data.quality||'review'))throw new APIError('Invalid output quality');
  return {kind:data.kind,quality:data.quality||'review'};
}
