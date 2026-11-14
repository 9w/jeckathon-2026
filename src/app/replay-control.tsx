"use client";

import { useState, type FormEvent } from "react";
import { claimReplayOperator, controlReplay, type SharedReplay } from "@/lib/fan-session";
import { formatElapsed } from "@/lib/replay/clock";

export function ReplayControl({ room, refresh }: { room: SharedReplay; refresh: () => void }) {
  const [code, setCode] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (!room.canControl) {
        if (!(await claimReplayOperator(code.trim()))) {
          setError("관리자 코드를 확인해 주세요.");
          return;
        }
        setCode("");
      } else if (position !== null) {
        await controlReplay(room.roomId, "seek", position);
        setPosition(null);
      }
      refresh();
    } catch {
      setError("경기 제어 요청을 처리하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  async function toggle() {
    setPending(true);
    setError("");
    try {
      await controlReplay(room.roomId, room.playing ? "pause" : "play");
      refresh();
    } catch {
      setError("경기 제어 요청을 처리하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="fan-profile p-3" open={room.canControl || undefined}>
      <summary className="cursor-pointer py-2 text-sm font-bold">경기 관리자</summary>
      <form onSubmit={submit} className="space-y-2">
        {room.canControl ? (
          <>
            <label htmlFor="admin-timeline" className="text-sm">경기 위치 {formatElapsed(position ?? room.elapsed)}</label>
            <input id="admin-timeline" type="range" min={0} max={room.duration} value={position ?? room.elapsed}
              className="block h-11 w-full accent-[var(--fan-accent)]"
              onChange={(event) => setPosition(event.currentTarget.valueAsNumber)} />
            <div className="flex gap-2">
              <button type="button" disabled={pending || (!room.playing && room.elapsed >= room.duration)} className="fan-control" onClick={toggle}>
                {room.playing ? "일시정지" : room.elapsed === 0 ? "경기 시작" : "재개"}
              </button>
              <button type="submit" disabled={pending || position === null} className="fan-control">해당 위치로 이동</button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <input aria-label="관리자 코드" type="password" autoComplete="off" className="fan-input" value={code} onChange={(event) => setCode(event.target.value)} />
            <button type="submit" className="fan-control" disabled={pending || !code.trim()}>권한 확인</button>
          </div>
        )}
        {error && <p role="alert" className="fan-error">{error}</p>}
      </form>
    </details>
  );
}
