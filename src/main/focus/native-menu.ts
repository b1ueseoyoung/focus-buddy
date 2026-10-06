import {app} from 'electron';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {createNativeMenuController} from './native-menu-controller';
export interface NativeMenuRow {id:number;label:string;enabled:boolean}
export function createNativeMenu(icon:string,onAction:(id:number)=>void,onAvailability:(ready:boolean)=>void=()=>{}) {
  const executable=app.isPackaged?resolve(process.resourcesPath,'app.asar.unpacked/resources/focus-menu-helper'):resolve(__dirname,'../../resources/focus-menu-helper');
  let diagnostic:Record<string,unknown>={backend:'AppKit',ready:false};
  const controller=createNativeMenuController({
    launch:()=>spawn(executable,[icon.replace('app.asar/','app.asar.unpacked/'),String(process.pid)],{stdio:'pipe'}),
    connect(child,isCurrent){
      const stderr=(buffer:Buffer):void=>{if(isCurrent())console.warn('Focus Buddy native menu:',String(buffer).trim());};
      child.stderr.on('data',stderr);
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{
        if(!isCurrent())return;
        try{const event=JSON.parse(line);if(event.type==='action'&&Number.isInteger(event.id))onAction(event.id);else if(event.type==='diagnostic'){diagnostic={...diagnostic,...event,backend:'AppKit',ready:true};onAvailability(true);}else if(event.type==='animation')diagnostic={...diagnostic,animation:event};}catch{console.warn('Invalid native menu response');}
      });
      return ()=>{lines.close();child.stderr.removeListener('data',stderr);};
    },
    onUnavailable(){diagnostic={backend:'AppKit',ready:false};onAvailability(false);},
    onError:error=>console.error('Focus Buddy native menu failed:',error.message),
    schedule(callback,delayMs){const retry=setTimeout(callback,delayMs);retry.unref();return ()=>clearTimeout(retry);},
  });
  app.once('will-quit',()=>controller.stop());
  controller.start();
  return {
    update(title:string,tooltip:string,items:NativeMenuRow[],status:string,phase:string){controller.update({type:'update',title,tooltip,items,status,phase});},
    diagnostics:()=>({...diagnostic,helperExecutable:executable}),
    testAction(id:number){if(process.env.FOCUS_BUDDY_E2E!=='1')throw Error('Native menu test disabled');controller.send({type:'testAction',id});},
    testOpen(){if(process.env.FOCUS_BUDDY_E2E!=='1')throw Error('Native menu test disabled');controller.send({type:'testOpen'});},
  };
}
