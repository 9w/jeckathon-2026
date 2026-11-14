"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  castReplayVote,
  isSupabaseConfigured,
  joinFan,
  loadSharedReplay,
  resetFanSession,
  restoreFan,
  saveNickname,
  type Choice,
  type FanProfile,
  type SharedReplay,
  type Team,
} from "@/lib/fan-session";
import { normalizeNickname } from "@/lib/nickname";
import { PlateReplay } from "./plate-replay";
import { ReplayControl } from "./replay-control";
import { formatElapsed } from "@/lib/replay/clock";

const teams = {
  lg: { label: "LG 트윈스", mark: "LG" },
  doosan: { label: "두산 베어스", mark: "DB" },
} as const;

const choices = [
  { value: "safe", label: "출루한다" },
  { value: "out", label: "아웃된다" },
] satisfies { value: Choice; label: string }[];

const roomMessages = {
  waiting: "경기 시작을 기다리고 있어요.",
  paused: "경기가 일시정지됐어요.",
  open: "",
  locked: "투표가 마감됐어요. 결과를 기다리고 있어요.",
  revealed: "다음 타석을 기다리고 있어요.",
  finished: "경기가 끝났어요.",
};

function Burst({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 310 317" preserveAspectRatio="none" fill="currentColor">
      <path d="M 0 0
        C 0 0 93.77 59.14 119.52 49.01 C 145.27 38.88 170.68 0 170.68 0
        C 170.68 0 177.12 57.10 200.44 60.39 C 223.75 63.68 246.83 21.88 246.83 21.88
        C 246.83 21.88 254 32.25 260.83 35.88 C 267.66 39.51 310 0 310 0
        C 310 0 252.08 87.52 260.83 118.16 C 269.58 148.79 309.99 153.93 309.99 153.93
        C 309.99 153.93 249.56 154.30 246.83 175.93 C 244.10 197.56 283.59 217.94 283.59 217.94
        C 283.59 217.94 272.25 233.40 269.58 245 C 266.92 256.59 309.99 316.69 309.99 316.69
        C 309.99 316.69 222.32 245 186.43 255.58 C 150.54 266.16 140.92 308.10 140.92 308.10
        C 140.92 308.10 144.29 252.96 119.52 245 C 94.75 237.03 65.59 288.84 65.59 288.84
        C 65.59 288.84 59.55 276.12 52.51 271.26 C 45.47 266.39 0 308.10 0 308.10
        C 0 308.10 65.60 201.32 52.51 183.81 C 39.43 166.29 5.17 153.93 5.17 153.93
        C 5.17 153.93 67.39 141.19 65.59 122.46 C 63.78 103.72 30.63 89.27 30.63 89.27
        C 30.63 89.27 40.59 77.98 43.76 69.14 C 46.93 60.31 0 0 0 0 Z" />
    </svg>
  );
}

