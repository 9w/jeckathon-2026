"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { appearanceAt, appearanceOffsets, clockSeconds, formatClock, formatElapsed, playbackSecond } from "@/lib/replay/clock";
import { parseReplayGame } from "@/lib/replay/parse";
import type { ReplayGame } from "@/lib/replay/types";

const maxReplayBytes = 512 * 1024;
const controlClass = "min-h-11 rounded-lg border border-neutral-400 text-sm font-semibold hover:enabled:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:border-neutral-300 disabled:text-neutral-500 dark:border-neutral-600 dark:hover:enabled:bg-neutral-800";

type ReplayLoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; game: ReplayGame };

export function PlateReplay() {
  const [replay, setReplay] = useState<ReplayLoadState>({
    status: process.env.NODE_ENV === "development" ? "loading" : "unavailable",
  });
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [fileError, setFileError] = useState("");
  const [fileVersion, setFileVersion] = useState(0);
  const fileRead = useRef(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const controller = new AbortController();

    async function loadReplay() {
      try {
        const response = await fetch("/api/replay", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setReplay({ status: "unavailable" });
          return;
        }
        if (!response.ok) throw new Error(`Replay request failed (${response.status})`);

        const game = parseReplayGame(await response.json());
        if (controller.signal.aborted) return;
        if (!game) throw new Error("Unsupported replay data");
        setReplay({ status: "ready", game });
      } catch {
        if (!controller.signal.aborted) setReplay({ status: "error" });
      }
    }

    void loadReplay();
    return () => controller.abort();
  }, [requestAttempt]);

  function retry() {
    setReplay({ status: "loading" });
    setFileError("");
    setRequestAttempt((attempt) => attempt + 1);
  }

  async function openReplayFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const readId = ++fileRead.current;
    setFileError("");
    try {
      if (file.size > maxReplayBytes) throw new Error("Replay file too large");
      const game = parseReplayGame(JSON.parse(await file.text()));
      if (!game) throw new Error("Unsupported replay file");
      if (readId !== fileRead.current) return;
      setFileVersion((version) => version + 1);
      setReplay({ status: "ready", game });
    } catch {
      if (readId === fileRead.current) {
        setFileError("9월 3일 LG·두산전 리플레이 JSON을 선택해 주세요.");
      }
    }
  }

  return (
    <section aria-labelledby="replay-heading" className="mt-auto space-y-4 border-t border-black/10 pt-5 dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="replay-heading" className="text-lg font-bold">타석 리플레이</h2>
        {replay.status === "ready" && (
          <a href={replay.game.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
            원본 경기 기록
          </a>
        )}
      </div>

      {replay.status === "loading" && <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">경기 기록을 불러오고 있어요.</p>}
      {replay.status === "unavailable" && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">9월 3일 LG·두산전 리플레이 파일을 이 기기에서 열어 주세요. 파일은 브라우저에서만 읽습니다.</p>
      )}
      {replay.status === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">경기 기록을 불러오지 못했어요.</p>
          <button type="button" onClick={retry} className={`${controlClass} px-3`}>다시 시도</button>
        </div>
      )}
      {replay.status !== "loading" && (
        <div>
          <input id="replay-file" type="file" accept=".json,application/json" onChange={openReplayFile} className="peer sr-only" />
          <label htmlFor="replay-file" className={`${controlClass} inline-flex cursor-pointer items-center px-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground`}>
            경기 기록 파일 열기
          </label>
          {fileError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{fileError}</p>}
        </div>
      )}
      {replay.status === "ready" && <ReplayTimeline key={fileVersion} game={replay.game} />}
    </section>
  );
}

