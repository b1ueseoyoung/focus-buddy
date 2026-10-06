import {useFocus} from '../store';
import {formatDuration,formatTimeRange} from '../format';
import {PHASE_LABEL,RESULT_LABEL} from '../labels';
export function TodayPanel({open}:{open:boolean;onClose:()=>void}):JSX.Element {
 const {snapshot}=useFocus();if(!open)return <></>;if(!snapshot)return <p role="status">불러오는 중…</p>;const t=snapshot.today;
 return <section className="buddy-history"><div className="buddy-history-heading"><h2>오늘의 집중</h2><span>작은 집중도 차곡차곡.</span></div><div className="buddy-stats"><article><p>집중한 시간</p><strong>{formatDuration(t.focusSeconds)}</strong></article><article><p>완료한 집중</p><strong>{t.completedFocusCount}<small> 회</small></strong><div className="buddy-history-dots" aria-hidden="true">{[0,1,2,3].map(i=><i key={i} className={i<Math.min(t.completedFocusCount,4)?'done':''}/>)}</div></article></div><p className="buddy-help">완료·중단한 집중 시간을 합산해요. 휴식은 포함하지 않아요.</p>
 <div className="buddy-history-scroll">{t.sessions.length===0?<div className="buddy-empty"><img src="./cat/app-icon.png" alt=""/><h3>첫 집중을 기다리는 중</h3><p>한 번의 집중이 끝나면<br/>오늘의 이야기가 여기에 쌓여요.</p></div>:<>
 <section className="buddy-card"><div className="buddy-section-heading"><span>01</span><h2>작업별 집중</h2></div><ul className="buddy-task-list">{t.byTask.map(v=><li key={v.taskName}><strong>{v.taskName||'자유 집중'}</strong><span>{formatDuration(v.focusSeconds)} · {v.completedCount}회</span></li>)}</ul></section>
 <section className="buddy-card"><div className="buddy-section-heading"><span>02</span><h2>집중과 휴식 기록</h2></div><ol className="buddy-session-list">{t.sessions.map(v=><li key={v.id}><span className={'buddy-record-dot '+(v.phase==='focus'?'focus':'')}/><div><strong>{v.phase==='focus'?(v.taskName||'자유 집중'):PHASE_LABEL[v.phase]}</strong><p>{formatTimeRange(v.startedAt,v.endedAt)} · {PHASE_LABEL[v.phase]}</p></div><span className="buddy-result">{RESULT_LABEL[v.status]}</span></li>)}</ol></section></>}
 </div></section>;
}
