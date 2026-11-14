import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbError } from "./http";

/** 내 마지막 활동 시각을 지금으로 갱신하고 그 시각을 돌려준다. */
export async function touchFan(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc("touch_fan");
  if (error) throw fromDbError(error);
  return data as string;
}