export function FanGame() {
  const [profile, setProfile] = useState<FanProfile | null>(null);
  const [room, setRoom] = useState<SharedReplay | null | "invite-required" | undefined>(undefined);
  const [roomError, setRoomError] = useState(false);
  const [roomRefresh, setRoomRefresh] = useState(0);
  const [pending, setPending] = useState<"restore" | Team | "nickname" | "vote" | "reset" | null>(
    isSupabaseConfigured ? "restore" : null,
  );
  const [error, setError] = useState<{ field: "team" | "nickname" | "vote" | "reset"; message: string } | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const voteHeading = useRef<HTMLHeadingElement>(null);
  const nicknameButton = useRef<HTMLButtonElement>(null);
  const teamHeading = useRef<HTMLHeadingElement>(null);
  const returningToTeam = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    restoreFan()
      .then((current) => {
        if (!active || !current) return;
        setProfile(current);
      })
      .catch(() => {
        if (active) setRestoreError(true);
      })
      .finally(() => {
        if (active) setPending(null);
      });

    return () => { active = false; };
  }, [restoreAttempt]);

  const playerId = profile?.id;
  useEffect(() => {
    if (!playerId || pending === "vote" || pending === "reset") return;
    const roomId = new URLSearchParams(window.location.search).get("room");
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        if (!roomId || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(roomId)) {
          setRoom("invite-required");
          return;
        }
        const state = await loadSharedReplay(roomId);
        if (active) {
          setRoom(state);
          setRoomError(false);
        }
      } catch {
        if (active) setRoomError(true);
      } finally {
        if (active && roomId) timer = setTimeout(poll, 1000);
      }
    }

    timer = setTimeout(poll, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [playerId, pending, roomRefresh]);

  useEffect(() => {
    if (playerId) {
      voteHeading.current?.focus();
    } else if (returningToTeam.current) {
      returningToTeam.current = false;
      teamHeading.current?.focus();
    }
  }, [playerId]);

  async function chooseTeam(team: Team) {
    if (pending || !isSupabaseConfigured) return;
    setPending(team);
    setError(null);
    try {
      const joined = await joinFan(team);
      setProfile(joined);
    } catch {
      setError({ field: "team", message: "입장하지 못했습니다. 연결을 확인하고 팀을 다시 선택해 주세요." });
    } finally {
      setPending(null);
    }
  }

  function closeNickname() {
    setEditingNickname(false);
    setError(null);
    nicknameButton.current?.focus();
  }

  async function submitNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !profile) return;
    const normalized = normalizeNickname(nickname);
    if (!normalized) {
      setError({ field: "nickname", message: "닉네임을 2~16자로 입력해 주세요." });
      return;
    }

    setPending("nickname");
    setError(null);
    try {
      const saved = await saveNickname(profile.id, normalized);
      setProfile({ ...profile, nickname: saved });
      closeNickname();
    } catch {
      setError({ field: "nickname", message: "닉네임을 저장하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  async function submitVote(choice: Choice) {
    if (pending || !room || room === "invite-required" || !room.roundId || !canVote) return;
    const { roomId, roundId } = room;
    setPending("vote");
    setError(null);
    try {
      const saved = await castReplayVote(roomId, roundId, choice);
      setRoom((current) => {
        if (!current || current === "invite-required" || current.roomId !== roomId || current.roundId !== roundId) return current;
        return saved ? { ...current, myVote: saved } : { ...current, phase: "locked", secondsLeft: null };
      });
    } catch {
      setError({ field: "vote", message: "투표를 저장하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  async function resetParticipation() {
    if (pending || !profile) return;
    setPending("reset");
    setError(null);
    try {
      await resetFanSession();
      returningToTeam.current = true;
      setProfile(null);
      setRoom(undefined);
      setRoomError(false);
      setNickname("");
      setEditingNickname(false);
    } catch {
      setError({ field: "reset", message: "초기화하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  const sharedRoom = room === "invite-required" ? null : room;
  const vote = sharedRoom?.myVote;
  const canVote = sharedRoom?.phase === "open" && !roomError && !vote;
  const roomStatus = roomError ? "경기방 연결을 다시 확인하고 있어요."
    : room === undefined ? "경기방을 연결하고 있어요."
    : room === "invite-required" ? "내부 경기방 초대 링크로 접속해 주세요."
    : room === null ? "열린 경기방이 없어요."
    : roomMessages[room.phase];

  return (
    <div className="fan-game" data-team={profile?.team}>
      {profile && (
        <header className="fan-header">
          <span className="text-sm font-bold">야구 팬덤 대결</span>
          <div className="flex items-center gap-2">
            <span className="fan-points" aria-label={`내 포인트 ${profile.points}점`}>
              {profile.points.toLocaleString("ko-KR")}P
            </span>
            <button
              type="button"
              title="이 브라우저에서 새 참가자로 시작"
              disabled={pending !== null}
              onClick={resetParticipation}
              className="fan-quiet-button"
            >
              {pending === "reset" ? "초기화 중…" : "초기화"}
            </button>
          </div>
        </header>
      )}

      <main className="flex flex-1 flex-col gap-6 px-5 py-7">
        {profile ? (
          <>
            {error?.field === "reset" && <p role="alert" className="fan-error">{error.message}</p>}
            <section aria-label="내 응원팀과 닉네임" className="fan-profile">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <span className="fan-team-dot" aria-hidden="true" />
                  {teams[profile.team].label}
                </span>
                <button
                  ref={nicknameButton}
                  type="button"
                  className="fan-quiet-button min-w-0 max-w-[55%] truncate text-right"
                  aria-label={profile.nickname ? `닉네임 변경 (${profile.nickname})` : "닉네임 설정"}
                  aria-expanded={editingNickname}
                  aria-controls={editingNickname ? "nickname-form" : undefined}
                  aria-disabled={pending === "nickname" || pending === "reset"}
                  onClick={() => {
                    if (pending === "nickname" || pending === "reset") return;
                    if (editingNickname) {
                      closeNickname();
                      return;
                    }
                    setNickname(profile.nickname ?? "");
                    setError(null);
                    setEditingNickname(true);
                  }}
                >
                  {profile.nickname ?? "닉네임 설정"}
                </button>
              </div>
              {editingNickname && (
                <form id="nickname-form" onSubmit={submitNickname} className="space-y-2">
                  <label htmlFor="nickname" className="block text-sm font-semibold">닉네임</label>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                    <input
                      id="nickname"
                      value={nickname}
                      onChange={(event) => {
                        setNickname(event.target.value);
                        if (error?.field === "nickname") setError(null);
                      }}
                      autoFocus
                      autoComplete="off"
                      placeholder="2~16자"
                      aria-invalid={error?.field === "nickname" ? true : undefined}
                      aria-describedby={error?.field === "nickname" ? "nickname-error" : undefined}
                      disabled={pending === "nickname"}
                      className="fan-input"
                    />
                    <button type="submit" disabled={pending !== null} className="fan-save-button">
                      {pending === "nickname" ? "저장 중" : "저장"}
                    </button>
                    <button type="button" disabled={pending === "nickname"} onClick={closeNickname} className="fan-quiet-button">
                      취소
                    </button>
                  </div>
                  {error?.field === "nickname" && <p id="nickname-error" role="alert" className="fan-error">{error.message}</p>}
                </form>
              )}
            </section>

            <section aria-labelledby="vote-heading" className="space-y-3">
              <div className="fan-match-card">
                <Burst className="fan-match-burst" />
                <div className="fan-match-graphic" aria-hidden="true">
                  <span className="fan-team-mark" data-team="lg">LG</span>
                  <span className="fan-versus">VS</span>
                  <span className="fan-team-mark" data-team="doosan">DB</span>
                </div>
                <div className="relative">
                  <p className="fan-match-label">{sharedRoom ? `${sharedRoom.date} · ${sharedRoom.away} vs ${sharedRoom.home}` : "LG 트윈스 vs 두산 베어스"}</p>
                  <h1 id="vote-heading" ref={voteHeading} tabIndex={-1} className="fan-vote-heading">이번 타자, 출루할까?</h1>
                  {sharedRoom?.batter && <p className="mt-2 text-sm font-bold">{sharedRoom.inning}회 {sharedRoom.half === "top" ? "초" : "말"} · {sharedRoom.batter}</p>}
                  {sharedRoom && <p className="mt-1 text-sm tabular-nums">경기 경과 {formatElapsed(sharedRoom.elapsed)}</p>}
                  {!roomError && sharedRoom?.phase === "open" && <p className="mt-1 text-sm tabular-nums">마감까지 {sharedRoom.secondsLeft}초</p>}
                  {sharedRoom?.result && <p className="mt-2 text-sm font-bold">타석 결과 · {sharedRoom.result}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {choices.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pending !== null || !canVote}
                    aria-pressed={vote === value}
                    onClick={() => submitVote(value)}
                    className="fan-choice"
                  >
                    <svg aria-hidden="true" viewBox="0 0 32 32" width="32" height="32" fill="none">
                      {value === "safe" ? (
                        <path d="m7 16 6 6L25 10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <path d="m9 9 14 14m0-14L9 23" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                      )}
                    </svg>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid min-h-5">
                <p role="status" className="fan-status col-start-1 row-start-1">
                  {error?.field === "vote" ? "" : pending === "vote" ? "투표 저장 중…" : vote ? `투표가 저장됐어요. ${roomStatus}`.trim() : roomStatus}
                </p>
                {error?.field === "vote" && <p role="alert" className="fan-error col-start-1 row-start-1">{error.message}</p>}
              </div>
            </section>
            {sharedRoom && <ReplayControl key={sharedRoom.roomId} room={sharedRoom} refresh={() => setRoomRefresh((count) => count + 1)} />}
            <PlateReplay />
          </>
        ) : (
          <section aria-labelledby="team-heading" className="fan-team-select">
            <div className="fan-intro">
              <Burst className="fan-intro-burst fan-intro-burst-lg" />
              <Burst className="fan-intro-burst fan-intro-burst-doosan" />
              <div className="fan-intro-copy">
                <h1>야구 팬덤<br />대결</h1>
                <p>경기는 선수들이, 신경전은 팬들이!</p>
              </div>
            </div>
            <h2 id="team-heading" ref={teamHeading} tabIndex={-1} className="fan-team-heading">어느 팀을 응원하세요?</h2>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(teams) as Team[]).map((team) => (
                <button
                  key={team}
                  type="button"
                  disabled={pending !== null || restoreError || !isSupabaseConfigured}
                  onClick={() => chooseTeam(team)}
                  className="fan-team-button"
                  data-team={team}
                >
                  <span className="fan-team-mark" aria-hidden="true">{teams[team].mark}</span>
                  <span>{teams[team].label}</span>
                </button>
              ))}
            </div>
            <div className="min-h-11">
              {pending && <p role="status" className="fan-status">{pending === "restore" ? "참가 정보를 확인하고 있어요." : "입장하고 있어요."}</p>}
              {!isSupabaseConfigured && <p role="status" className="fan-status">서버 연결 설정이 필요합니다.</p>}
              {error?.field === "team" && <p role="alert" className="fan-error">{error.message}</p>}
              {restoreError && (
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <p role="alert" className="fan-error">참가 정보를 불러오지 못했습니다.</p>
                  <button type="button" className="fan-control" onClick={() => {
                    setRestoreError(false);
                    setPending("restore");
                    setRestoreAttempt((attempt) => attempt + 1);
                  }}>다시 시도</button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
