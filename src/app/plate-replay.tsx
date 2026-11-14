"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { appearanceAt, appearanceOffsets, clockSeconds, formatClock, formatElapsed, playbackSecond } from "@/lib/replay/clock";
import { parseReplayGame } from "@/lib/replay/parse";
import { pitchAt, pitchCursorTime, scoreboardAt } from "@/lib/replay/pitches";
import type { ReplayGame, ReplayPitch } from "@/lib/replay/types";

const maxReplayBytes = 512 * 1024;
const subtleClass = "text-[color:var(--fan-sub)]";
const pitchLabels: Record<ReplayPitch["outcome"], string> = { ball: "볼", strike: "스트라이크", foul: "파울", "in-play": "인플레이" };

type ReplayLoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; game: ReplayGame };

export type ReplayMatchState = {
  batter: string;
  battingTeam: string;
  inning: string;
  outs?: number;
  awayScore?: number;
  homeScore?: number;
};

export function PlateReplay({ onMatchChange }: { onMatchChange?: (match: ReplayMatchState) => void }) {
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
    <section aria-labelledby="replay-heading" className="space-y-3 border-t border-[var(--fan-line)] pt-3">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 id="replay-heading" className="text-lg font-extrabold tracking-tight">타석 리플레이</h2>
        {replay.status === "ready" && (
          <a href={replay.game.sourceUrl} target="_blank" rel="noreferrer" className="fan-quiet-button inline-flex items-center underline">
            원본 경기 기록
          </a>
        )}
      </div>

      {replay.status === "loading" && <p role="status" className={`text-sm ${subtleClass}`}>경기 기록을 불러오고 있어요.</p>}
      {replay.status === "unavailable" && (
        <p className={`text-sm leading-relaxed break-keep ${subtleClass}`}>9월 3일 LG·두산전 리플레이 파일을 이 기기에서 열어 주세요. 파일은 브라우저에서만 읽습니다.</p>
      )}
      {replay.status === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="alert" className="fan-error">경기 기록을 불러오지 못했어요.</p>
          <button type="button" onClick={retry} className="fan-control">다시 시도</button>
        </div>
      )}
      {replay.status !== "loading" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input id="replay-file" type="file" accept=".json,application/json" onChange={openReplayFile} aria-describedby={fileError ? "replay-file-error" : undefined} className="fan-file-picker sr-only" />
          <label htmlFor="replay-file" className="fan-control inline-flex cursor-pointer items-center">
            경기 기록 파일 열기
          </label>
          {replay.status === "ready" && <time dateTime={replay.game.date} className={`text-xs font-semibold ${subtleClass}`}>{replay.game.date}</time>}
          {fileError && <p id="replay-file-error" role="alert" className="fan-error w-full">{fileError}</p>}
        </div>
      )}
      {replay.status === "ready" && <ReplayTimeline key={fileVersion} game={replay.game} onMatchChange={onMatchChange} />}
    </section>
  );
}

