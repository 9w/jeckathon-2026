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

/** 서버 API 호출용 액세스 토큰. 게스트 세션이 없으면 null. */
export async function getAccessToken() {
  const { data, error } = await supabase().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
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

export class NicknameTakenError extends Error {
  constructor() {
    super("이미 사용 중인 닉네임이에요");
  }
}

/** 팀과 닉네임을 함께 등록해 입장한다. 이미 입장했으면 기존 프로필을 돌려준다. 닉네임이 겹치면 NicknameTakenError. */
export async function joinFanWithNickname(team: Team, nickname: string) {
  if (!(await getUserId())) {
    const { error } = await supabase().auth.signInAnonymously();
    if (error) throw error;
  }

  const { data: profile, error } = await supabase()
    .rpc("join_fan", { p_team: team, p_nickname: nickname })
    .single<FanProfile>();
  if (error?.code === "23505") throw new NicknameTakenError();
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
