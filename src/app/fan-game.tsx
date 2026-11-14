"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  castReplayVote,
  castVote,
  getFanTaunt,
  isSupabaseConfigured,
  joinFan,
  loadSharedReplay,
  loadVote,
  resetFanSession,
  restoreFan,
  saveNickname,
  updateTauntActivity,
  type Choice,
  type FanProfile,
  type SharedReplay,
  type Team,
} from "@/lib/fan-session";
import { normalizeNickname } from "@/lib/nickname";
import { FanSheet, randomNicknames, setupProgress, TeamDots, TeamSheet, teams } from "./fan-setup";
import { PlateReplay, type ReplayMatchState } from "./plate-replay";
import { FanTaunts } from "./fan-taunts";
import { FanPointPredictionPanel } from "./fan-point-prediction";
import { useFanTaunts } from "./use-fan-taunts";
import { ReplayControl } from "./replay-control";
import { formatElapsed } from "@/lib/replay/clock";

const choices = [
  { value: "safe", label: "출루한다", caption: "살아남는다" },
  { value: "out", label: "아웃된다", caption: "잡힌다" },
] satisfies { value: Choice; label: string; caption: string }[];

const roomMessages = {
  waiting: "경기 시작을 기다리고 있어요.",
  paused: "경기가 일시정지됐어요.",
  open: "",
  locked: "투표가 마감됐어요. 결과를 기다리고 있어요.",
  revealed: "다음 타석을 기다리고 있어요.",
  finished: "경기가 끝났어요.",
};

