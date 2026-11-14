import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "./http";

/** 내 마지막 활동 시각을 지금으로 갱신하고 그 시각을 돌려준다. */
export async function touchFan(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("touch_fan");
  if (error) throw fromDbError(error);
  return data as string;
}

/** 데모용 포인트 지급(예측 보상 100P, 충전 300P). 같은 key로는 한 번만 지급된다. 지급 후 잔액을 돌려준다. */
export async function claimDemoPoints(db: SupabaseClient, key: string, amount: number): Promise<number> {
  const { data, error } = await db.rpc("claim_demo_points", { p_key: key, p_amount: amount });
  if (error) throw fromDbError(error);
  return data as number;
}
