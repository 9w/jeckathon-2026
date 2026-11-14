import { createClient } from "@supabase/supabase-js";

export type Team = "lg" | "doosan";
export type Choice = "safe" | "out";
export type SharedReplay = {
  roomId: string;
  date: string;
  away: string;
  home: string;
  phase: "waiting" | "open" | "locked" | "revealed" | "finished";
  roundId: string | null;
  inning: number | null;
  half: "top" | "bottom" | null;
  batter: string | null;
  secondsLeft: number | null;
  result: string | null;
  myVote: Choice | null;
};

export type FanProfile = {
  id: string;
  team: Team;
  nickname: string | null;
  points: number;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key) : null;
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

export async function loadSharedReplay(roomId: string): Promise<SharedReplay | null> {
  const { data, error } = await supabase().rpc("get_replay_room", { p_room: roomId });
  if (error) throw error;
  return data as unknown as SharedReplay | null;
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
  return profile;
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

export async function castReplayVote(roomId: string, roundId: string, choice: Choice) {
  const { data, error } = await supabase()
    .rpc("cast_replay_vote", { p_room: roomId, p_round: roundId, p_choice: choice })
    .overrideTypes<Choice, { merge: false }>();
  if (error?.code === "55000") return null;
  if (error) throw error;
  if (data !== "safe" && data !== "out") throw new Error("Missing saved vote");
  return data;
}
