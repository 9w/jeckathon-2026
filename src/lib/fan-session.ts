import { createClient } from "@supabase/supabase-js";
import type { FanTaunt } from "./fan-taunts";

export type Team = "lg" | "doosan";
export type Choice = "safe" | "out";

export type SharedReplay = {
  roomId: string;
  date: string;
  away: string;
  home: string;
  phase: "waiting" | "paused" | "open" | "locked" | "revealed" | "finished";
  elapsed: number;
  duration: number;
  playing: boolean;
  canControl: boolean;
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

export type FanCardCollection = { team: Team; ownedCardIds: string[]; points: number };
export type FanProfileStats = { hits: number; tries: number; sent: number };
export type FanReplayRewards = {
  points: number;
  earned: number;
  roundId: string | null;
  roundReward: number | null;
  voteCount?: number;
  safeVotes?: number | null;
  outVotes?: number | null;
};

export async function loadFanCardCollection(): Promise<FanCardCollection> {
  const { data, error } = await supabase().rpc("get_fan_card_collection");
  if (error) throw error;
  return data;
}

export async function buyFanCard(requestId: string, cardId?: string): Promise<FanCardCollection & { charged: number }> {
  const { data, error } = cardId
    ? await supabase().rpc("buy_fan_card", { p_card_id: cardId, p_request_id: requestId })
    : await supabase().rpc("buy_fan_card_pack", { p_request_id: requestId });
  if (error) throw error;
  return data;
}

export async function loadFanProfileStats(): Promise<FanProfileStats> {
  const { data, error } = await supabase().rpc("get_fan_profile_stats");
  if (error) throw error;
  return data;
}

export async function loadFanCampPresence(): Promise<Record<Team, number>> {
  const { data, error } = await supabase().rpc("get_fan_camp_presence");
  if (error) throw error;
  return data;
}

export async function loadFanReplayRewards(roomId: string): Promise<FanReplayRewards | null> {
  const { data, error } = await supabase().rpc("get_fan_replay_rewards", { p_room: roomId });
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

export async function loadSharedReplay(roomId: string | null): Promise<SharedReplay | null> {
  const api = supabase();
  const { data, error } = roomId
    ? await api.rpc("get_replay_room", { p_room: roomId })
    : await api.rpc("get_current_replay_room");
  if (error) throw error;
  return data as unknown as SharedReplay | null;
}

export async function claimReplayOperator(code: string) {
  const { data, error } = await supabase().rpc("claim_replay_operator", { p_code: code });
  if (error) throw error;
  return data === true;
}

export async function controlReplay(roomId: string, action: "play" | "pause" | "seek", second?: number) {
  const { error } = await supabase().rpc("control_replay", { p_room: roomId, p_action: action, p_second: second ?? null });
  if (error) throw error;
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
