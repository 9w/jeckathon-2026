"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Team } from "@/lib/fan-session";
import { getTauntText, type FanTaunt } from "@/lib/fan-taunts";
import { normalizeNickname } from "@/lib/nickname";
import { TeamDots, teams } from "./fan-setup";
import "./fan-profile.css";

type FanProfileScreenProps = {
  nickname: string;
  team: Team;
  points: number;
  avatar: string;
  inbox: FanTaunt[];
  stats?: { hits: number; tries: number; sent: number };
  pending: boolean;
  onSave: (nickname: string, photo?: File) => Promise<void>;
  onBack: () => void;
  onReset: () => void;
  onCounter: (taunt: FanTaunt) => void;
  resetError?: string;
};

const receivedTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
const nicknameLimit = 10;

export function FanProfileScreen({
  nickname, team, points, avatar, inbox, stats, pending, onSave, onBack, onReset, onCounter, resetError,
}: FanProfileScreenProps) {
  const [draft, setDraft] = useState(nickname);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const normalized = draft === nickname ? nickname : normalizeNickname(draft);
  const valid = normalized !== null && (normalized === nickname || [...normalized].length <= nicknameLimit);
  const busy = pending || saving;
  const portrait = photo?.url ?? avatar;
  const teamDisplay = teams[team];

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("사진 파일을 선택해 주세요.");
      return;
    }
    setPhoto({ file, url: URL.createObjectURL(file) });
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(normalized, photo?.file);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "프로필을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="fan-profile-screen" data-team={team} aria-labelledby="fan-profile-heading">
      <form onSubmit={save} className="fan-profile-form">
        <header className="fan-profile-header">
          <button type="button" className="fan-back" aria-label="홈으로 돌아가기" onClick={onBack} disabled={busy}>‹</button>
          <h1 ref={title} id="fan-profile-heading" tabIndex={-1}>내 프로필</h1>
          <button type="submit" className="fan-profile-save" disabled={!valid || busy}>{saving ? "저장 중…" : "저장"}</button>
        </header>

        <div className="fan-profile-content">
          <button type="button" className="fan-profile-photo" onClick={() => photoInput.current?.click()} disabled={busy}>
            <span className="fan-profile-portrait" aria-hidden="true">
              {portrait ? <span className="fan-avatar-image" style={{ backgroundImage: `url("${portrait}")` }} /> : [...(nickname || "?")][0]}
              <span className="fan-profile-pencil">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l5-.8L20 8l-4-4L5 15z" /></svg>
              </span>
            </span>
            사진 변경
          </button>
          <input ref={photoInput} type="file" accept="image/*" aria-label="프로필 사진 파일" hidden onChange={choosePhoto} />

          <dl className="fan-profile-stats" aria-label="내 경기 활동">
            <div><dt>오늘 적중</dt><dd>{stats ? `${stats.hits}/${stats.tries}` : "–"}</dd></div>
            <div><dt>보유 포인트</dt><dd>{points.toLocaleString("ko-KR")}P</dd></div>
            <div><dt>보낸 도발</dt><dd>{stats ? `${stats.sent.toLocaleString("ko-KR")}회` : "–"}</dd></div>
          </dl>

          <div className="fan-profile-nickname">
            <label htmlFor="fan-profile-nickname">닉네임</label>
            <div className="fan-profile-input">
              <input
                id="fan-profile-nickname"
                value={draft}
                autoComplete="off"
                disabled={busy}
                aria-invalid={!valid}
                aria-describedby="fan-profile-nickname-tip"
                onChange={(event) => { setDraft(event.currentTarget.value); setError(""); }}
              />
              <span aria-hidden="true">{[...draft].length}/{nicknameLimit}</span>
            </div>
            <p id="fan-profile-nickname-tip" className={valid ? "fan-status" : "fan-error"}>
              {valid ? "닉네임은 언제든 바꿀 수 있어요 · 2~10자" : "닉네임은 2~10자로 입력해 주세요"}
            </p>
          </div>

          <section className="fan-profile-team" aria-labelledby="fan-profile-team-heading">
            <div className="fan-profile-team-title">
              <h2 id="fan-profile-team-heading">응원팀</h2>
              <span>경기 중 변경 불가</span>
            </div>
            <div className="fan-profile-team-row">
              <TeamDots colors={teamDisplay.colors} />
              <strong>{teamDisplay.label}</strong>
              <span><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2" /></svg>잠김</span>
            </div>
            <p className="fan-profile-team-note">경기 중에는 진영을 바꿀 수 없어요</p>
          </section>
          {error && <p className="fan-error" role="alert">{error}</p>}

          <section className="fan-profile-inbox" aria-labelledby="fan-profile-inbox-heading">
            <h2 id="fan-profile-inbox-heading">최근 받은 도발</h2>
            {inbox.length === 0 ? <p className="fan-status">아직 받은 도발이 없어요.</p> : (
              <ul>
                {inbox.slice(0, 2).map((taunt) => {
                  const sender = taunt.senderNickname ?? "상대팀 팬";
                  const phrase = getTauntText(taunt.cardId, taunt.phraseId);
                  const date = new Date(taunt.sentAt);
                  const time = Number.isNaN(date.getTime()) ? null : receivedTime.format(date);
                  return (
                    <li key={taunt.id}>
                      <span className="fan-profile-sender-avatar" aria-hidden="true">{[...sender][0]}</span>
                      <div className="fan-profile-message">
                        <strong>{sender}</strong>
                        <p>“{phrase}”{time && <> · <time dateTime={taunt.sentAt}>{time}</time></>}</p>
                      </div>
                      <button type="button" aria-label={`${sender}에게 반격`} onClick={() => onCounter(taunt)} disabled={busy}>반격</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {resetError && <p className="fan-error" role="alert">{resetError}</p>}
          <button type="button" className="fan-quiet-button fan-profile-reset" onClick={onReset} disabled={busy}>게스트 기록 초기화</button>
        </div>
      </form>
    </section>
  );
}
