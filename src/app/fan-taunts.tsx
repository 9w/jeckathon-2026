import { useEffect, useRef, useState, type ReactNode } from "react";
import { tauntCards, tauntCost, tauntPhrases, type FanTaunt } from "@/lib/fan-taunts";
import { FanSheet } from "./fan-setup";
import "./fan-taunts.css";

type TauntProps = {
  points: number;
  opposingTeam: string;
  active: boolean;
  incoming: FanTaunt | null;
  lastSent?: FanTaunt | null;
  showIncomingBanner?: boolean;
  onDismissIncoming: () => void;
  onRead: (id: string) => Promise<void>;
  onReceipt?: (id: string) => Promise<FanTaunt | null>;
  onSend: (cardId: string, phraseId: string, replyTo?: string) => Promise<FanTaunt>;
  onClose: () => void;
  onPrediction: () => void;
  renderBurst: (className: string) => ReactNode;
};

function pointsLabel(points: number) {
  return `${points.toLocaleString("ko-KR")}P`;
}

function cardFor(id: string) {
  return tauntCards.find((entry) => entry.id === id) ?? tauntCards[0];
}

function phraseFor(id: string, fallback: string) {
  return tauntPhrases.find((entry) => entry.id === id)?.text ?? fallback;
}

function TauntDialog({ title, onClose, children, fullscreen = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  fullscreen?: boolean;
}) {
  return (
    <dialog
      ref={(node) => { if (node && !node.open) node.showModal(); }}
      className={`fan-taunt-dialog${fullscreen ? " fan-taunt-dialog-full" : ""}`}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {children}
    </dialog>
  );
}

