import { useState } from "react";
import type { Command } from "../../../../shared/focus/types";
import { useFocus } from "../store";
import { formatClock } from "../format";
import { PixelCat } from "./PixelCat";
import "./pixel-widget.css";

export const TASK_KEY = "focus-buddy.pixel.next-task";
export function PixelWidget({
  onSettings,
  scale = 1,
  onResize,
}: {
  onSettings: () => void;
  scale?: number;
  onResize?: (value:number)=>Promise<void>;
}): JSX.Element {
  const { snapshot: s, dispatch, bridgeError } = useFocus();
  const [resizing,setResizing]=useState(false);
  const resizeStart = (e:React.PointerEvent<HTMLButtonElement>):void => {
    if(!onResize)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    const target=e.currentTarget, x=e.screenX,y=e.screenY,start=scale;setResizing(true);
    const move=(v:PointerEvent):void=>{const dx=(v.screenX-x)/280,dy=(v.screenY-y)/310;const delta=Math.abs(dx)>Math.abs(dy)?dx:dy;void onResize(Math.max(.8,Math.min(1.5,start+delta))).catch(()=>{});};
    const end=():void=>{setResizing(false);target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',end);};
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const send = async (cmd: Command): Promise<void> => {
    setPending(true);
    setError("");
    try {
      const r = await dispatch(cmd);
      if (!r.ok && r.code !== "IGNORED") setError(r.message);
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };
  const next = s?.phase ?? s?.suggestedNext ?? "focus";
  const dots = s?.cycleCount ? ((s.cycleCount - 1) % 4) + 1 : 0;
  const label =
    s?.status === "paused"
      ? "일시정지"
      : next === "focus"
        ? "집중"
        : next === "long_break"
          ? "긴 휴식"
          : "휴식";
  const action: Command =
    s?.status === "running"
      ? { type: "pause" }
      : s?.status === "paused"
        ? { type: "resume" }
        : {
            type: s?.status === "awaiting_next" ? "startNext" : "startFocus",
            taskName: localStorage.getItem(TASK_KEY) ?? "",
          };
  return (
    <div
      className="pixel-viewport"
      style={{ width: 280 * scale, height: 310 * scale }}
    >
      <main
        className="pixel-widget"
        aria-label="Focus Buddy 위젯"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <PixelCat snapshot={s} />
        {onResize&&<button className={'widget-resize '+(resizing?'resizing':'')} aria-label='모서리를 끌어 위젯 크기 조절' title='끌어서 크기 조절 · 방향키로도 조절' onPointerDown={resizeStart} onKeyDown={e=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();void onResize(Math.max(.8,Math.min(1.5,scale+(['ArrowRight','ArrowDown'].includes(e.key)?.05:-.05))));}}}>◢</button>}
        <section className="pixel-panel">
          <div className="pixel-phase" role="status">
            {s ? label : (bridgeError ?? "불러오는 중")}
          </div>
          <div
            className="pixel-clock"
            role="timer"
            aria-label={`남은 시간 ${formatClock(s?.remainingMs ?? 1500000)}`}
          >
            {formatClock(s?.remainingMs ?? 1500000)}
          </div>
          <button
            className="pixel-reset"
            aria-label="현재 타이머 초기화"
            title="현재 단계를 처음으로 · 완료 기록과 설정 유지"
            disabled={
              pending || (s?.status !== "running" && s?.status !== "paused")
            }
            onClick={() => {
              void send({ type: "resetCurrent" });
            }}
          >
            ↺ 초기화
          </button>
          <button
            className="pixel-start"
            disabled={!s || pending}
            onClick={() => {
              void send(action);
            }}
          >
            {s?.status === "running"
              ? "Ⅱ 일시정지"
              : s?.status === "paused"
                ? "▶ 재개"
                : "▶ 시작"}
          </button>
          <div
            className="pixel-dots"
            aria-label={`완료 집중 ${s?.cycleCount ?? 0}회`}
          >
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={dots > i ? "done" : ""} />
            ))}
          </div>
          <button
            className="pixel-settings"
            aria-label="설정 및 작업명·기록"
            onClick={onSettings}
          >
            ⚙
          </button>
        </section>
        {error && (
          <div className="pixel-error" role="alert">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
