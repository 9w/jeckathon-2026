import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "./http";
import type { ReceivedTaunt, SentRandomTaunt, SentTaunt, TauntCard, TauntTarget } from "@/lib/taunt-types";

export async function listTauntTargets(db: SupabaseClient): Promise<TauntTarget[]> {
  const { data, error } = await db.rpc("list_taunt_targets");
  if (error) throw fromDbError(error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    team: row.team as TauntTarget["team"],
    lastActiveAt: row.last_active_at as string,
    recentTauntCount: row.recent_taunt_count as number,
  }));
}

export async function listTauntCards(db: SupabaseClient): Promise<TauntCard[]> {
  const { data, error } = await db
    .from("taunt_cards")
    .select("id,target_team,message,cost")
    .order("target_team")
    .order("sort_order");
  if (error) throw fromDbError(error);
  return data.map((row) => ({
    id: row.id,
    targetTeam: row.target_team,
    message: row.message,
    cost: row.cost,
  }));
}

export async function sendTaunt(db: SupabaseClient, receiverId: string, cardId: string): Promise<SentTaunt> {
  const { data, error } = await db
    .rpc("send_taunt", { p_receiver_id: receiverId, p_card_id: cardId })
    .single<{ id: string; points: number; created_at: string }>();
  if (error) throw fromDbError(error);
  return { id: data.id, remainingPoints: data.points, createdAt: data.created_at };
}

type RandomTauntRow = {
  id: string;
  points: number;
  created_at: string;
  receiver_id: string;
  receiver_nickname: string;
  receiver_team: SentRandomTaunt["receiver"]["team"];
  card_id: string;
  card_message: string;
};

/** 상대팀 불특정 1명에게 놀리기. cardId가 없으면 대상 팀용 카드 중 무작위. */
export async function sendRandomTaunt(db: SupabaseClient, cardId: string | null): Promise<SentRandomTaunt> {
  const { data, error } = await db
    .rpc("send_random_taunt", { p_card_id: cardId })
    .single<RandomTauntRow>();
  if (error) throw fromDbError(error);
  return {
    id: data.id,
    remainingPoints: data.points,
    createdAt: data.created_at,
    receiver: { id: data.receiver_id, nickname: data.receiver_nickname, team: data.receiver_team },
    card: { id: data.card_id, message: data.card_message },
  };
}

export async function listReceivedTaunts(db: SupabaseClient, unreadOnly: boolean): Promise<ReceivedTaunt[]> {
  const { data, error } = await db.rpc("list_received_taunts", { p_unread_only: unreadOnly });
  if (error) throw fromDbError(error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    cardId: row.card_id as string,
    message: row.message as string,
    sender: {
      id: row.sender_id as string,
      nickname: row.sender_nickname as string,
      team: row.sender_team as ReceivedTaunt["sender"]["team"],
    },
    cost: row.cost as number,
    createdAt: row.created_at as string,
    readAt: row.read_at as string | null,
  }));
}

export async function markTauntsRead(db: SupabaseClient, ids: string[] | null): Promise<number> {
  const { data, error } = await db.rpc("mark_taunts_read", { p_ids: ids });
  if (error) throw fromDbError(error);
  return data as number;
}
