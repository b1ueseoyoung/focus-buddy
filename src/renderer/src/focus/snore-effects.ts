import {useEffect} from 'react';
import {synthesizeSnore} from './snore-audio';
let audio:AudioContext|null=null;
export interface AudioPlaybackInfo {state:string;sampleRate:number;durationMs:number;peak:number;rms:number;output:'system default';playedAt:number}
export async function playSnore():Promise<AudioPlaybackInfo>{
 audio??=new AudioContext();await audio.resume();
 if(audio.state!=='running')throw new Error('Audio context is not running');
 const ctx=audio,signal=synthesizeSnore(ctx.sampleRate),buffer=ctx.createBuffer(1,signal.samples.length,ctx.sampleRate);buffer.copyToChannel(signal.samples,0);
 const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);source.start();source.onended=()=>source.disconnect();
 const info:AudioPlaybackInfo={state:ctx.state,sampleRate:ctx.sampleRate,durationMs:900,peak:signal.peak,rms:signal.rms,output:'system default',playedAt:Date.now()};
 window.electron?.ipcRenderer.send('focus:audio-status',{ok:true,...info});return info;
}
export function useSnoreEffects():void{
 useEffect(()=>{
  const listener=(_e:unknown,cue:{id:string;sound:boolean;visual?:boolean}):void=>{
   if(cue.visual!==false)document.dispatchEvent(new CustomEvent('focus-snore',{detail:cue}));
   if(cue.sound)void playSnore().catch(e=>window.electron?.ipcRenderer.send('focus:audio-status',{ok:false,error:String(e),playedAt:Date.now()}));
  };
  window.electron?.ipcRenderer.on('focus:snore-cue',listener);
  return()=>{window.electron?.ipcRenderer.removeListener('focus:snore-cue',listener);};
 },[]);
}
