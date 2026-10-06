export interface SnoreSamples {samples:Float32Array;peak:number;rms:number}
/** Local breath + voiced snore: audible on laptop speakers, with no network asset. */
export function synthesizeSnore(sampleRate:number,random:()=>number=Math.random):SnoreSamples {
 const samples=new Float32Array(Math.round(sampleRate*.9));let phase=0,breath=0,peak=0,sum=0;
 for(let i=0;i<samples.length;i++){
  const t=i/sampleRate,envelope=Math.sin(Math.PI*t/.9)**2;
  phase+=2*Math.PI*(170-35*t/.9)/sampleRate;
  breath=.9*breath+.1*(random()*2-1);
  const voiced=Math.sin(phase)+.32*Math.sin(phase*2)+.16*Math.sin(phase*3);
  samples[i]=envelope*(.17*voiced+.08*breath);peak=Math.max(peak,Math.abs(samples[i]));sum+=samples[i]**2;
 }
 return {samples,peak,rms:Math.sqrt(sum/samples.length)};
}