function replayInvite() {
  const id = new URLSearchParams(window.location.search).get("room");
  return id && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ? id : null;
}

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
  const [screen, setScreen] = useState<"start" | "setup" | "home" | "room" | "record">("start");
  const [teamSheet, setTeamSheet] = useState(false);
  const [infoSheet, setInfoSheet] = useState<"howto" | "taunt" | "share" | null>(null);
  const [draftTeam, setDraftTeam] = useState<Team>("lg");
  const [lockedTeam, setLockedTeam] = useState<Team | null>(null);
  const [avatar, setAvatar] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [match, setMatch] = useState<ReplayMatchState | null>(null);
  const [profile, setProfile] = useState<FanProfile | null>(null);
  const [demoVote, setDemoVote] = useState<Choice | null>(null);
  const [room, setRoom] = useState<SharedReplay | null | "no-invite" | undefined>(undefined);
  const [roomError, setRoomError] = useState(false);
  const [roomRefresh, setRoomRefresh] = useState(0);
  const [pending, setPending] = useState<"restore" | Team | "nickname" | "vote" | "reset" | null>(
    isSupabaseConfigured ? "restore" : null,
  );
  const [error, setError] = useState<{ field: "team" | "nickname" | "vote" | "reset"; message: string } | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(randomNicknames[0]);
  const [recordTauntOpen, setRecordTauntOpen] = useState(false);
  const predictionSection = useRef<HTMLDivElement>(null);
  const updatePoints = useCallback((points: number) => {
    setProfile((current) => current ? { ...current, points } : current);
  }, []);
  const taunts = useFanTaunts(profile?.id, updatePoints);
  const screenHeading = useRef<HTMLHeadingElement>(null);
  const nicknameButton = useRef<HTMLButtonElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const setupNickname = normalizeNickname(nickname);
  const nicknameValid = setupNickname !== null && [...setupNickname].length <= 10;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    restoreFan()
      .then((current) => {
        if (!active || !current) return;
        if (!current.profile.nickname) {
          setDraftTeam(current.profile.team);
          setLockedTeam(current.profile.team);
          setScreen("setup");
          return;
        }
        setProfile(current.profile);
        setDemoVote(current.vote);
        setScreen(replayInvite() ? "room" : "home");
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
    const id = replayInvite();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!id) {
        setRoom("no-invite");
        return;
      }
      try {
        const result = await loadSharedReplay(id);
        if (active) {
          setRoom(result);
          setRoomError(false);
        }
      } catch {
        if (active) setRoomError(true);
      } finally {
        if (active) timer = setTimeout(poll, 1000);
      }
    }
    timer = setTimeout(poll, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [playerId, pending, roomRefresh]);

  useEffect(() => {
    if (screen !== "start") screenHeading.current?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => () => {
    if (avatar) URL.revokeObjectURL(avatar);
  }, [avatar]);

  function goTo(next: typeof screen) {
    setInfoSheet(null);
    setError(null);
    setScreen(next);
    window.scrollTo(0, 0);
  }

  function goToPrediction() {
    goTo("room");
    requestAnimationFrame(() => {
      predictionSection.current?.scrollIntoView({ block: "center" });
      predictionSection.current?.focus({ preventScroll: true });
    });
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file?.type.startsWith("image/")) setAvatar(URL.createObjectURL(file));
    event.target.value = "";
  }

  async function enterGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || restoreError || !isSupabaseConfigured || !nicknameValid || !setupNickname) return;
    setPending(draftTeam);
    setError(null);
    try {
      const joined = await joinFan(draftTeam);
      setLockedTeam(joined.team);
      setDraftTeam(joined.team);
      const existingVote = await loadVote(joined.id);
      const saved = await saveNickname(joined.id, setupNickname);
      setProfile({ ...joined, nickname: saved });
      setDemoVote(existingVote);
      goTo(replayInvite() ? "room" : "home");
    } catch {
      setError({ field: "team", message: "입장 정보를 저장하지 못했어요. 다시 시도해 주세요." });
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
      setProfile((current) => current ? { ...current, nickname: saved } : current);
      closeNickname();
    } catch {
      setError({ field: "nickname", message: "닉네임을 저장하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  async function submitVote(choice: Choice) {
    if (pending || !profile || !canVote) return;
    setPending("vote");
    setError(null);
    try {
      if (room === "no-invite") {
        setDemoVote(await castVote(profile.id, choice));
      } else if (room?.roundId) {
        const { roomId, roundId } = room;
        const saved = await castReplayVote(roomId, roundId, choice);
        setRoom((current) => {
          if (!current || current === "no-invite" || current.roomId !== roomId || current.roundId !== roundId) return current;
          return saved ? { ...current, myVote: saved } : { ...current, phase: "locked", secondsLeft: null };
        });
      }
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
      await updateTauntActivity(false).catch(() => {});
      await resetFanSession();
      taunts.reset();
      setRecordTauntOpen(false);
      setProfile(null);
      setDemoVote(null);
      setRoom(undefined);
      setRoomError(false);
      setNickname(randomNicknames[0]);
      setDraftTeam("lg");
      setLockedTeam(null);
      setAvatar("");
      setMatch(null);
      setEditingNickname(false);
      goTo("start");
    } catch {
      setError({ field: "reset", message: "초기화하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  const team = teams[profile?.team ?? draftTeam];
  const sharedRoom = room === "no-invite" ? null : room;
  const vote = room === "no-invite" ? demoVote : sharedRoom?.myVote;
  const canVote = !vote && (room === "no-invite" || (!roomError && sharedRoom?.phase === "open"));
  const roomStatus = roomError ? "경기방 연결을 다시 확인하고 있어요."
    : room === undefined ? "경기방을 연결하고 있어요."
    : room === null ? "열린 경기방이 없어요."
    : room === "no-invite" ? "" : roomMessages[room.phase];
  const innings = sharedRoom?.inning ? `${sharedRoom.inning}회 ${sharedRoom.half === "top" ? "초" : "말"}` : null;
  const teamShort = team.short;
  const matchScore = match?.awayScore !== undefined && match.homeScore !== undefined
    ? `${match.awayScore} : ${match.homeScore}`
    : null;
  const showRestoreStatus = pending === "restore" || restoreError || !isSupabaseConfigured;
  const avatarMark = avatar
    ? <span className="fan-avatar-image" style={{ backgroundImage: `url("${avatar}")` }} />
    : [...(profile?.nickname ?? "?")][0];

  async function copyInvite() {
    try {
      const url = new URL("/", window.location.origin);
      const id = replayInvite();
      if (id) url.searchParams.set("room", id);
      await navigator.clipboard.writeText(`${profile?.nickname ?? teamShort}님의 도전장! 야구 팬덤 대결에서 같이 붙어요 ⚾ ${url}`);
      setShareMessage("초대 링크를 복사했어요.");
    } catch {
      setShareMessage("복사하지 못했어요. 주소창의 링크를 공유해 주세요.");
    }
  }

  return (
    <main className="fan-stage" data-team={profile?.team ?? (screen === "setup" ? draftTeam : "lg")}>
      {screen === "start" && (
        <section className="fan-welcome">
          <Burst className="fan-welcome-burst" />
          <div className="fan-welcome-copy">
            <h1>야구 팬덤 대결</h1>
            <p>경기는 선수들이,<br />신경전은 팬들이!</p>
            <small><span aria-hidden="true">●</span> 리플레이 · LG vs 두산 · 잠실</small>
          </div>
          <div className="fan-stage-bottom">
            <button type="button" className="fan-stage-button" onClick={() => goTo("setup")} disabled={showRestoreStatus}>입장하기</button>
            <p className="fan-status">야구 몰라도 30초면 시작해요</p>
            {pending === "restore" && <p role="status" className="fan-status">참가 정보를 확인하고 있어요.</p>}
            {!isSupabaseConfigured && <p role="status" className="fan-status">서버 연결 설정이 필요합니다.</p>}
            {restoreError && <div className="fan-stage-error">
              <p role="alert" className="fan-error">참가 정보를 불러오지 못했습니다.</p>
              <button type="button" className="fan-quiet-button" onClick={() => {
                setRestoreError(false);
                setPending("restore");
                setRestoreAttempt((attempt) => attempt + 1);
              }}>다시 시도</button>
            </div>}
          </div>
        </section>
      )}

      {screen === "setup" && (
        <form className="fan-onboarding" onSubmit={enterGame}>
          <div className="fan-setup-progress" aria-hidden="true"><span style={setupProgress(nicknameValid)} /></div>
          <h1 ref={screenHeading} tabIndex={-1}>오늘은 어느 편에<br />서시겠어요?</h1>
          <div className="fan-setup-identity">
            <input type="file" ref={avatarInput} accept="image/*" tabIndex={-1} hidden onChange={chooseAvatar} />
            <button type="button" className="fan-avatar-picker" aria-label="프로필 사진 선택" onClick={() => avatarInput.current?.click()}>
              {avatar ? avatarMark : "?"}<span aria-hidden="true">+</span>
            </button>
            <div className="fan-setup-nickname">
              <label htmlFor="setup-nickname">닉네임</label>
              <div className="fan-setup-field">
                <input id="setup-nickname" autoComplete="off" placeholder="2~10자" value={nickname} aria-invalid={!nicknameValid} aria-describedby="setup-nickname-tip" disabled={pending !== null} onChange={(event) => {
                  setNickname([...event.target.value].slice(0, 10).join(""));
                  setError(null);
                }} />
                <span aria-hidden="true">{[...nickname].length}/10</span>
              </div>
              <div className="fan-setup-feedback">
                <p id="setup-nickname-tip" className={nicknameValid ? "fan-nick-valid" : "fan-error"}>{nicknameValid ? "✓ 사용 가능한 닉네임이에요" : "닉네임은 2~10자로 입력해 주세요"}</p>
                <button type="button" className="fan-random-nick" disabled={pending !== null} onClick={() => {
                  const available = randomNicknames.filter((name) => name !== nickname);
                  setNickname(available[Math.floor(Math.random() * available.length)]);
                  setError(null);
                }}>🎲 랜덤 닉네임</button>
              </div>
            </div>
          </div>
          <section className="fan-camp" aria-labelledby="camp-heading">
            <h2 id="camp-heading">응원 진영</h2>
            <p>오늘 경기는 LG vs 두산이에요</p>
            <button type="button" className="fan-camp-picker" aria-haspopup="dialog" onClick={() => setTeamSheet(true)} disabled={pending !== null || lockedTeam !== null}>
              <TeamDots colors={team.colors} />
              <strong>{team.label}</strong>
              <span>{lockedTeam ? "선택됨" : "변경 ⌄"}</span>
            </button>
            <p>경기 중에는 진영을 바꿀 수 없어요</p>
          </section>
          <div className="fan-stage-bottom">
            {error?.field === "team" && <p role="alert" className="fan-error">{error.message}</p>}
            <button type="submit" className="fan-stage-button" disabled={pending !== null || !nicknameValid}>{pending ? "입장하고 있어요…" : `${teamShort} 진영으로 참전하기`}</button>
          </div>
        </form>
      )}
      {screen === "setup" && teamSheet && <TeamSheet selected={draftTeam} onSelect={setDraftTeam} onClose={() => setTeamSheet(false)} />}

      {profile && screen === "home" && infoSheet !== "taunt" && (
        <section className="fan-lobby">
          <Burst className="fan-lobby-burst" />
          <header className="fan-lobby-header">
            <h1 ref={screenHeading} tabIndex={-1}>야구 팬덤 대결</h1>
            <button type="button" className="fan-profile-chip" onClick={() => goTo("record")}>
              <span className="fan-small-avatar" aria-hidden="true">{avatarMark}</span><strong>{profile.nickname}</strong>
            </button>
          </header>
          <div className="fan-lobby-intro">
            <h2>경기는 선수들이,<br />신경전은 팬들이!</h2>
            <p>야구 몰라도 괜찮아요. 일단 친구부터 이겨보세요.</p>
          </div>
          <div className="fan-lobby-match">
            <span className="fan-match-tag">리플레이 · {innings ?? match?.inning ?? "잠실"}</span>
            <div className="fan-lobby-score"><strong>LG</strong><span className="fan-replay-number">{matchScore ?? "vs"}</span><strong>두산</strong></div>
            <div className="fan-lobby-match-footer">
              <span>9월 3일 경기</span>
              <button type="button" className="fan-stage-button fan-stage-white" onClick={() => goTo("room")}>참전하기 →</button>
            </div>
          </div>
          <div className="fan-guide-title"><h2>어떻게 하는 게임인가요?</h2><button type="button" className="fan-quiet-button underline" onClick={() => setInfoSheet("howto")}>30초 설명</button></div>
          <ol className="fan-guide">
            <li><button type="button" onClick={() => goTo("room")}><span>1</span><strong>다음 타자, 살아남을까?<small>출루 또는 아웃 예측</small></strong><i aria-hidden="true">⚾</i></button></li>
            <li><button type="button" onClick={() => setInfoSheet("howto")}><span>2</span><strong>맞혔다면 100P!<small>예측 성공 시 포인트</small></strong><i aria-hidden="true">+100P</i></button></li>
            <li><button type="button" onClick={() => setInfoSheet("taunt")}><span>3</span><strong>상대팀 팬에게 한 방!<small>포인트로 도발 카드 전송</small></strong><i aria-hidden="true">😈</i></button></li>
          </ol>
          <button type="button" className="fan-stage-button fan-stage-white" onClick={() => goTo("room")}>지금 참전하기</button>
        </section>
      )}

      {profile && (screen === "room" || match !== null) && (
        <section className="fan-room" hidden={screen !== "room" || infoSheet === "taunt"} aria-label="경기방">
          <header className="fan-room-header">
            <button type="button" className="fan-back" aria-label="홈으로 돌아가기" onClick={() => goTo("home")}>‹</button>
            <span>{innings ? `LG vs 두산 · ${innings}` : matchScore ? `${match?.inning} · ${match?.outs}아웃 · LG ${matchScore} 두산` : "LG vs 두산 · 리플레이"}</span>
            <span className="fan-points" aria-label={`내 포인트 ${profile.points}점`}>{profile.points.toLocaleString("ko-KR")}P</span>
          </header>
          <div className="fan-room-hero">
            <Burst className="fan-room-burst" />
            {sharedRoom?.batter ? (
              <div className="fan-room-player">
                <span className="fan-room-player-avatar" aria-hidden="true">{[...sharedRoom.batter][0]}</span>
                <div><h2>{sharedRoom.batter}</h2><p>{innings} · {sharedRoom.half === "top" ? sharedRoom.away : sharedRoom.home} 공격</p></div>
              </div>
            ) : match ? (
              <div className="fan-room-player">
                <span className="fan-room-player-avatar" aria-hidden="true">{[...match.batter][0]}</span>
                <div><h2>{match.batter}</h2><p>{match.battingTeam} · 현재 타자</p></div>
              </div>
            ) : <div><h2>LG 트윈스 vs 두산 베어스</h2><p>9월 3일 · 잠실</p></div>}
            <span className="fan-match-tag">{sharedRoom ? `경기 경과 ${formatElapsed(sharedRoom.elapsed)}` : room === "no-invite" ? "데모 투표" : "공동 경기방"}</span>
            {!roomError && sharedRoom?.phase === "open" && <p className="text-sm tabular-nums">마감까지 {sharedRoom.secondsLeft}초</p>}
            {sharedRoom?.result && <p className="text-sm font-bold">타석 결과 · {sharedRoom.result}</p>}
          </div>
          <section ref={room === "no-invite" ? undefined : predictionSection} tabIndex={-1} aria-labelledby="vote-heading" className="fan-room-vote">
            <h1 id="vote-heading" ref={screen === "room" ? screenHeading : undefined} tabIndex={-1}>{vote ? "예측 완료! 결과를 기다려 보세요" : "이번 타자, 살아남을까요?"}</h1>
            <p>한 번 고르면 바꿀 수 없어요</p>
            <div className="fan-room-choices">
              {choices.map(({ value, label, caption }) => (
                <button key={value} type="button" className="fan-choice" disabled={pending !== null || !canVote} aria-pressed={vote === value} onClick={() => submitVote(value)}>
                  <strong>{value === "safe" ? "🏃" : "🙅"} {label}</strong>
                  <small>{vote === value ? "✓ 예측 완료" : caption}</small>
                </button>
              ))}
            </div>
            <p role="status" className="fan-status">{pending === "vote" ? "투표 저장 중…" : vote ? `투표가 저장됐어요. ${roomStatus}`.trim() : roomStatus}</p>
            {error?.field === "vote" && <p role="alert" className="fan-error">{error.message}</p>}
          </section>
          {room === "no-invite" && <div ref={predictionSection} tabIndex={-1}>
            <FanPointPredictionPanel active={screen === "room" && infoSheet !== "taunt"} onPoints={updatePoints} onTaunt={() => setInfoSheet("taunt")} />
          </div>}
          {sharedRoom && <ReplayControl key={sharedRoom.roomId} room={sharedRoom} refresh={() => setRoomRefresh((count) => count + 1)} />}
          {process.env.NODE_ENV === "development" && room === "no-invite" && <PlateReplay onMatchChange={setMatch} />}
          <nav className="fan-room-tabs" aria-label="경기 메뉴">
            <button type="button" aria-current="page" onClick={() => window.scrollTo(0, 0)}><span aria-hidden="true">⚾</span>경기방</button>
            <button type="button" onClick={() => setInfoSheet("taunt")}><span aria-hidden="true">😈</span>도발하기</button>
            <button type="button" onClick={() => { setShareMessage(""); setInfoSheet("share"); }}><span aria-hidden="true">↗</span>경기 공유</button>
            <button type="button" onClick={() => goTo("record")}><span aria-hidden="true">★</span>내 기록</button>
          </nav>
        </section>
      )}

      {profile && screen === "record" && (
        <section className="fan-record">
          <header className="fan-room-header">
            <button type="button" className="fan-back" aria-label="홈으로 돌아가기" onClick={() => goTo("home")}>‹</button>
            <h1 ref={screenHeading} tabIndex={-1}>내 기록</h1>
            <button type="button" className="fan-quiet-button" disabled={pending !== null} onClick={resetParticipation}>{pending === "reset" ? "초기화 중…" : "초기화"}</button>
          </header>
          <div className="fan-record-card fan-replay-board">
            <span className="fan-small-avatar" aria-hidden="true">{avatarMark}</span>
            <strong>{profile.nickname}</strong>
            <p>{team.label} · {profile.points.toLocaleString("ko-KR")}P</p>
            <p>{vote ? `내 예측 · ${choices.find(({ value }) => value === vote)?.label}` : "아직 저장된 예측이 없어요."}</p>
            <button ref={nicknameButton} type="button" className="fan-quiet-button underline" aria-expanded={editingNickname} aria-controls={editingNickname ? "nickname-form" : undefined} disabled={pending !== null} onClick={() => {
              if (editingNickname) { closeNickname(); return; }
              setNickname(profile.nickname ?? "");
              setError(null);
              setEditingNickname(true);
            }}>닉네임 변경</button>
            {editingNickname && (
              <form id="nickname-form" onSubmit={submitNickname}>
                <label htmlFor="nickname">닉네임</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <input id="nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); if (error?.field === "nickname") setError(null); }} autoFocus autoComplete="off" placeholder="2~16자" aria-invalid={error?.field === "nickname"} aria-describedby={error?.field === "nickname" ? "nickname-error" : undefined} disabled={pending !== null} className="fan-input" />
                  <button type="submit" disabled={pending !== null} className="fan-save-button">{pending === "nickname" ? "저장 중" : "저장"}</button>
                  <button type="button" disabled={pending !== null} onClick={closeNickname} className="fan-quiet-button">취소</button>
                </div>
                {error?.field === "nickname" && <p id="nickname-error" role="alert" className="fan-error">{error.message}</p>}
              </form>
            )}
          </div>
          {error?.field === "reset" && <p role="alert" className="fan-error">{error.message}</p>}
          {taunts.inbox.length > 0 && (
            <section className="fan-record-card fan-replay-board" aria-label="받은 도발">
              <h2 className="font-bold">받은 도발</h2>
              {taunts.inbox.map((message) => (
                <button key={message.id} type="button" className="fan-quiet-button underline" onClick={() => {
                  setRecordTauntOpen(true);
                  taunts.open(message);
                }}>{message.senderNickname ?? "상대 팬"}님의 도발 보기</button>
              ))}
            </section>
          )}
          <button type="button" className="fan-stage-button" onClick={() => goTo("room")}>경기방으로 돌아가기</button>
        </section>
      )}

      {infoSheet === "howto" && (
        <FanSheet title="30초 설명" onClose={() => setInfoSheet(null)}>
          <ol className="fan-howto">
            <li><strong>타석마다 한 번, 출루 vs 아웃</strong><p>타자가 살아서 나가면 출루, 잡히면 아웃이에요.</p></li>
            <li><strong>맞히면 +100P</strong><p>경기방의 포인트 예측에서 연습 타석의 결과를 맞혀요.</p></li>
            <li><strong>포인트로 도발 카드</strong><p>100P로 상대 진영 팬에게 카드를 보내고, 받은 카드에는 반격할 수 있어요.</p></li>
          </ol>
          <button type="button" className="fan-stage-button" onClick={() => goTo("room")}>바로 해보기</button>
        </FanSheet>
      )}
      {profile && (
        <FanTaunts points={profile.points} opposingTeam={teams[profile.team === "lg" ? "doosan" : "lg"].short}
          active={infoSheet === "taunt"} incoming={infoSheet === null ? taunts.incoming : null}
          showIncomingBanner={screen === "room" && !recordTauntOpen}
          onDismissIncoming={() => { setRecordTauntOpen(false); taunts.dismiss(); }}
          onRead={taunts.read} onSend={taunts.send} onReceipt={getFanTaunt}
          onClose={() => { setInfoSheet(null); if (infoSheet !== "taunt") goTo("room"); }}
          onPrediction={goToPrediction}
          renderBurst={(className) => <Burst className={className} />}
        />
      )}
      {infoSheet === "share" && (
        <FanSheet title={`${profile?.nickname}님의 도전장!`} onClose={() => setInfoSheet(null)}>
          <p className="fan-sheet-message">야구 몰라도 돼요, 저부터 이겨봐요</p>
          <button type="button" className="fan-stage-button" onClick={copyInvite}>초대 링크 복사하기</button>
          <p role="status" className="fan-status">{shareMessage}</p>
        </FanSheet>
      )}
    </main>
  );
}
