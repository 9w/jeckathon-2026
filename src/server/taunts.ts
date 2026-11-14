import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError, HttpError } from "./http";
import type { ReceivedTaunt, SentRandomTaunt, SentTaunt, TauntCard, TauntPhrase, TauntTarget } from "@/lib/taunt-types";

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

export async function listTauntCards(db: SupabaseClient): Promise<{ cards: TauntCard[]; phrases: TauntPhrase[] }> {
  const [cards, phrases] = await Promise.all([
    db.from("taunt_cards").select("id,emoji,name,message,cost,target_team").eq("active", true).order("sort_order"),
    db.from("taunt_phrases").select("id,message").order("sort_order"),
  ]);
  if (cards.error) throw fromDbError(cards.error);
  if (phrases.error) throw fromDbError(phrases.error);
  return {
    cards: cards.data.map((row) => ({
      id: row.id,
      emoji: row.emoji,
      name: row.name,
      message: row.message,
      cost: row.cost,
      targetTeam: row.target_team,
    })),
    phrases: phrases.data,
  };
}

export async function sendTaunt(db: SupabaseClient, receiverId: string, cardId: string, phraseId: string | null): Promise<SentTaunt> {
  const { data, error } = await db
    .rpc("send_taunt", { p_receiver_id: receiverId, p_card_id: cardId, p_phrase_id: phraseId })
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
  card_emoji: string;
  card_message: string;
};

/** 상대팀 불특정 1명에게 놀리기. cardId가 없으면 카드도 무작위. */
export async function sendRandomTaunt(db: SupabaseClient, cardId: string | null, phraseId: string | null): Promise<SentRandomTaunt> {
  const { data, error } = await db
    .rpc("send_random_taunt", { p_card_id: cardId, p_phrase_id: phraseId })
    .single<RandomTauntRow>();
  if (error) throw fromDbError(error);
  return {
    id: data.id,
    remainingPoints: data.points,
    createdAt: data.created_at,
    receiver: { id: data.receiver_id, nickname: data.receiver_nickname, team: data.receiver_team },
    card: { id: data.card_id, emoji: data.card_emoji, message: data.card_message },
  };
}

export async function listReceivedTaunts(db: SupabaseClient, unreadOnly: boolean): Promise<ReceivedTaunt[]> {
  const { data, error } = await db.rpc("list_received_taunts", { p_unread_only: unreadOnly });
  if (error) throw fromDbError(error);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    cardId: row.card_id as string,
    emoji: row.card_emoji as string,
    cardName: row.card_name as string,
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

/** 내가 보낸 놀림의 확인 여부. RLS로 내가 보내거나 받은 놀림만 조회된다. */
export async function getSentTaunt(db: SupabaseClient, id: string): Promise<{ id: string; readAt: string | null }> {
  const { data, error } = await db.from("taunts").select("id,read_at").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new HttpError(404, "taunt_not_found", "놀림을 찾을 수 없습니다.");
  return { id: data.id, readAt: data.read_at };
}
