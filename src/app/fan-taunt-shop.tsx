import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Team } from "@/lib/fan-session";
import { tauntCost, teamTauntCards } from "@/lib/fan-taunts";
import "./fan-taunts.css";

type CardPicture = { emoji: string; image?: string };

export function TauntPicture({ card, className }: { card: CardPicture; className?: string }) {
  if (!card.image) return <span className={className} aria-hidden="true">{card.emoji}</span>;
  return <Image className={className} src={card.image} alt="" width={160} height={154} unoptimized />;
}

type ShopProps = {
  team: Team;
  points: number;
  ownedCardIds: readonly string[];
  onBuyCard: (cardId: string) => Promise<number>;
  onBuyPack: () => Promise<number>;
  onClose: () => void;
  onUseCard: (cardId: string) => void;
  renderBurst: (className: string) => ReactNode;
  initialCardId?: string;
  available?: boolean;
};

const packNames = { lg: "트윈스 캐릭터 팩", doosan: "베어스 캐릭터 팩" } as const;
const teamNames = { lg: "LG 트윈스", doosan: "두산 베어스" } as const;

export function FanTauntShop({ team, points, ownedCardIds, onBuyCard, onBuyPack, onClose, onUseCard, renderBurst, initialCardId, available = true }: ShopProps) {
  const cards = teamTauntCards[team];
  const [selectedId, setSelectedId] = useState(initialCardId ?? cards[1].id);
  const [buying, setBuying] = useState<"card" | "pack" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const buyLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shop = useRef<HTMLElement>(null);
  const owned = new Set(ownedCardIds);
  const selected = cards.find((card) => card.id === selectedId) ?? cards[1];
  const selectedOwned = owned.has(selected.id);
  const remaining = cards.filter((card) => !owned.has(card.id)).length;
  const packCost = Math.max(0, (remaining - 1) * tauntCost);
  const packName = packNames[team];

  useEffect(() => {
    window.scrollTo(0, 0);
    shop.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, []);

  async function buy(kind: "card" | "pack") {
    if (buyLock.current || !available) return;
    const price = kind === "card" ? tauntCost : packCost;
    if (points < price) {
      setNotice({ text: `포인트가 부족해요 · ${price}P 필요`, error: true });
      return;
    }

    buyLock.current = true;
    setBuying(kind);
    setNotice(null);
    try {
      const charged = kind === "card" ? await onBuyCard(selected.id) : await onBuyPack();
      const name = kind === "card" ? selected.label : packName;
      setNotice({ text: `${name} 구매 완료 · ${charged}P 사용`, error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "구매하지 못했어요. 잠시 후 다시 시도해 주세요.", error: true });
    } finally {
      buyLock.current = false;
      setBuying(null);
    }
  }

  return (
    <section ref={shop} className="fan-taunt-shop" aria-labelledby="taunt-shop-title">
      <header className="fan-room-header">
        <button type="button" className="fan-back" aria-label="이전 화면으로 돌아가기" disabled={buying !== null} onClick={onClose}>‹</button>
        <h1 ref={heading} tabIndex={-1} id="taunt-shop-title">이모티콘 상점</h1>
        <span className="fan-points" aria-label={`내 포인트 ${points}점`}>{points.toLocaleString("ko-KR")}P</span>
      </header>
      <div className="fan-taunt-shop-tabs" aria-label="상점 바로가기">
        <span className="fan-taunt-chip-selected">{teamNames[team]} 팩</span>
        <button type="button" className="fan-taunt-chip" disabled={buying !== null} onClick={() => setNotice({ text: "기본 카드는 응원팀 팩이 나오면 함께 열려요.", error: false })}>기본 카드</button>
      </div>
      <div className="fan-taunt-shop-pack">
        {renderBurst("fan-taunt-shop-burst")}
        <TauntPicture card={cards[5]} className="fan-taunt-pack-picture fan-taunt-pack-picture-first" />
        <TauntPicture card={cards[0]} className="fan-taunt-pack-picture fan-taunt-pack-picture-second" />
        <TauntPicture card={cards[1]} className="fan-taunt-pack-picture fan-taunt-pack-picture-third" />
        <div className="fan-taunt-pack-copy">
          <h2>{packName}</h2>
          <p>도발 이모티콘 6종 한 번에<br />개별 구매보다 100P 할인</p>
          <button type="button" disabled={!available || remaining === 0 || buying !== null} onClick={() => void buy("pack")}>
            {buying === "pack" ? "구매 중…" : remaining > 0 ? `남은 ${remaining}종 · ${packCost}P 구매` : "모두 보유 중"}
          </button>
        </div>
      </div>
      <div className="fan-taunt-shop-label"><h2>하나씩 사기</h2><span>개당 100P</span></div>
      <ul className="fan-taunt-grid fan-taunt-shop-grid">
        {cards.map((card) => (
          <li key={card.id}>
            <button type="button" aria-pressed={card.id === selected.id} disabled={buying !== null} onClick={() => { setSelectedId(card.id); setNotice(null); }}>
              <TauntPicture card={card} className="fan-taunt-shop-picture" />
              <strong>{card.label}</strong>
              <small data-owned={owned.has(card.id)}>{owned.has(card.id) ? "보유 중" : "100P"}</small>
              {card.id === selected.id && <span className="fan-taunt-shop-check" aria-hidden="true">✓</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="fan-taunt-timing">포인트는 예측을 맞혀야만 모을 수 있어요 · 현금 결제 없음</p>
      <div className="fan-taunt-actions">
        <div aria-live="polite">
          {!available && <p className="fan-status">보유 카드를 확인하고 있어요.</p>}
          {notice && <p className={notice.error ? "fan-error" : "fan-status"}>{notice.text}</p>}
        </div>
        <button type="button" className="fan-stage-button" disabled={!available || buying !== null} onClick={() => {
          if (selectedOwned) onUseCard(selected.id);
          else void buy("card");
        }}>
          {buying === "card" ? "구매 중…" : selectedOwned ? `${selected.label} 바로 보내러 가기` : `${selected.label} 구매하기 · 100P`}
        </button>
      </div>
    </section>
  );
}