function ReplayTimeline({ game, onMatchChange }: { game: ReplayGame; onMatchChange?: (match: ReplayMatchState) => void }) {
  const [position, setPosition] = useState(0);
  const [selectedPitch, setSelectedPitch] = useState<number | null>(null);
  const [playback, setPlayback] = useState<{ offset: number; beganAt: number } | null>(null);
  const start = clockSeconds(game.startedAt) ?? 0;
  const duration = (clockSeconds(game.endedAt) ?? start) - start;
  const startTimes = useMemo(() => appearanceOffsets(game.appearances, start), [game.appearances, start]);
  const pitches = useMemo(() => game.appearances.flatMap((appearance, appearanceIndex) =>
    (appearance.pitches ?? []).map((pitch, pitchIndex) => ({ ...pitch, appearanceIndex, pitchIndex }))), [game.appearances]);
  const clock = formatClock(start + position);
  const pitchIndex = selectedPitch ?? pitchAt(pitches, clock);
  const pitch = pitches[pitchIndex];
  const index = selectedPitch === null ? appearanceAt(startTimes, position) : pitch.appearanceIndex;
  const lastIndex = game.appearances.length - 1;
  const appearance = game.appearances[index];
  const currentPitch = pitch?.appearanceIndex === index ? pitch : undefined;
  const seenPitches = appearance.pitches?.slice(0, (currentPitch?.pitchIndex ?? -1) + 1);
  const pitcher = currentPitch?.pitcher ?? appearance.pitches?.[0]?.pitcher;
  const score = game.scoreboard && scoreboardAt(game.scoreboard, clock);
  const previousHalf = score && (score.inning !== appearance.inning || score.half !== appearance.half);
  const inning = `${appearance.inning}회 ${appearance.half === "top" ? "초" : "말"}`;
  const scoreboardInning = score ? `${score.inning}회 ${score.half === "top" ? "초" : "말"}` : inning;
  const battingTeam = appearance.half === "top" ? game.awayTeam : game.homeTeam;
  const elapsed = formatElapsed(position);
  const result = appearance.resultTime
    ? clock >= appearance.resultTime ? appearance.result : "진행 중"
    : `${appearance.result} (시각 미기록)`;

  useEffect(() => {
    onMatchChange?.({ batter: appearance.batter, battingTeam, inning: scoreboardInning, outs: score?.outs, awayScore: score?.away, homeScore: score?.home });
  }, [appearance.batter, battingTeam, onMatchChange, score?.away, score?.home, score?.outs, scoreboardInning]);

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
    setSelectedPitch(null);
    setPosition(second);
  }

  function togglePlayback() {
    const now = performance.now();
    if (playback) {
      seek(playbackSecond(playback.offset, playback.beganAt, now, duration));
      return;
    }
    const offset = position === duration ? 0 : position;
    seek(offset);
    setPlayback({ offset, beganAt: now });
  }

  function stepPitch(index: number) {
    const time = pitchCursorTime(pitches, index);
    seek(time ? (clockSeconds(time) ?? start) - start : startTimes[pitches[index].appearanceIndex]);
    setSelectedPitch(index);
  }

  return (
    <div className="space-y-3">
      <div className="fan-replay-board">
        <div role="group" aria-label="전광판" className="grid grid-cols-3 items-center divide-x divide-[var(--fan-line)] py-3 text-center">
          <div data-team="lg" className="space-y-1">
            <p className="text-xs font-bold text-[color:var(--fan-accent-text)]">{game.awayTeam}</p>
            <p className="fan-replay-number">{score?.away ?? "–"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold">{scoreboardInning}</p>
            <p className={`text-xs font-semibold ${subtleClass}`}>{score ? `${score.outs}아웃` : "아웃 미기록"}</p>
          </div>
          <div data-team="doosan" className="space-y-1">
            <p className="text-xs font-bold text-[color:var(--fan-accent-text)]">{game.homeTeam}</p>
            <p className="fan-replay-number">{score?.home ?? "–"}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-[var(--fan-line)] border-t border-[var(--fan-line)] py-3">
          <div className="space-y-1 px-3 sm:px-4">
            <dt className={`text-xs font-semibold ${subtleClass}`}>경기 시각 (KST)</dt>
            <dd className="fan-replay-number"><time aria-label="경기 시각 (KST)">{clock}</time></dd>
          </div>
          <div className="space-y-1 px-3 sm:px-4">
            <dt className={`text-xs font-semibold ${subtleClass}`}>경과 시간</dt>
            <dd className="fan-replay-number"><output aria-label="경과 시간" aria-live="off">{elapsed}</output></dd>
          </div>
        </dl>
      </div>

      <div className="fan-replay-board space-y-2 px-4 py-3">
        <p data-team={appearance.half === "top" ? "lg" : "doosan"} className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="fan-team-dot" aria-hidden="true" />
          <span>{previousHalf ? `${inning} 직전 타석` : `${battingTeam} 공격`}</span>
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-[var(--fan-line)] pt-2 text-sm">
          <dt className={`text-xs ${subtleClass}`}>투수</dt>
          <dd className="font-bold">{pitcher ?? "기록 없음"}</dd>
          <dt className={`text-xs ${subtleClass}`}>타자</dt>
          <dd className="font-bold">{appearance.batter}</dd>
          <dt className={`text-xs ${subtleClass}`}>볼카운트</dt>
          <dd className="font-bold tabular-nums">{appearance.pitches?.length ? `${currentPitch?.balls ?? 0}볼 ${currentPitch?.strikes ?? 0}스트라이크` : "기록 없음"}</dd>
          <dt className={`text-xs ${subtleClass}`}>실제 결과</dt>
          <dd className="min-w-0 font-semibold wrap-break-word">{result}</dd>
          <dt className={`text-xs ${subtleClass}`}>첫 투구</dt>
          <dd className="font-semibold tabular-nums">
            {appearance.firstPitchTime ? `${appearance.firstPitchTime} KST` : "시각 미기록"} · {appearance.pitchCount}구
          </dd>
        </dl>
        <div className="border-t border-[var(--fan-line)] pt-2">
          <h3 className="text-xs font-bold">구별 결과</h3>
          <div className="mt-1 h-24">
            {seenPitches?.length ? (
              <ol aria-label="이번 타석 구별 결과 (최신순)" reversed start={seenPitches.length} tabIndex={0} className="fan-replay-pitches max-h-full divide-y divide-[var(--fan-line)] overflow-y-auto">
                {seenPitches.toReversed().map((entry, index) => {
                  const number = seenPitches.length - index;
                  return (
                    <li key={number} aria-current={index === 0 ? "step" : undefined} className="grid grid-cols-[2rem_1fr_auto] gap-x-2 rounded px-1.5 py-1.5 text-xs tabular-nums">
                      <span>{number}구</span>
                      <span>{pitchLabels[entry.outcome]}</span>
                      <span className={subtleClass}>{entry.time ?? "시각 미기록"}</span>
                    </li>
                  );
                })}
              </ol>
            ) : <p className={`text-xs ${subtleClass}`}>{appearance.pitches?.length ? "첫 투구 전" : "구별 기록 없음"}</p>}
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
          <label htmlFor="plate-timeline" className="font-bold">경기 타임라인</label>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${subtleClass}`}>{index + 1} / {game.appearances.length} 타석</span>
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
          className="block h-11 w-full cursor-ew-resize rounded-lg accent-[var(--fan-accent-text)]"
        />
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => seek(startTimes[index - 1])} disabled={index === 0} className="fan-control">이전 타석</button>
          <button type="button" onClick={togglePlayback} className="fan-control fan-control-primary">{playback ? "일시정지" : "재생"}</button>
          <button type="button" onClick={() => seek(startTimes[index + 1])} disabled={index === lastIndex} className="fan-control">다음 타석</button>
        </div>
        {pitches.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => stepPitch(pitchIndex - 1)} disabled={pitchIndex < 1} className="fan-control">이전 구</button>
            <button type="button" onClick={() => stepPitch(pitchIndex + 1)} disabled={pitchIndex >= pitches.length - 1} className="fan-control">다음 구</button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2">
          <button type="button" onClick={() => seek(startTimes[0])} className="fan-quiet-button underline">첫 투구로 이동</button>
          <span className={`text-xs ${subtleClass}`}>영상과 함께 1배속으로 재생</span>
        </div>
      </div>
    </div>
  );
}
