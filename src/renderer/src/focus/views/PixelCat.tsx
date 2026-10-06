import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../../../shared/focus/types";
import { CatPlayer, type CatAnimations, type CatState } from "../cat-player";
export function PixelCat({
  snapshot,
}: {
  snapshot: Snapshot | null;
}): JSX.Element {
  const player = useRef<CatPlayer | null>(null);
  const current = useRef(snapshot);
  current.current = snapshot;
  const previous = useRef<Snapshot | null>(null);
  const [frame, setFrame] = useState("base.png");
  const [state, setState] = useState<CatState>("sleep");
  const [snore,setSnore]=useState<string|null>(null);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const seen=new Set<string>();const show=(event:Event):void=>{const cue=(event as CustomEvent<{id:string}>).detail;if(seen.has(cue.id)||current.current?.status!=='running'||current.current.phase!=='focus')return;seen.add(cue.id);setSnore(cue.id);clearTimeout(timer);timer=setTimeout(()=>setSnore(null),3000);};document.addEventListener('focus-snore',show);return()=>{clearTimeout(timer);document.removeEventListener('focus-snore',show);};},[]);
  useEffect(()=>{if(snapshot?.status!=='running'||snapshot.phase!=='focus')setSnore(null);},[snapshot?.status,snapshot?.phase]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetch("./cat/playback.json")
      .then((r) => r.json())
      .then((manifest: { status: string; states: CatAnimations }) => {
        if (disposed) return;
        const initial =
          (current.current?.phase ?? current.current?.suggestedNext) &&
          (current.current?.phase ?? current.current?.suggestedNext) !== "focus"
            ? "rest"
            : "sleep";
        player.current = new CatPlayer(manifest.states, initial);
        setReady(manifest.status === "generated-and-reviewed");
        setFrame(player.current.frame().file);
        setState(initial);
      })
      .catch(() => setReady(false));
    let handle: number;
    let last: number | null = null;
    const tick = (now: number): void => {
      const p = player.current;
      if (p && last !== null) {
        p.advance(
          Math.min(now - last, 100),
          current.current?.status === "paused" ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        );
        setFrame(p.frame().file);
        setState(p.state);
      }
      last = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(handle);
    };
  }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    const p = player.current;
    if (!p || !snapshot) return;
    if (
      before?.phase === "focus" &&
      snapshot.status === "awaiting_next" &&
      snapshot.suggestedNext !== "focus"
    )
      p.setState("wake");
    else if (snapshot.sessionId && snapshot.sessionId !== before?.sessionId)
      p.setState(snapshot.phase === "focus" ? "sleep" : "stretch");
    // Pausing/resuming a session leaves its current pose and player clock untouched.
  }, [snapshot]);
  return (
    <>
    {snore&&<span key={snore} className="pixel-snore" data-cue-id={snore} aria-hidden="true">zZZ</span>}
    <img
      className="pixel-cat"
      src={`./cat/${frame}`}
      alt="패널 위에 누운 주황 줄무늬 고양이"
      data-animation={state}
      data-animation-ready={ready}
      data-paused={snapshot?.status === "paused"}
      draggable={false}
    />
    </>
  );
}
