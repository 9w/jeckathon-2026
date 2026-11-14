import type { Team } from "@/lib/fan-session";

export type TauntTarget = {
  id: string;
  nickname: string;
  team: Team;
  lastActiveAt: string;
  /** 최근 5분간 받은 놀림 수 */
  recentTauntCount: number;
};

export type TauntCard = {
  id: string;
  emoji: string;
  name: string;
  /** 문구를 고르지 않았을 때의 기본 문구 */
  message: string;
  cost: number;
  /** 이 카드를 보낼 수 있는 대상 팀. null이면 모든 팀 */
  targetTeam: Team | null;
};

/** 카드와 함께 고를 수 있는 정해진 문구 */
export type TauntPhrase = { id: string; message: string };

export type SentTaunt = {
  id: string;
  remainingPoints: number;
  createdAt: string;
};

export type SentRandomTaunt = SentTaunt & {
  /** 서버가 무작위로 고른 대상 */
  receiver: { id: string; nickname: string; team: Team };
  /** 보낸 카드 (카드를 생략하면 서버가 무작위로 고름) */
  card: { id: string; emoji: string; message: string };
};

export type ReceivedTaunt = {
  id: string;
  cardId: string;
  emoji: string;
  cardName: string;
  /** 고른 문구(없으면 카드 기본 문구) */
  message: string;
  sender: { id: string; nickname: string; team: Team };
  cost: number;
  createdAt: string;
  readAt: string | null;
};

