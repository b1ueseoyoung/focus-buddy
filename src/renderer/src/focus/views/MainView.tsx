import {useEffect,useState} from 'react';
import {SettingsPanel} from './SettingsPanel';
import {TodayPanel} from './TodayPanel';
import {useFocus} from '../store';
import {formatClock} from '../format';
import './buddy-panel.css';
export type MainPanel='today'|'settings';
export function MainView({initialPanel=null}:{initialPanel?:MainPanel|null}):JSX.Element {
 const [panel,setPanel]=useState<MainPanel>(initialPanel??'settings');
 const {snapshot:s,dispatch}=useFocus();const [pending,setPending]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{const open=(_e:unknown,v:MainPanel):void=>{if(v==='today'||v==='settings')setPanel(v);};window.electron?.ipcRenderer.on('focus:open-panel',open);return()=>{window.electron?.ipcRenderer.removeListener('focus:open-panel',open);};},[]);
 const label=s?.status==='paused'?'일시정지':(s?.phase??s?.suggestedNext??'focus')==='focus'?'집중':'휴식';
 return <main className="buddy-app">
  <header className="buddy-header"><img src="./cat/app-icon.png" alt=""/><div><h1>Focus Buddy</h1><p>고양이와 함께, 한 번에 한 가지.</p></div><span className="buddy-version">도트 캣 · r5</span></header>
  <nav className="buddy-tabs" aria-label="설정과 기록 화면" role="tablist">{(['settings','today'] as const).map((v,i)=><button key={v} id={'tab-'+v} role="tab" aria-selected={panel===v} aria-controls={'panel-'+v} tabIndex={panel===v?0:-1} onClick={()=>setPanel(v)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'settings':e.key==='End'?'today':v==='today'?'settings':'today';setPanel(next);document.getElementById('tab-'+next)?.focus();}}}>{i===0?'설정':'기록'}</button>)}</nav>
  <div className="buddy-now"><span className="buddy-status-dot"/><span>{label}</span><strong>{formatClock(s?.remainingMs??1500000)}</strong><button disabled={!s||pending} onClick={()=>{setPending(true);void dispatch(s?.status==='running'?{type:'pause'}:s?.status==='paused'?{type:'resume'}:{type:s?.status==='awaiting_next'?'startNext':'startFocus',taskName:localStorage.getItem('focus-buddy.pixel.next-task')??''}).then(r=>{if(!r.ok)setMessage(r.message);}).finally(()=>setPending(false));}}>{s?.status==='running'?'일시정지':s?.status==='paused'?'재개':'시작'}</button></div>
  {message&&<p className="buddy-error" role="alert">{message}</p>}
  <div className="buddy-content" id={'panel-'+panel} role="tabpanel" aria-labelledby={'tab-'+panel}>
   {panel==='settings'?<SettingsPanel open onClose={()=>{}}/>:<TodayPanel open onClose={()=>{}}/>}
  </div>
 </main>;
}
