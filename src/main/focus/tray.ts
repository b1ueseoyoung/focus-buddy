import { app, Menu, nativeImage, Tray } from 'electron';
import type { Snapshot } from '../../shared/focus/types';
import trayIcon from '../../../resources/tray-icon.png?asset';
import trayIcon2x from '../../../resources/tray-icon@2x.png?asset';
import {readFileSync} from 'node:fs';
import {createNativeMenu} from './native-menu';
let retainedTray:Tray|null=null;
export interface TrayItem { label:string;enabled:boolean;click():void|Promise<void> }
export interface FocusTrayDeps {
  showMain():void;showMini():void|Promise<void>;hideMini():void;widgetEnabled():boolean;
  openPanel(panel:'today'|'settings'):void;
  start():Promise<unknown>;pause():Promise<unknown>;resume():Promise<unknown>;
  reset():Promise<unknown>;finish():Promise<unknown>;skip():Promise<unknown>;
  scale():number;setScale(value:number):void;
}
export interface FocusTray {update(snapshot:Snapshot):void;items():TrayItem[];title():string;diagnostics():unknown;testNativeAction(label:string):void;testNativeOpen():void}
export function createFocusTray(deps:FocusTrayDeps):FocusTray {
  const image=nativeImage.createEmpty();
  image.addRepresentation({scaleFactor:1,buffer:readFileSync(trayIcon)});
  image.addRepresentation({scaleFactor:2,buffer:readFileSync(trayIcon2x)});
  if(image.isEmpty())throw new Error('Focus Buddy tray icon is empty');
  image.setTemplateImage(process.platform==='darwin');
  const tray=process.platform==='darwin'?null:new Tray(image);retainedTray=tray;
  console.log('[Focus Buddy tray]',JSON.stringify({build:'dot-cat-r5',pid:process.pid,imageEmpty:image.isEmpty(),imageSize:image.getSize(),scaleFactors:image.getScaleFactors(),template:image.isTemplateImage()}));
  let items:TrayItem[]=[];let signature='';let menu:Menu|null=null;let title='';
  const native=process.platform==='darwin'?createNativeMenu(trayIcon,id=>{
    const item=items[id];if(item?.enabled)Promise.resolve(item.click()).catch(e=>console.error('focus menu command failed',e));
  }):null;
  const update=(s:Snapshot):void=>{
    const seconds=Math.max(0,Math.ceil(s.remainingMs/1000));const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    const phase=(s.phase??s.suggestedNext??'focus')==='focus'?'집중':(s.phase??s.suggestedNext)==='long_break'?'긴 휴식':'휴식';
    const status=s.status==='paused'?'일시정지':s.status==='running'?'진행 중':'대기';
    title=clock;
    tray?.setTitle(title);tray?.setToolTip(`Focus Buddy · ${phase} ${clock} · ${status}`);
    const label=`${phase} ${clock} · ${status}`;
    const nextSignature=`${s.status}/${s.phase}/${s.suggestedNext}/${deps.widgetEnabled()}/${deps.scale()}`;
    if(signature!==nextSignature) {
      signature=nextSignature;
      const active=s.status==='running'||s.status==='paused';
      items=[
        {label,enabled:false,click:()=>{}},
        {label:'시작',enabled:!active,click:async()=>{await deps.start();}},
        {label:'일시정지',enabled:s.status==='running',click:async()=>{await deps.pause();}},
        {label:'재개',enabled:s.status==='paused',click:async()=>{await deps.resume();}},
        {label:'현재 타이머 초기화',enabled:active,click:async()=>{await deps.reset();}},
        {label:'현재 단계 종료',enabled:active,click:async()=>{await deps.finish();}},
        {label:'휴식 건너뛰기',enabled:(s.phase!==null&&s.phase!=='focus')||(s.status==='awaiting_next'&&s.suggestedNext!=='focus'),click:async()=>{await deps.skip();}},
        {label:deps.widgetEnabled()?'위젯 끄기':'위젯 켜기',enabled:true,click:()=>deps.widgetEnabled()?deps.hideMini():deps.showMini()},
        ...[.8,1,1.25,1.5].map(value=>({label:`위젯 크기 ${Math.round(value*100)}%${Math.abs(deps.scale()-value)<.01?' ✓':''}`,enabled:true,click:()=>deps.setScale(value)})),
        {label:'설정 및 작업명',enabled:true,click:()=>deps.openPanel('settings')},
        {label:'오늘 기록',enabled:true,click:()=>deps.openPanel('today')},
        {label:'기본 화면 열기',enabled:true,click:deps.showMain},
        {label:'Focus Buddy 종료',enabled:true,click:()=>{setImmediate(()=>app.quit());}},
      ];
      if(tray){menu=Menu.buildFromTemplate(items.map((item,i)=>({id:i===0?'timer':undefined,label:item.label,enabled:item.enabled,click:()=>{Promise.resolve(item.click()).catch(e=>console.error('focus menu command failed',e));}})));tray.setContextMenu(menu);}
    } else {
      if(items[0])items[0].label=label;
      const timer=menu?.getMenuItemById('timer');if(timer)timer.label=label;
    }
    native?.update(title,`Focus Buddy · ${phase} ${clock} · ${status}`,items.map((item,id)=>({id,label:item.label,enabled:item.enabled})),s.status,s.phase??s.suggestedNext??'focus');
  };
  return {update,items:()=>items,title:()=>title,
    testNativeAction:label=>{const id=items.findIndex(item=>item.label===label&&item.enabled);if(id<0||!native)throw Error(`Native menu item unavailable: ${label}; ${JSON.stringify(items.map(i=>({label:i.label,enabled:i.enabled})))}`);native.testAction(id);},
    testNativeOpen:()=>{if(!native)throw Error('Native menu unavailable');native.testOpen();},
    diagnostics:()=>({build:'dot-cat-r5-native',pid:process.pid,title,bounds:tray?.getBounds(),imageSize:image.getSize(),imageEmpty:image.isEmpty(),retained:native?true:retainedTray===tray,destroyed:tray?.isDestroyed()??false,scaleFactors:image.getScaleFactors(),template:image.isTemplateImage(),...(native?.diagnostics()??{backend:'Electron'})})};
}
