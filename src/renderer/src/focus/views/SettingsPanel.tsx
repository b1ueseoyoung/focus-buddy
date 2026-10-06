import {playSnore} from '../snore-effects';
import {useEffect,useRef,useState} from 'react';
import {useWidgetScale} from '../use-widget-scale';
import { applySettingsPatch, VALIDATION_MESSAGES, type ValidationCode } from '../../../../shared/focus/commands';
import { PRESETS, RANGES } from '../../../../shared/focus/constants';
import type { Durations, PresetId, Settings, SettingsPatch } from '../../../../shared/focus/types';
import {SETTINGS_APPLY_NOTE} from '../labels';
import { useFocus } from '../store';
import { readSnoreSetting, saveSettingsDraft } from '../settings-save';

type DurationKey = keyof Durations;

const DURATION_KEYS: readonly DurationKey[] = ['focusMin', 'shortBreakMin', 'longBreakMin'];
const DURATION_META: Record<DurationKey, { label: string; code: ValidationCode }> = {
  focusMin: { label: '집중 시간(분)', code: 'FOCUS_RANGE' },
  shortBreakMin: { label: '짧은 휴식(분)', code: 'SHORT_RANGE' },
  longBreakMin: { label: '긴 휴식(분)', code: 'LONG_RANGE' },
};
const PRESET_IDS: readonly PresetId[] = ['classic', 'long', 'custom'];
const BOOLEAN_FIELDS = [
  { key: 'soundEnabled', label: '효과음' },
  { key: 'osNotificationEnabled', label: 'OS 알림' },
  { key: 'alwaysOnTop', label: '작은 창 항상 위에 표시' },
] as const;

const invokeSnore = (value?: boolean): Promise<unknown> => {
  const ipc = window.electron?.ipcRenderer;
  if (!ipc) return Promise.reject(new Error('앱 연결을 찾지 못했어요. 다시 불러와 주세요.'));
  return ipc.invoke('focus:snore-settings', value);
};


interface Form {
  preset: PresetId;
  durations: Record<DurationKey, string>;
  soundEnabled: boolean;
  osNotificationEnabled: boolean;
  alwaysOnTop: boolean;
}

const toStrings = (d: Durations): Record<DurationKey, string> => ({
  focusMin: String(d.focusMin),
  shortBreakMin: String(d.shortBreakMin),
  longBreakMin: String(d.longBreakMin),
});

const toForm = (s: Settings): Form => ({
  preset: s.preset,
  durations: toStrings(s.durations),
  soundEnabled: s.soundEnabled,
  osNotificationEnabled: s.osNotificationEnabled,
  alwaysOnTop: s.alwaysOnTop,
});

function durationError(key: DurationKey, raw: string): string | null {
  const [min, max] = RANGES[key];
  const n = raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? null : VALIDATION_MESSAGES[DURATION_META[key].code];
}

// 바꾸지 않은 키는 patch 에서 뺀다(commands.ts 는 undefined 값을 거부한다).
function buildPatch(form: Form, current: Settings): SettingsPatch {
  const patch: SettingsPatch = {};
  if (form.preset === 'custom') {
    const durations: Durations = {
      focusMin: Number(form.durations.focusMin),
      shortBreakMin: Number(form.durations.shortBreakMin),
      longBreakMin: Number(form.durations.longBreakMin),
    };
    const same = current.preset === 'custom' && DURATION_KEYS.every((key) => durations[key] === current.durations[key]);
    if (!same) {
      patch.preset = 'custom';
      patch.durations = durations;
    }
  } else if (form.preset !== current.preset) {
    patch.preset = form.preset;
  }
  for (const { key } of BOOLEAN_FIELDS) {
    if (form[key] !== current[key]) patch[key] = form[key];
  }
  return patch;
}

