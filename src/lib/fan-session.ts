import { createClient } from "@supabase/supabase-js";

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

async function loadVote(id: string): Promise<Choice | null> {
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
  return { profile, vote: await loadVote(profile.id) };
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

export type Round = {
  id: string;
  batter: string;
  opens_at: string;
  locks_at: string;
  result_at: string;
  status: "open" | "settled" | "void";
  answer: Choice | null;
};

// 결과 시각이 지난 타석을 정산하고 최근 타석을 받는다. 여러 명이 동시에 불러도 정산은 한 번만 된다.
export async function pollRounds(gameId: string) {
  const { data, error } = await supabase().rpc("poll_rounds", { p_game_id: gameId });
  if (error) throw error;
  return data as Round[];
}

// 마감 후면 error.hint === "VOTING_CLOSED". 이미 투표했으면 처음 선택을 돌려준다.
export async function castPrediction(roundId: string, choice: Choice) {
  const { data, error } = await supabase().rpc("cast_prediction", { p_round_id: roundId, p_choice: choice });
  if (error) throw error;
  return data as Choice;
}
