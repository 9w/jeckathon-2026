import { createClient } from "@supabase/supabase-js";
import type { FanTaunt } from "./fan-taunts";

export type Team = "lg" | "doosan";
export type Choice = "safe" | "out";

export type FanProfile = {
  id: string;
  team: Team;
  nickname: string | null;
  points: number;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key) : null;
const previewRound = "preview-1";
const profileFields = "id,team,nickname,points";

export const isSupabaseConfigured = client !== null;

function supabase() {
  if (!client) throw new Error("Supabase configuration is missing");
  return client;
}

async function getUserId() {
  const { data, error } = await supabase().auth.getSession();
  if (error) throw error;
  return data.session?.user.id;
}

export async function resetFanSession() {
  const { error } = await supabase().auth.signOut({ scope: "local" });
  // Local sign-out can clear the session even when revocation fails.
  if (error && (await getUserId())) throw error;
}

export async function loadVote(id: string): Promise<Choice | null> {
  const { data, error } = await supabase()
    .from("fan_votes")
    .select("choice")
    .eq("user_id", id)
    .eq("round_id", previewRound)
    .maybeSingle<{ choice: Choice }>();
  if (error) throw error;
  return data?.choice ?? null;
}

export async function restoreFan() {
  const id = await getUserId();
  if (!id) return null;

  const { data: profile, error } = await supabase()
    .from("fan_profiles")
    .select(profileFields)
    .eq("id", id)
    .maybeSingle<FanProfile>();
  if (error) throw error;
  return profile ? { profile, vote: await loadVote(id) } : null;
}

export async function joinFan(team: Team) {
  if (!(await getUserId())) {
    const { error } = await supabase().auth.signInAnonymously();
    if (error) throw error;
  }

  const { data: profile, error } = await supabase()
    .rpc("join_fan", { p_team: team })
    .single<FanProfile>();
  if (error) throw error;
  return profile;
}

export async function saveNickname(id: string, nickname: string) {
  const { data, error } = await supabase()
    .from("fan_profiles")
    .update({ nickname })
    .eq("id", id)
    .select("nickname")
    .single<{ nickname: string }>();
  if (error) throw error;
  return data.nickname;
}

export async function castVote(id: string, choice: Choice) {
  const { error } = await supabase()
    .from("fan_votes")
    .insert({ user_id: id, round_id: previewRound, choice });
  if (!error) return choice;
  if (error.code === "23505") {
    const existingVote = await loadVote(id);
    if (existingVote) return existingVote;
  }
  throw error;
}

export async function updateTauntActivity(active: boolean) {
  const { error } = await supabase().rpc("fan_taunt_activity", { p_active: active });
  if (error) throw error;
}

export async function listFanTaunts(): Promise<FanTaunt[]> {
  const { data, error } = await supabase().rpc("list_fan_taunts");
  if (error) throw error;
  return data;
}

export async function readFanTaunt(id: string): Promise<FanTaunt | null> {
  const { data, error } = await supabase().rpc("read_fan_taunt", { p_taunt_id: id });
  if (error) throw error;
  return data;
}

export async function getFanTaunt(id: string): Promise<FanTaunt | null> {
  const { data, error } = await supabase().rpc("get_fan_taunt", { p_taunt_id: id });
  if (error) throw error;
  return data;
}

export async function sendFanTaunt(cardId: string, phraseId: string, requestId: string, replyTo?: string): Promise<{ taunt: FanTaunt; points: number }> {
  const { data, error } = await supabase().rpc("send_fan_taunt", {
    p_card_id: cardId,
    p_phrase_id: phraseId,
    p_request_id: requestId,
    p_reply_to: replyTo ?? null,
  });
  if (error) throw error;
  return data;
}

export type FanPointPrediction = {
  phase: "ready" | "open" | "locked" | "result";
  round: number | null;
  choice: Choice | null;
  answer: Choice | null;
  reward: number | null;
  secondsLeft: number | null;
  points: number;
};

export async function pointPrediction(action: "read" | "start" | "vote", round?: number, choice?: Choice): Promise<FanPointPrediction> {
  const { data, error } = await supabase().rpc("fan_point_prediction", {
    p_action: action, p_round: round ?? null, p_choice: choice ?? null,
  });
  if (error) throw error;
  return data;
}
