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
  /** 이 카드를 보낼 수 있는 대상 팀 */
  targetTeam: Team;
  message: string;
  cost: number;
};

export type SentTaunt = {
  id: string;
  remainingPoints: number;
  createdAt: string;
};

export type SentRandomTaunt = SentTaunt & {
  /** 서버가 무작위로 고른 대상 */
  receiver: { id: string; nickname: string; team: Team };
  /** 보낸 카드 (카드를 생략하면 서버가 무작위로 고름) */
  card: { id: string; message: string };
};

export type ReceivedTaunt = {
  id: string;
  cardId: string;
  message: string;
  sender: { id: string; nickname: string; team: Team };
  cost: number;
  createdAt: string;
  readAt: string | null;
};

