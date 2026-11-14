import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * 요청한 사용자 권한으로 동작하는 Supabase 클라이언트.
 * 브라우저가 보낸 `Authorization: Bearer <access_token>`을 그대로 전달하므로
 * RLS와 RPC 안의 auth.uid()가 요청자 기준으로 적용된다.
 */
export function supabaseForRequest(request: Request) {
  if (!url || !key) throw new HttpError(503, "supabase_not_configured", "Supabase 설정이 없습니다.");

  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "unauthorized", "로그인이 필요합니다.");
  }

  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
