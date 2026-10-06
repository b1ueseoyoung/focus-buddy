import {app} from 'electron';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
export interface NativeMenuRow {id:number;label:string;enabled:boolean}
export function createNativeMenu(icon:string,onAction:(id:number)=>void) {
  const executable=app.isPackaged?resolve(process.resourcesPath,'app.asar.unpacked/resources/focus-menu-helper'):resolve(__dirname,'../../resources/focus-menu-helper');
  let child:ChildProcessWithoutNullStreams|null=null;let stopped=false;let retry:NodeJS.Timeout|undefined;
  let latest:{type:string;title:string;tooltip:string;items:NativeMenuRow[];status:string;phase:string}|undefined;
  let diagnostic:Record<string,unknown>={backend:'AppKit',ready:false};
  function send(message:unknown){if(child?.stdin.writable)child.stdin.write(JSON.stringify(message)+'\n');}
  function start(){
    if(stopped)return;
    child=spawn(executable,[icon.replace('app.asar/','app.asar.unpacked/'),String(process.pid)],{stdio:'pipe'});
    child.on('error',error=>console.error('Focus Buddy native menu failed:',error.message));
    child.stderr.on('data',buffer=>console.warn('Focus Buddy native menu:',String(buffer).trim()));
    createInterface({input:child.stdout}).on('line',line=>{
      try{const event=JSON.parse(line);if(event.type==='action'&&Number.isInteger(event.id))onAction(event.id);else if(event.type==='diagnostic')diagnostic={...diagnostic,backend:'AppKit',ready:true,...event};else if(event.type==='animation')diagnostic={...diagnostic,animation:event};}catch{console.warn('Invalid native menu response');}
    });
    child.on('exit',()=>{diagnostic={...diagnostic,ready:false};child=null;if(!stopped){retry=setTimeout(start,1000);retry.unref();}});
    child.stdin.on('error',()=>{});
    if(latest)send(latest);
  }
  start();
  app.once('will-quit',()=>{stopped=true;if(retry)clearTimeout(retry);send({type:'quit'});child?.stdin.end();});
  return {
    update(title:string,tooltip:string,items:NativeMenuRow[],status:string,phase:string){latest={type:'update',title,tooltip,items,status,phase};send(latest);},
    diagnostics:()=>({...diagnostic,helperExecutable:executable}),
    testAction(id:number){if(process.env.FOCUS_BUDDY_E2E!=='1')throw Error('Native menu test disabled');send({type:'testAction',id});},
    testOpen(){if(process.env.FOCUS_BUDDY_E2E!=='1')throw Error('Native menu test disabled');send({type:'testOpen'});},
  };
}