function ReplayTimeline({ game }: { game: ReplayGame }) {
  const [position, setPosition] = useState(0);
  const [playback, setPlayback] = useState<{ offset: number; beganAt: number } | null>(null);
  const start = clockSeconds(game.startedAt) ?? 0;
  const duration = (clockSeconds(game.endedAt) ?? start) - start;
  const startTimes = useMemo(() => appearanceOffsets(game.appearances, start), [game.appearances, start]);
  const index = appearanceAt(startTimes, position);
  const lastIndex = game.appearances.length - 1;
  const appearance = game.appearances[index];
  const inning = `${appearance.inning}회 ${appearance.half === "top" ? "초" : "말"}`;
  const battingTeam = appearance.half === "top" ? game.awayTeam : game.homeTeam;
  const clock = formatClock(start + position);
  const elapsed = formatElapsed(position);
  const result = appearance.resultTime
    ? clock >= appearance.resultTime ? appearance.result : "진행 중"
    : `${appearance.result} (시각 미기록)`;

  useEffect(() => {
    if (!playback) return;

    const timer = window.setInterval(() => {
      const second = playbackSecond(playback.offset, playback.beganAt, performance.now(), duration);
      setPosition(second);
      if (second === duration) setPlayback(null);
    }, 100);

    return () => window.clearInterval(timer);
  }, [duration, playback]);

  function seek(second: number) {
    setPlayback(null);
    setPosition(second);
  }

  function togglePlayback() {
    const now = performance.now();
    if (playback) {
      seek(playbackSecond(playback.offset, playback.beganAt, now, duration));
      return;
    }
    const offset = position === duration ? 0 : position;
    setPosition(offset);
    setPlayback({ offset, beganAt: now });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <time dateTime={game.date}>{game.date}</time>
        <span>{game.awayTeam} vs {game.homeTeam}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-y border-black/10 py-3 dark:border-white/15">
        <div>
          <dt className="text-xs font-medium text-neutral-600 dark:text-neutral-400">경기 시각 (KST)</dt>
          <dd className="text-xl font-bold tabular-nums"><time aria-label="경기 시각 (KST)">{clock}</time></dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-neutral-600 dark:text-neutral-400">경과 시간</dt>
          <dd className="text-xl font-bold tabular-nums"><output aria-label="경과 시간" aria-live="off">{elapsed}</output></dd>
        </div>
      </dl>

      <div className="min-h-24 space-y-1 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-neutral-900">
        <p className="flex flex-wrap gap-x-2 text-sm font-semibold">
          <span>{inning}</span>
          <span>{battingTeam} 공격</span>
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-neutral-600 dark:text-neutral-400">타자</dt>
          <dd className="font-semibold">{appearance.batter}</dd>
          <dt className="text-neutral-600 dark:text-neutral-400">실제 결과</dt>
          <dd className="min-w-0 break-words font-semibold">{result}</dd>
          <dt className="text-neutral-600 dark:text-neutral-400">첫 투구</dt>
          <dd className="font-semibold tabular-nums">
            {appearance.firstPitchTime ? `${appearance.firstPitchTime} KST` : "시각 미기록"} · {appearance.pitchCount}구
          </dd>
        </dl>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <label htmlFor="plate-timeline" className="font-semibold">경기 타임라인</label>
          <span className="shrink-0 tabular-nums">{index + 1} / {game.appearances.length} 타석</span>
        </div>
        <input
          id="plate-timeline"
          type="range"
          min={0}
          max={duration}
          step={1}
          value={position}
          aria-valuetext={`${clock} KST, 경과 ${elapsed}, ${inning}, ${appearance.batter}`}
          onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          className="block h-11 w-full cursor-ew-resize accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-default"
        />
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => seek(startTimes[index - 1])} disabled={index === 0} className={controlClass}>이전 타석</button>
          <button type="button" onClick={togglePlayback} className={controlClass}>{playback ? "일시정지" : "재생"}</button>
          <button type="button" onClick={() => seek(startTimes[index + 1])} disabled={index === lastIndex} className={controlClass}>다음 타석</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2">
          <button type="button" onClick={() => seek(startTimes[0])} className="min-h-11 text-sm font-semibold underline underline-offset-4">첫 투구로 이동</button>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">영상과 함께 1배속으로 재생</span>
        </div>
      </div>
    </div>
  );
}
