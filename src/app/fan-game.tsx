"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import {
  castReplayVote,
  getFanTaunt,
  isSupabaseConfigured,
  joinFan,
  loadFanCampPresence,
  loadFanProfileStats,
  loadSharedReplay,
  resetFanSession,
  restoreFan,
  saveNickname,
  updateTauntActivity,
  type Choice,
  type FanProfile,
  type FanProfileStats,
  type SharedReplay,
  type Team,
} from "@/lib/fan-session";
import { normalizeNickname } from "@/lib/nickname";
import { encodeFanAvatar, loadFanAvatar, storeFanAvatar } from "@/lib/fan-avatar";
import { teamTauntCards, type FanTaunt } from "@/lib/fan-taunts";
import { FanSheet, randomNicknames, setupProgress, TeamDots, TeamSheet, teams } from "./fan-setup";
import { PlateReplay, type ReplayMatchState } from "./plate-replay";
import { FanTaunts } from "./fan-taunts";
import { FanProfileScreen } from "./fan-profile";
import { FanTauntShop } from "./fan-taunt-shop";
import { useFanCollection } from "./use-fan-collection";
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
const teamLogo = { lg: "/ipyagu/logo_lg.webp", doosan: "/ipyagu/logo_ds.webp" };

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
  const [infoSheet, setInfoSheet] = useState<"howto" | "taunt" | "shop" | "share" | null>(null);
  const [counterTarget, setCounterTarget] = useState<FanTaunt | null>(null);
  const [initialCardId, setInitialCardId] = useState<string>();
  const [profileStats, setProfileStats] = useState<FanProfileStats>();
  const [camp, setCamp] = useState<Record<Team, number>>();
  const [avatarError, setAvatarError] = useState("");
  const [draftTeam, setDraftTeam] = useState<Team>("lg");
  const [lockedTeam, setLockedTeam] = useState<Team | null>(null);
  const [avatar, setAvatar] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [match, setMatch] = useState<ReplayMatchState | null>(null);
  const [profile, setProfile] = useState<FanProfile | null>(null);
  const [room, setRoom] = useState<SharedReplay | null | undefined>(undefined);
  const [roomError, setRoomError] = useState(false);
  const [roomRefresh, setRoomRefresh] = useState(0);
  const [pending, setPending] = useState<"restore" | Team | "nickname" | "vote" | "reset" | null>(
    isSupabaseConfigured ? "restore" : null,
  );
  const [error, setError] = useState<{ field: "team" | "nickname" | "vote" | "reset"; message: string } | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [nickname, setNickname] = useState(randomNicknames[0]);
  const predictionSection = useRef<HTMLElement>(null);
  const updatePoints = useCallback((points: number) => {
    setProfile((current) => current ? { ...current, points } : current);
  }, []);
  const taunts = useFanTaunts(profile?.id, updatePoints);
  const collection = useFanCollection(profile?.id, updatePoints);
  const screenHeading = useRef<HTMLHeadingElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const setupNickname = normalizeNickname(nickname);
  const nicknameValid = setupNickname !== null && [...setupNickname].length <= 10;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    restoreFan()
      .then((current) => {
        if (!active || !current) return;
        if (!current.nickname) {
          setDraftTeam(current.team);
          setLockedTeam(current.team);
          setScreen("setup");
          return;
        }
        setProfile(current);
        setAvatar(loadFanAvatar(current.id));
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

  useEffect(() => {
    if (!playerId || screen !== "record") return;
    let live = true;
    void loadFanProfileStats().then((stats) => { if (live) setProfileStats(stats); }).catch(() => {});
    return () => { live = false; };
  }, [playerId, screen, infoSheet]);

  useEffect(() => {
    if (!playerId || screen !== "home") return;
    let live = true;
    const refresh = () => void loadFanCampPresence().then((counts) => { if (live) setCamp(counts); }).catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => { live = false; window.clearInterval(timer); };
  }, [playerId, screen]);

  function goTo(next: typeof screen) {
    setInfoSheet(null);
    setCounterTarget(null);
    setInitialCardId(undefined);
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

  function openShop() {
    void collection.refresh();
    setInfoSheet("shop");
    window.scrollTo(0, 0);
  }

  function openTaunt(cardId?: string, target: FanTaunt | null = null) {
    void collection.refresh();
    setInitialCardId(cardId);
    setCounterTarget(target);
    setInfoSheet("taunt");
    window.scrollTo(0, 0);
  }

  function closeTaunt() {
    setInfoSheet(null);
    setCounterTarget(null);
    setInitialCardId(undefined);
  }

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarError("");
    try {
      setAvatar(await encodeFanAvatar(file));
    } catch (cause) {
      setAvatarError(cause instanceof Error ? cause.message : "사진을 열지 못했어요.");
    }
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
      const saved = await saveNickname(joined.id, setupNickname);
      if (avatar) {
        try { storeFanAvatar(joined.id, avatar); } catch { /* The session still has the selected picture. */ }
      }
      setProfile({ ...joined, nickname: saved });
      goTo(replayInvite() ? "room" : "home");
    } catch {
      setError({ field: "team", message: "입장 정보를 저장하지 못했어요. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  async function submitProfile(nickname: string, photo?: File) {
    if (pending || !profile) return;
    const normalized = normalizeNickname(nickname);
    if (!normalized || (normalized !== profile.nickname && [...normalized].length > 10)) {
      throw new Error("닉네임을 2~10자로 입력해 주세요.");
    }
    setPending("nickname");
    try {
      const nextAvatar = photo ? await encodeFanAvatar(photo) : null;
      let saved = profile.nickname;
      if (normalized !== saved) {
        try { saved = await saveNickname(profile.id, normalized); }
        catch { throw new Error("닉네임을 저장하지 못했어요. 다른 닉네임으로 다시 시도해 주세요."); }
      }
      setProfile((current) => current ? { ...current, nickname: saved } : current);
      if (nextAvatar) {
        try { storeFanAvatar(profile.id, nextAvatar); }
        catch { throw new Error("이 브라우저에 사진을 저장하지 못했어요."); }
        setAvatar(nextAvatar);
      }
      goTo("home");
    } finally {
      setPending(null);
    }
  }

  async function submitVote(choice: Choice) {
    if (pending || !profile || !canVote || !sharedRoom?.roundId) return;
    const { roomId, roundId } = sharedRoom;
    setPending("vote");
    setError(null);
    try {
      const saved = await castReplayVote(roomId, roundId, choice);
      setRoom((current) => {
        if (current?.roomId !== roomId || current.roundId !== roundId) return current;
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
      await updateTauntActivity(false).catch(() => {});
      await resetFanSession();
      taunts.reset();
      collection.reset();
      setProfileStats(undefined);
      setCamp(undefined);
      setProfile(null);
      setRoom(undefined);
      setRoomError(false);
      setNickname(randomNicknames[0]);
      setDraftTeam("lg");
      setLockedTeam(null);
      setAvatar("");
      setAvatarError("");
      setMatch(null);
      goTo("start");
    } catch {
      setError({ field: "reset", message: "초기화하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  const team = teams[profile?.team ?? draftTeam];
  const sharedRoom = room;
  const vote = sharedRoom?.myVote;
  const canVote = !vote && !roomError && sharedRoom?.phase === "open";
  const roomStatus = roomError ? "경기방 연결을 다시 확인하고 있어요."
    : room === undefined ? "경기방을 연결하고 있어요."
    : room === null ? "현재 열린 경기방이 없어요." : roomMessages[room.phase];
  const innings = sharedRoom?.inning ? `${sharedRoom.inning}회 ${sharedRoom.half === "top" ? "초" : "말"}` : null;
  const teamShort = team.short;
  const matchScore = match?.awayScore !== undefined && match.homeScore !== undefined
    ? `${match.awayScore} : ${match.homeScore}`
    : null;
  const currentBatter = sharedRoom?.batter ?? match?.batter;
  const battingTeam = sharedRoom?.batter ? (sharedRoom.half === "top" ? "lg" : "doosan") : match?.battingTeam === "LG" ? "lg" : "doosan";
  const fullScreenSheet = infoSheet === "taunt" || infoSheet === "shop";
  const campTotal = camp ? camp.lg + camp.doosan : 0;
  const showRestoreStatus = pending === "restore" || restoreError || !isSupabaseConfigured;
  const avatarMark = avatar
    ? <span className="fan-avatar-image" style={{ backgroundImage: `url("${avatar}")` }} />
    : [...(profile?.nickname ?? "?")][0];

  async function copyInvite() {
    if (!sharedRoom) return;
    try {
      const url = new URL("/", window.location.origin);
      url.searchParams.set("room", sharedRoom.roomId);
      await navigator.clipboard.writeText(`${profile?.nickname ?? teamShort}님의 도전장! 야구 팬덤 대결에서 같이 붙어요 ⚾ ${url}`);
      setShareMessage("초대 링크를 복사했어요.");
    } catch {
      setShareMessage("복사하지 못했어요. 주소창의 링크를 공유해 주세요.");
    }
  }

  return (
    <main className="fan-stage" data-team={profile?.team ?? (screen === "setup" ? draftTeam : "lg")}>
      {screen === "start" && (
        <section className="fan-welcome ipyagu-welcome">
          <Burst className="fan-welcome-burst ipyagu-welcome-burst" />
          <div className="fan-welcome-copy">
            <h1><Image src="/ipyagu/wordmark.svg" width={233} height={215} alt="입야구" priority unoptimized /></h1>
          </div>
          <div className="fan-stage-bottom">
            <button type="button" className="fan-stage-button" onClick={() => goTo("setup")} disabled={showRestoreStatus}>입장하기</button>
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
            {avatarError && <p role="alert" className="fan-error">{avatarError}</p>}
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

      {profile && screen === "home" && !fullScreenSheet && (
        <section className="fan-lobby ipyagu-lobby">
          <header className="fan-lobby-header">
            <h1 ref={screenHeading} tabIndex={-1}>야구 팬덤 대결</h1>
            <button type="button" className="fan-profile-chip" onClick={() => goTo("record")}>
              <span className="fan-small-avatar" aria-hidden="true">{avatarMark}</span><strong>{profile.nickname}</strong>
            </button>
          </header>
          <div className="fan-lobby-intro">
            <h2>경기는 선수들이,<br />신경전은 팬들이!</h2>
            <p>규칙은 몰라도 괜찮으니까, 일단 이기고 보자</p>
          </div>
          <button type="button" className="fan-lobby-match ipyagu-match" aria-label="LG 두산 경기방으로 들어가기" onClick={() => goTo("room")}>
            <span className="fan-match-tag">리플레이 · {innings ?? match?.inning ?? "잠실"}</span>
            <div className="fan-lobby-score">
              <span><Image src={teamLogo.lg} width={55} height={44} alt="" unoptimized /><strong>LG</strong></span>
              <span className="fan-replay-number">{matchScore ?? "vs"}</span>
              <span><Image src={teamLogo.doosan} width={44} height={44} alt="" unoptimized /><strong>두산</strong></span>
            </div>
            <div className="ipyagu-match-batter">
              <span>지금 타석</span>
              <div>{currentBatter && <Image src={teamLogo[battingTeam]} width={40} height={40} alt="" unoptimized />}<strong>{currentBatter ?? "경기방에서 확인"}</strong><span className="ipyagu-match-state">{sharedRoom?.phase === "open" ? `투표 중 ${sharedRoom.secondsLeft}초` : "경기방 ›"}</span></div>
            </div>
            <div className="ipyagu-camp" aria-label="진영 대결">
              <div><span>LG 팬 {camp?.lg ?? "–"}명</span><span>진영 대결</span><span>두산 팬 {camp?.doosan ?? "–"}명</span></div>
              <div className="ipyagu-camp-bar" aria-hidden="true">{camp && campTotal > 0 && <><span style={{ flexGrow: camp.lg }} /><span style={{ flexGrow: camp.doosan }} /></>}</div>
            </div>
          </button>
          <button type="button" className="ipyagu-shop-entry" onClick={openShop}>
            <strong>이모티콘 상점</strong><span>보유 {profile.points.toLocaleString("ko-KR")}P</span>
            <small>맞혀서 모은 포인트로 도발 이모티콘 구매</small>
            <div>{[1, 2, 5].map((i) => <Image key={i} src={teamTauntCards[profile.team][i].image!} width={58} height={58} alt="" unoptimized />)}<span>상점 가기 ›</span></div>
          </button>
          <button type="button" className="fan-quiet-button underline" onClick={() => setInfoSheet("howto")}>어떻게 하는 게임인가요?</button>
          <button type="button" className="fan-stage-button fan-stage-white" onClick={() => goTo("room")}>지금 참전하기</button>
        </section>
      )}

      {profile && (screen === "room" || match !== null) && (
        <section className="fan-room" hidden={screen !== "room" || fullScreenSheet} aria-label="경기방">
          <header className="fan-room-header">
            <button type="button" className="fan-back" aria-label="홈으로 돌아가기" onClick={() => goTo("home")}>‹</button>
            <span>{innings ? `LG vs 두산 · ${innings}` : matchScore ? `${match?.inning} · ${match?.outs}아웃 · LG ${matchScore} 두산` : "LG vs 두산 · 리플레이"}</span>
            <button type="button" className="fan-points" aria-label={`내 포인트 ${profile.points}점 · 이모티콘 상점`} onClick={openShop}>{profile.points.toLocaleString("ko-KR")}P</button>
          </header>
          <div className="fan-room-hero">
            <Burst className="fan-room-burst" />
            {sharedRoom?.batter ? (
              <div className="fan-room-player">
                <span className="fan-room-player-avatar" aria-hidden="true"><Image src={teamLogo[battingTeam]} width={55} height={55} alt="" unoptimized /></span>
                <div><h2>{sharedRoom.batter}</h2><p>{innings} · {sharedRoom.half === "top" ? sharedRoom.away : sharedRoom.home} 공격</p></div>
              </div>
            ) : match ? (
              <div className="fan-room-player">
                <span className="fan-room-player-avatar" aria-hidden="true"><Image src={teamLogo[battingTeam]} width={55} height={55} alt="" unoptimized /></span>
                <div><h2>{match.batter}</h2><p>{match.battingTeam} · 현재 타자</p></div>
              </div>
            ) : <div><h2>LG 트윈스 vs 두산 베어스</h2><p>9월 3일 · 잠실</p></div>}
            <span className="fan-match-tag">{sharedRoom ? `경기 경과 ${formatElapsed(sharedRoom.elapsed)}` : "공동 경기방"}</span>
            {!roomError && sharedRoom?.phase === "open" && <p className="text-sm tabular-nums">마감까지 {sharedRoom.secondsLeft}초</p>}
            {sharedRoom?.result && <p className="text-sm font-bold">타석 결과 · {sharedRoom.result}</p>}
          </div>
          <section ref={predictionSection} tabIndex={-1} aria-labelledby="vote-heading" className="fan-room-vote">
            <h1 id="vote-heading" ref={screen === "room" ? screenHeading : undefined} tabIndex={-1}>{vote ? "예측 완료!" : sharedRoom ? "이번 타자, 살아남을까요?" : "경기방 안내"}</h1>
            {sharedRoom && <p>한 번 고르면 바꿀 수 없어요</p>}
            {sharedRoom && <div className="fan-room-choices">
              {choices.map(({ value, label, caption }) => (
                <button key={value} type="button" className="fan-choice" disabled={pending !== null || !canVote} aria-pressed={vote === value} onClick={() => submitVote(value)}>
                  <strong>{value === "safe" ? "🏃" : "🙅"} {label}</strong>
                  <small>{vote === value ? "✓ 예측 완료" : caption}</small>
                </button>
              ))}
            </div>}
            <p role="status" className="fan-status">{pending === "vote" ? "투표 저장 중…" : vote ? `투표가 저장됐어요. ${roomStatus}`.trim() : roomStatus}</p>
            {error?.field === "vote" && <p role="alert" className="fan-error">{error.message}</p>}
          </section>
          {sharedRoom && <ReplayControl key={sharedRoom.roomId} room={sharedRoom} refresh={() => setRoomRefresh((count) => count + 1)} />}
          {process.env.NODE_ENV === "development" && room === null && <PlateReplay onMatchChange={setMatch} />}
          <nav className="fan-room-tabs" aria-label="경기 메뉴">
            <button type="button" aria-current="page" onClick={() => window.scrollTo(0, 0)}><span aria-hidden="true">⚾</span>경기방</button>
            <button type="button" onClick={() => openTaunt()}><span aria-hidden="true">😈</span>도발하기</button>
            <button type="button" disabled={!sharedRoom} onClick={() => { setShareMessage(""); setInfoSheet("share"); }}><span aria-hidden="true">↗</span>경기 공유</button>
            <button type="button" onClick={() => goTo("record")}><span aria-hidden="true">★</span>내 기록</button>
          </nav>
        </section>
      )}

      {profile && screen === "record" && !fullScreenSheet && (
        <FanProfileScreen key={profile.id} nickname={profile.nickname ?? ""} team={profile.team}
          points={profile.points} avatar={avatar} inbox={taunts.inbox} stats={profileStats}
          pending={pending !== null} onSave={submitProfile} onBack={() => goTo("home")}
          onReset={() => void resetParticipation()} resetError={error?.field === "reset" ? error.message : undefined}
          onCounter={(message) => {
            taunts.dismiss(message.id);
            if (!message.readAt) void taunts.read(message.id, false).catch(() => {});
            openTaunt(undefined, message);
          }} />
      )}

      {infoSheet === "howto" && (
        <FanSheet title="30초 설명" onClose={() => setInfoSheet(null)}>
          <ol className="fan-howto">
            <li><strong>타석마다 한 번, 출루 vs 아웃</strong><p>타자가 살아서 나가면 출루, 잡히면 아웃이에요.</p></li>
            <li><strong>실제 타석 결과 확인</strong><p>투표가 마감되면 경기 기록에 따라 타석 결과가 표시돼요.</p></li>
            <li><strong>포인트로 도발 카드</strong><p>100P로 상대 진영 팬에게 카드를 보내고, 받은 카드에는 반격할 수 있어요.</p></li>
          </ol>
          <button type="button" className="fan-stage-button" onClick={() => goTo("room")}>바로 해보기</button>
        </FanSheet>
      )}
      {profile && (
        <FanTaunts points={profile.points} opposingTeam={teams[profile.team === "lg" ? "doosan" : "lg"].short}
          team={profile.team} ownedCardIds={collection.data?.ownedCardIds ?? []} available={collection.data !== null && !collection.failure}
          onBuyCard={collection.buy} onBuyPack={() => collection.buy()} initialCardId={initialCardId}
          counterTarget={counterTarget} onClearCounter={() => setCounterTarget(null)}
          active={infoSheet === "taunt"} incoming={infoSheet === null ? taunts.incoming : null}
          showIncomingBanner={screen === "room" || screen === "record"}
          onDismissIncoming={() => taunts.dismiss()}
          onRead={taunts.read} onSend={taunts.send} onReceipt={getFanTaunt}
          onClose={closeTaunt}
          onPrediction={goToPrediction}
          renderBurst={(className) => <Burst className={className} />}
        />
      )}
      {profile && infoSheet === "shop" && (
        <FanTauntShop team={profile.team} points={profile.points} ownedCardIds={collection.data?.ownedCardIds ?? []}
          onBuyCard={collection.buy} onBuyPack={() => collection.buy()} available={collection.data !== null && !collection.failure}
          onClose={closeTaunt} onUseCard={openTaunt} renderBurst={(className) => <Burst className={className} />} />
      )}
      {profile && fullScreenSheet && collection.failure && (
        <div className="ipyagu-collection-error">
          <p role="alert" className="fan-error">보유 카드를 불러오지 못했어요.</p>
          <button className="fan-control" type="button" onClick={() => void collection.refresh()}>다시 시도</button>
        </div>
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
