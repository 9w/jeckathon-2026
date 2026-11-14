"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  castVote,
  isSupabaseConfigured,
  joinFan,
  restoreFan,
  saveNickname,
  type Choice,
  type FanProfile,
  type Team,
} from "@/lib/fan-session";
import { normalizeNickname } from "@/lib/nickname";

const teams = {
  lg: { label: "LG 트윈스", mark: "LG", color: "bg-[#a61549]" },
  doosan: { label: "두산 베어스", mark: "DB", color: "bg-[#192e5e]" },
} as const;

const choices = [
  { value: "safe", label: "출루한다" },
  { value: "out", label: "아웃된다" },
] satisfies { value: Choice; label: string }[];

export function FanGame() {
  const [profile, setProfile] = useState<FanProfile | null>(null);
  const [vote, setVote] = useState<Choice | null>(null);
  const [pending, setPending] = useState<"restore" | Team | "nickname" | "vote" | null>(
    isSupabaseConfigured ? "restore" : null,
  );
  const [error, setError] = useState<{ field: "team" | "nickname" | "vote"; message: string } | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState("");
  const voteHeading = useRef<HTMLHeadingElement>(null);
  const nicknameButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    restoreFan()
      .then((current) => {
        if (!active || !current) return;
        setProfile(current.profile);
        setVote(current.vote);
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
    if (playerId) voteHeading.current?.focus();
  }, [playerId]);

  async function chooseTeam(team: Team) {
    if (pending || !isSupabaseConfigured) return;
    setPending(team);
    setError(null);
    try {
      const joined = await joinFan(team);
      setProfile(joined.profile);
      setVote(joined.vote);
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
    if (pending || !profile || vote) return;
    setPending("vote");
    setError(null);
    try {
      setVote(await castVote(profile.id, choice));
    } catch {
      setError({ field: "vote", message: "투표를 저장하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-black/10 px-5 dark:border-white/15">
        <span className="shrink-0 text-sm font-bold">야구 팬덤 대결</span>
        {profile && (
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-bold tabular-nums dark:bg-neutral-800" aria-label={`내 포인트 ${profile.points}점`}>
            {profile.points.toLocaleString("ko-KR")}P
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-6 px-5 py-7">
        {profile ? (
          <>
            <section aria-label="내 응원팀과 닉네임" className="border-b border-black/10 pb-4 dark:border-white/15">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <span className={`size-2 shrink-0 rounded-full ${teams[profile.team].color}`} aria-hidden="true" />
                  {teams[profile.team].label}
                </span>
                <button
                  ref={nicknameButton}
                  type="button"
                  className="min-h-11 min-w-0 max-w-[55%] truncate rounded-md px-2 text-right text-sm font-semibold underline decoration-black/25 underline-offset-4 hover:decoration-current dark:decoration-white/45"
                  aria-label={profile.nickname ? `닉네임 변경 (${profile.nickname})` : "닉네임 설정"}
                  aria-expanded={editingNickname}
                  aria-controls={editingNickname ? "nickname-form" : undefined}
                  aria-disabled={pending === "nickname"}
                  onClick={() => {
                    if (pending === "nickname") return;
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
                <form id="nickname-form" onSubmit={submitNickname} className="mt-3 space-y-2">
                  <label htmlFor="nickname" className="block text-sm font-semibold">닉네임</label>
                  <div className="flex flex-wrap gap-2">
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
                      aria-describedby={error?.field === "nickname" ? "nickname-error" : undefined}
                      disabled={pending === "nickname"}
                      className="min-h-11 min-w-24 flex-1 rounded-lg border border-neutral-400 px-3 dark:border-neutral-600"
                    />
                    <button type="submit" disabled={pending !== null} className="min-h-11 rounded-lg bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60">
                      {pending === "nickname" ? "저장 중" : "저장"}
                    </button>
                    <button type="button" disabled={pending === "nickname"} onClick={closeNickname} className="min-h-11 rounded-lg px-2 text-sm font-semibold underline-offset-4 hover:underline disabled:opacity-60">
                      취소
                    </button>
                  </div>
                  {error?.field === "nickname" && <p id="nickname-error" role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{error.message}</p>}
                </form>
              )}
            </section>

            <section aria-labelledby="vote-heading" className="space-y-4">
              <h1 id="vote-heading" ref={voteHeading} tabIndex={-1} className="text-2xl font-bold tracking-tight">이번 타자, 출루할까?</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">LG 트윈스 vs 두산 베어스 · 데모 투표</p>
              <div className="grid grid-cols-2 gap-2">
                {choices.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pending !== null || vote !== null}
                    aria-pressed={vote === value}
                    onClick={() => submitVote(value)}
                    className="min-h-14 rounded-xl border border-neutral-400 px-2 text-base font-bold hover:enabled:bg-neutral-100 disabled:opacity-65 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:opacity-100 dark:border-neutral-600 dark:hover:enabled:bg-neutral-800"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p role="status" className="min-h-5 text-sm font-medium">
                {vote ? "투표가 저장됐어요." : pending === "vote" ? "투표 저장 중…" : ""}
              </p>
              {error?.field === "vote" && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{error.message}</p>}
            </section>
          </>
        ) : (
          <section aria-labelledby="team-heading" className="space-y-5">
            <div className="space-y-2">
              <h1 id="team-heading" className="text-2xl font-bold tracking-tight">어느 팀을 응원하세요?</h1>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">팀을 고르면 바로 투표에 참여할 수 있어요.</p>
            </div>
            <div className="divide-y divide-black/10 border-y border-black/10 dark:divide-white/15 dark:border-white/15">
              {(Object.keys(teams) as Team[]).map((team) => (
                <button
                  key={team}
                  type="button"
                  disabled={pending !== null || restoreError || !isSupabaseConfigured}
                  onClick={() => chooseTeam(team)}
                  className="flex min-h-16 w-full items-center gap-3 px-1 text-left font-semibold hover:enabled:bg-neutral-100 disabled:opacity-65 dark:hover:enabled:bg-neutral-900"
                >
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white ${teams[team].color}`} aria-hidden="true">{teams[team].mark}</span>
                  <span className="flex-1">{teams[team].label}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
                    <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
            {pending && <p role="status" className="text-sm">{pending === "restore" ? "참가 정보를 확인하고 있어요." : "입장하고 있어요."}</p>}
            {!isSupabaseConfigured && <p role="status" className="text-sm">서버 연결 설정이 필요합니다.</p>}
            {error?.field === "team" && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{error.message}</p>}
            {restoreError && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <p role="alert">참가 정보를 불러오지 못했습니다.</p>
                <button type="button" className="min-h-11 rounded-md px-2 font-semibold underline" onClick={() => {
                  setRestoreError(false);
                  setPending("restore");
                  setRestoreAttempt((attempt) => attempt + 1);
                }}>다시 시도</button>
              </div>
            )}
          </section>
        )}

      </main>
    </>
  );
}
