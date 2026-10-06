import type {Snapshot} from '../../shared/focus/types';
export interface SnoreCheckpoint {sessionId:string|null;bucket:number}
export class SnoreCueClock {
 constructor(public checkpoint:SnoreCheckpoint={sessionId:null,bucket:0},private readonly save:(value:SnoreCheckpoint)=>void=()=>{}){}
 observe(s:Snapshot):string|null{
  if(!s.sessionId||s.phase!=='focus')return null;
  const bucket=Math.max(0,Math.floor((s.plannedSeconds*1000-s.remainingMs)/300000));
  if(this.checkpoint.sessionId!==s.sessionId){const next={sessionId:s.sessionId,bucket};this.save(next);this.checkpoint=next;return null;}
  if(bucket<=this.checkpoint.bucket)return null;
  const next={sessionId:s.sessionId,bucket};this.save(next);this.checkpoint=next;
  return s.status==='running'?`${s.sessionId}:${bucket}`:null;
 }
}

/** Optional cue persistence must not interrupt timer state delivery. */
export function observeSnoreCue(clock:SnoreCueClock,snapshot:Snapshot,onError:(error:unknown)=>void,loadCheckpoint?:()=>SnoreCheckpoint):string|null {
 try{if(loadCheckpoint)clock.checkpoint=loadCheckpoint();return clock.observe(snapshot);}catch(error){onError(error);return null;}
}
