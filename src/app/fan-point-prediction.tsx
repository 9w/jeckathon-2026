"use client";

import { useEffect, useRef, useState } from "react";
import { pointPrediction, type Choice, type FanPointPrediction } from "@/lib/fan-session";

export function FanPointPredictionPanel({ active, onPoints, onTaunt }: {
  active: boolean;
  onPoints: (points: number) => void;
  onTaunt: () => void;
}) {
  const [state, setState] = useState<FanPointPrediction | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const actionInFlight = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const shown = active && (state?.phase === "open" || state?.phase === "locked");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    let ignore = false;
    let reading = false;
    async function refresh() {
      if (actionInFlight.current || reading) return;
      reading = true;
      const atRevision = revision.current;
      try {
        const next = await pointPrediction("read");
        if (ignore || atRevision !== revision.current) return;
        setState(next);
        onPoints(next.points);
      } catch {
        // The next tick retries without obscuring the last confirmed result.
      } finally {
        reading = false;
      }
    }
    void refresh();
    if (!shown) return () => { ignore = true; };
    const timer = window.setInterval(refresh, 1000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [active, onPoints, shown]);

  async function act(choice?: Choice) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    revision.current++;
    setPending(true);
    setError("");
    try {
      const next = await pointPrediction(choice ? "vote" : "start", state?.round ?? undefined, choice);
      if (!mounted.current) return;
      setState(next);
      onPoints(next.points);
    } catch {
      if (!mounted.current) return;
      setError(choice ? "예측을 저장하지 못했어요. 마감 시간을 확인해 주세요." : "예측을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section aria-labelledby="point-prediction-heading" className="fan-replay-board grid gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 id="point-prediction-heading" className="text-sm font-bold">포인트 예측</h2>
        <span className="fan-status">{state?.phase === "open" ? `마감까지 ${state.secondsLeft}초` : state?.phase === "locked" ? "결과 공개 대기" : "연습 타석"}</span>
      </div>
      {(!state || state.phase === "ready") && <>
        <p className="fan-status">연습 타석의 출루·아웃을 맞히면 100P를 받아요.</p>
        <button type="button" className="fan-control" disabled={pending} onClick={() => void act()}>예측 시작</button>
      </>}
      {(state?.phase === "open" || state?.phase === "locked") && <>
        <p role="status" className="fan-status">{state.choice ? `내 예측 · ${state.choice === "safe" ? "출루" : "아웃"}` : "이번 연습 타자는 출루할까요?"}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="fan-control" disabled={pending || state.choice !== null || state.phase !== "open"} aria-pressed={state.choice === "safe"} onClick={() => void act("safe")}>출루 예측</button>
          <button type="button" className="fan-control" disabled={pending || state.choice !== null || state.phase !== "open"} aria-pressed={state.choice === "out"} onClick={() => void act("out")}>아웃 예측</button>
        </div>
      </>}
      {state?.phase === "result" && <>
        <p role="status" className="font-bold">{state.reward ? "예측 성공! +100P" : state.choice ? "아쉽게 빗나갔어요 · 0P" : "예측 시간이 지났어요"}</p>
        <p className="fan-status">연습 타석 결과 · {state.answer === "safe" ? "출루" : "아웃"}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="fan-control" disabled={pending} onClick={() => void act()}>다음 타석 도전하기</button>
          <button type="button" className="fan-control fan-control-primary" disabled={state.points < 100} onClick={onTaunt}>도발하러 가기</button>
        </div>
      </>}
      {error && <p role="alert" className="fan-error">{error}</p>}
    </section>
  );
}