function TauntSent({ status, opposingTeam, points, onClose, onReceipt, renderBurst }: {
  status: FanTaunt;
  opposingTeam: string;
  points: number;
  onClose: () => void;
  onReceipt?: TauntProps["onReceipt"];
  renderBurst: TauntProps["renderBurst"];
}) {
  const [left, setLeft] = useState(3);
  const [readAt, setReadAt] = useState(status.readAt);
  const finish = useRef(onClose);
  const receipt = useRef(onReceipt);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { finish.current = onClose; }, [onClose]);
  useEffect(() => { receipt.current = onReceipt; }, [onReceipt]);
  useEffect(() => {
    const clock = window.setInterval(() => setLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    const returnToRoom = window.setTimeout(() => finish.current(), 3000);
    close.current?.focus({ preventScroll: true });
    return () => { window.clearInterval(clock); window.clearTimeout(returnToRoom); };
  }, []);
  useEffect(() => {
    if (status.readAt) return;
    let watching = true;
    let pending = false;
    const checkReceipt = async () => {
      if (!receipt.current || pending) return;
      pending = true;
      try {
        const result = await receipt.current(status.id);
        if (watching && result?.readAt) setReadAt(result.readAt);
      } catch {
        // The stored receipt can still update on the next check.
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(() => void checkReceipt(), 900);
    return () => { watching = false; window.clearInterval(timer); };
  }, [status.id, status.readAt]);

  const card = cardFor(status.cardId);
  return (
    <section className="fan-taunt-sent" aria-label="도발 전송 결과">
      {renderBurst("fan-taunt-sent-burst")}
      <div className="fan-taunt-sent-hero">
        <span aria-hidden="true">{card.emoji}</span>
        <h1>전송 성공!</h1>
        <p>−{pointsLabel(tauntCost)} · 잔액 {pointsLabel(points)}</p>
      </div>
      <div className="fan-taunt-recipient">
        <h2>받은 사람</h2>
        <div>
          <span className="fan-taunt-recipient-avatar" aria-hidden="true">{status.recipientNickname?.[0] ?? opposingTeam[0]}</span>
          <p><strong>{status.recipientNickname ?? `${opposingTeam} 팬`}</strong><small>{opposingTeam}</small></p>
          <span className="fan-taunt-read">{status.readAt || readAt ? "읽음" : "전송됨"}</span>
        </div>
      </div>
      <button ref={close} type="button" className="fan-stage-button" onClick={onClose}>계속 관람하기</button>
      <p className="fan-taunt-timing">{left}초 후 자동으로 닫혀요</p>
    </section>
  );
}

function TauntComposer({ points, opposingTeam, status, reply, onSend, onClose, onReceipt, renderBurst }: Pick<TauntProps, "points" | "opposingTeam" | "onSend" | "onClose" | "onReceipt" | "renderBurst"> & {
  status?: FanTaunt | null;
  reply: FanTaunt | null;
}) {
  const [cardId, setCardId] = useState<string>(tauntCards[0].id);
  const [phraseId, setPhraseId] = useState("default");
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<FanTaunt | null>(null);
  const [feedback, setFeedback] = useState("");
  const sendLock = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const card = cardFor(cardId);
  const text = phraseFor(phraseId, card.text);
  const enough = points >= tauntCost;

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);

  async function send() {
    if (sendLock.current || !enough) return;
    sendLock.current = true;
    setSending(true);
    setFeedback("");
    try {
      setSent(await onSend(cardId, phraseId, reply?.id));
      setConfirm(false);
    } catch (error) {
      setFeedback(error instanceof Error && error.message ? error.message : "도발을 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  function closeConfirm() {
    if (!sending) { setConfirm(false); setFeedback(""); }
  }

  if (sent) return <TauntSent status={status?.id === sent.id ? status : sent} points={points} opposingTeam={opposingTeam} onClose={onClose} onReceipt={onReceipt} renderBurst={renderBurst} />;

  return (
    <section className="fan-taunt-compose" aria-labelledby="taunt-compose-heading">
      <header className="fan-room-header">
        <button type="button" className="fan-back" aria-label="이전 화면으로 돌아가기" onClick={onClose}>‹</button>
        <h1 ref={title} tabIndex={-1} id="taunt-compose-heading">상대팀에게 한 방!</h1>
        <span className="fan-points" aria-label={`내 포인트 ${points}점`}>{pointsLabel(points)}</span>
      </header>
      <div className="fan-taunt-target">
        <span className="fan-taunt-chip-selected">{reply ? `${reply.senderNickname ?? `${opposingTeam} 팬`}에게 반격` : `${opposingTeam} 팬 랜덤`}</span>
      </div>
      <div className="fan-taunt-preview">
        {renderBurst("fan-taunt-preview-burst")}
        <div className="fan-taunt-preview-card">
          <span aria-hidden="true">{card.emoji}</span>
          <strong>{text}</strong>
        </div>
      </div>
      <div className="fan-taunt-catalog">
        <h2>도발 카드 고르기 <span>· 모두 {pointsLabel(tauntCost)}</span></h2>
        <ul className="fan-taunt-grid">
          {tauntCards.map((entry) => <li key={entry.id}>
            <button type="button" aria-pressed={cardId === entry.id} aria-label={entry.label} onClick={() => { setCardId(entry.id); setPhraseId("default"); setFeedback(""); }}>
              <span aria-hidden="true">{entry.emoji}</span><strong>{entry.label}</strong><small>{pointsLabel(tauntCost)}</small>
            </button>
          </li>)}
        </ul>
      </div>
      <div className="fan-taunt-phrases" role="group" aria-label="도발 문구">
        {tauntPhrases.map((phrase) => <button type="button" key={phrase.id} aria-pressed={phrase.id === phraseId} onClick={() => setPhraseId(phrase.id)}>{phrase.text}</button>)}
      </div>
      <div className="fan-taunt-actions">
        <button type="button" className="fan-stage-button" disabled={!enough} onClick={() => setConfirm(true)}>
          {enough ? `도발 보내기 · ${pointsLabel(tauntCost)}` : `포인트 부족 · ${pointsLabel(tauntCost)} 필요`}
        </button>
      </div>

      {confirm && (
        <TauntDialog title="이 카드를 보낼까요?" onClose={closeConfirm}>
          <article className="fan-taunt-dialog-card" aria-busy={sending}>
            <span className="fan-taunt-hero-emoji" aria-hidden="true">{card.emoji}</span>
            <h2>이 카드를 보낼까요?</h2>
            <p>{reply ? `${reply.senderNickname ?? `${opposingTeam} 팬`}님에게 전송` : `${opposingTeam} 진영의 활동 중인 팬에게 전송`}</p>
            <strong className="fan-taunt-quote">−{pointsLabel(tauntCost)} · 잔액 {pointsLabel(points)} → {pointsLabel(Math.max(0, points - tauntCost))}</strong>
            {feedback && <p role="alert" className="fan-error">{feedback}</p>}
            <button type="button" className="fan-stage-button" onClick={send} disabled={sending || !enough}>{sending ? "보내는 중…" : "보내기"}</button>
            <button type="button" className="fan-quiet-button" onClick={closeConfirm} disabled={sending}>취소</button>
          </article>
        </TauntDialog>
      )}
    </section>
  );
}

export function FanTaunts({ points, opposingTeam, active, incoming, lastSent, showIncomingBanner, onDismissIncoming, onRead, onReceipt, onSend, onClose, onPrediction, renderBurst }: TauntProps) {
  const [counter, setCounter] = useState<FanTaunt | null>(null);
  const [reply, setReply] = useState<FanTaunt | null>(null);
  const [openIncoming, setOpenIncoming] = useState<FanTaunt | null>(null);
  const viewed = useRef<string | null>(null);
  const enough = points >= tauntCost;
  const shownIncoming = openIncoming ?? incoming;
  const received = !active && !reply && !counter && shownIncoming && (!showIncomingBanner || openIncoming)
    ? shownIncoming
    : null;

  useEffect(() => {
    if (!received || received.readAt || viewed.current === received.id) return;
    viewed.current = received.id;
    void onRead(received.id).catch(() => {
      if (viewed.current === received.id) viewed.current = null;
    });
  }, [received, onRead]);

  function dismiss() {
    setOpenIncoming(null);
    onDismissIncoming();
  }

  function closeComposer() {
    setReply(null);
    onClose();
  }

  const composer = active || reply ? <TauntComposer points={points} opposingTeam={opposingTeam} status={lastSent} reply={reply} onSend={onSend} onClose={closeComposer} onReceipt={onReceipt} renderBurst={renderBurst} /> : null;
  const incomingCard = shownIncoming ? cardFor(shownIncoming.cardId) : null;

  return (
    <>
      {composer && (reply && !active ? <TauntDialog fullscreen title="도발 카드 고르기" onClose={closeComposer}>{composer}</TauntDialog> : composer)}
      {!composer && !counter && incoming && incomingCard && showIncomingBanner && !openIncoming && (
        <button type="button" className="fan-taunt-banner" aria-label="받은 도발 보기" onClick={() => setOpenIncoming(incoming)}>
          <span aria-hidden="true">{incomingCard.emoji}</span>
          <span><small>{incoming.senderNickname ?? `${opposingTeam} 팬`} · {opposingTeam} 팬의 도발</small><strong>“{phraseFor(incoming.phraseId, incomingCard.text)}”</strong></span>
          <span aria-hidden="true">보기 ›</span>
        </button>
      )}
      {received && incomingCard && (
        <TauntDialog fullscreen title="상대팀 팬이 도발했어요!" onClose={dismiss}>
          <div className="fan-taunt-received">
            {renderBurst("fan-taunt-received-burst")}
            <article className="fan-taunt-dialog-card">
              <span className="fan-taunt-hero-emoji" aria-hidden="true">{incomingCard.emoji}</span>
              <h2>상대팀 팬이 도발했어요!</h2>
              <p>{received.senderNickname ?? `${opposingTeam} 팬`} · {opposingTeam}</p>
              <strong className="fan-taunt-quote">“{phraseFor(received.phraseId, incomingCard.text)}”</strong>
              <button type="button" className="fan-stage-button" onClick={() => { setCounter(received); dismiss(); }}>반격 준비하기</button>
              <button type="button" className="fan-quiet-button" onClick={dismiss}>닫기</button>
            </article>
          </div>
        </TauntDialog>
      )}
      {counter && (
        <FanSheet title="반격할 차례입니다!" onClose={() => setCounter(null)}>
          <dl className="fan-taunt-counter-status">
            <div><dt>보유 포인트</dt><dd className="fan-replay-number">{pointsLabel(points)}</dd></div>
            <div><dt>상대 진영</dt><dd>{opposingTeam}</dd></div>
          </dl>
          <button type="button" className="fan-stage-button" disabled={!enough} onClick={() => { setReply(counter); setCounter(null); }}>
            {enough ? "지금 도발하기" : `포인트 부족 · ${pointsLabel(tauntCost)} 필요`}
          </button>
          <button type="button" className="fan-stage-button fan-taunt-secondary" onClick={() => { setCounter(null); onPrediction(); }}>다음 예측으로 포인트 벌기</button>
          <button type="button" className="fan-quiet-button" onClick={() => setCounter(null)}>닫기</button>
        </FanSheet>
      )}
    </>
  );
}