export function SettingsPanel({open}:{open:boolean;onClose:()=>void}):JSX.Element {
 const {snapshot}=useFocus();if(!open)return <></>;return snapshot?<SettingsForm current={snapshot.settings}/>:<p role="status">불러오는 중…</p>;
}
function SettingsForm({current}:{current:Settings}):JSX.Element {
 const {dispatch,windows}=useFocus();const {scale,setScale}=useWidgetScale();
 const [form,setForm]=useState<Form>(()=>toForm(current));const [task,setTask]=useState(()=>localStorage.getItem('focus-buddy.pixel.next-task')??'');
 const [previewStatus,setPreviewStatus]=useState('');
 const [snoreSound,setSnoreSound]=useState(false);
 const [snoreState,setSnoreState]=useState<'loading'|'ready'|'error'>('loading');
 const [snoreReadAttempt,setSnoreReadAttempt]=useState(0);const [snoreError,setSnoreError]=useState('');
 useEffect(()=>{
  let disposed=false;setSnoreState('loading');setSnoreError('');
  void readSnoreSetting(invokeSnore).then(value=>{if(!disposed){setSnoreSound(value);setSnoreState('ready');}},()=>{if(!disposed){setSnoreError('코골이 설정을 읽지 못했어요. 다시 불러와 주세요.');setSnoreState('error');}});
  return()=>{disposed=true;};
 },[snoreReadAttempt]);
 const [saving,setSaving]=useState(false);const [status,setStatus]=useState('');const [error,setError]=useState('');
 const savePending=useRef(false);
 const custom=form.preset==='custom';const errors=DURATION_KEYS.map(k=>custom?durationError(k,form.durations[k]):null);
 const choose=(preset:PresetId):void=>{setStatus('');setForm(f=>({...f,preset,durations:preset==='custom'?f.durations:toStrings(PRESETS[preset])}));};
 const save=async():Promise<void>=>{
  if(savePending.current||snoreState!=='ready')return;
  savePending.current=true;setSaving(true);setError('');setStatus('');
  try{
   const patch=buildPatch(form,current);const check=applySettingsPatch(current,patch);
   if(!check.ok){setError(check.message);return;}
   await saveSettingsDraft({patch,snoreSound,taskName:task},{savePrimary:value=>dispatch({type:'updateSettings',patch:value}),saveSnore:invokeSnore,saveTask:value=>localStorage.setItem('focus-buddy.pixel.next-task',value)});
   setStatus('저장했어요. 다음 집중부터 함께해요.');
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{savePending.current=false;setSaving(false);}
 };
 return <form className="buddy-form" onSubmit={e=>{e.preventDefault();void save();}}>
  <div className="buddy-scroll">
   <section className="buddy-card"><div className="buddy-section-heading"><span>01</span><h2>집중 리듬</h2></div>
    <fieldset className="buddy-presets" disabled={saving}><legend className="sr-only">시간 프리셋</legend>{PRESET_IDS.map(id=><label key={id} className={form.preset===id?'selected':''}><input type="radio" name="preset" value={id} checked={form.preset===id} onChange={()=>choose(id)}/><strong>{id==='classic'?'기본':id==='long'?'길게':'직접 설정'}</strong><span>{id==='classic'?'25 / 5 / 15분':id==='long'?'50 / 10 / 20분':'나에게 맞게'}</span></label>)}</fieldset>
    <div className="buddy-duration-row">{DURATION_KEYS.map((key,i)=><label key={key}>{['집중','짧은 휴식','긴 휴식'][i]}<div className="buddy-number"><input aria-label={DURATION_META[key].label} type="number" min={RANGES[key][0]} max={RANGES[key][1]} step="1" disabled={!custom||saving} value={form.durations[key]} aria-invalid={!!errors[i]} onChange={e=>{const value=e.currentTarget.value;setStatus('');setForm(f=>({...f,durations:{...f.durations,[key]:value}}));}}/><span>분</span></div>{errors[i]&&<small className="buddy-error">{errors[i]}</small>}</label>)}</div><p className="buddy-help">{SETTINGS_APPLY_NOTE}</p>
   </section>
   <section className="buddy-card"><div className="buddy-section-heading"><span>02</span><h2>다음 집중 작업</h2></div><input className="buddy-task" aria-label="작업명" maxLength={100} disabled={saving} value={task} placeholder="예: 책 10페이지 읽기" onChange={e=>{setTask(e.target.value);setStatus('');}}/><p className="buddy-help">비워 두면 ‘자유 집중’으로 기록해요.</p></section>
   <section className="buddy-card"><div className="buddy-section-heading"><span>03</span><h2>작은 창과 알림</h2></div><div className="buddy-widget-row"><div><strong>고양이 위젯</strong><p className="buddy-help">오른쪽 아래 모서리를 끌어 크기를 바꿔요.</p></div><button type="button" onClick={()=>{void windows.showMini();}}>위젯 보기 ↗</button></div><div className="buddy-scale-options" aria-label="위젯 크기">{[0.8,1,1.25,1.5].map(v=><button type="button" key={v} aria-pressed={Math.abs(scale-v)<0.01} onClick={()=>{void setScale(v).catch(e=>setError(String(e)));}}>{Math.round(v*100)}%</button>)}</div>
    <p className="buddy-help">집중 5분마다 작은 zZZ가 잠깐 떠올라요.</p><div className="buddy-sound-preview"><button type="button" onClick={()=>{void playSnore().then(()=>setPreviewStatus('짧은 소리를 재생했어요.')).catch(()=>setPreviewStatus('재생하지 못했어요. 미리 듣기를 다시 눌러 주세요.'));}}>소리 미리 듣기</button><span role="status">{previewStatus||'소리는 기본 꺼짐 · 미리 듣기는 설정을 바꾸지 않아요.'}</span></div><div className="buddy-switches"><label><span>고양이 코골이 소리 <small>기본 꺼짐</small></span><input type="checkbox" role="switch" aria-label="고양이 코골이 소리" checked={snoreSound} disabled={saving||snoreState!=='ready'} onChange={e=>{setSnoreSound(e.currentTarget.checked);setStatus('');}}/></label>{snoreState==='loading'&&<p className="buddy-help" role="status">코골이 설정을 불러오는 중…</p>}{snoreState==='error'&&<div><p className="buddy-error" role="alert">{snoreError}</p><button type="button" onClick={()=>{setSnoreState('loading');setSnoreReadAttempt(v=>v+1);}}>코골이 설정 다시 불러오기</button></div>}{BOOLEAN_FIELDS.map(({key,label})=><label key={key}><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={form[key]} disabled={saving} onChange={e=>{const checked=e.currentTarget.checked;setStatus('');setForm(f=>({...f,[key]:checked}));}}/></label>)}</div>
   </section>
  </div>
  <footer className="buddy-form-footer"><div aria-live="polite">{error?<p className="buddy-error" role="alert">{error}</p>:<p className={status?'buddy-success':'buddy-help'}>{status||'설정은 이 컴퓨터에 저장돼요.'}</p>}</div><button className="buddy-primary" type="submit" disabled={saving||snoreState!=='ready'||errors.some(Boolean)}>{saving?'저장 중…':status?'✓ 저장됨':'설정 저장'}</button></footer>
 </form>;
}
