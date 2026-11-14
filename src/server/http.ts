export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type PostgrestLikeError = { code?: string; message?: string };

// DB 함수가 던지는 오류 코드 → HTTP 응답
// 커스텀 코드는 JKxxx를 쓴다. PTxxx는 PostgREST가 HTTP 상태 코드로 해석하므로 쓰면 안 된다(PT001 → 상태 1).
const dbErrors: Record<string, [number, string, string]> = {
  "42501": [403, "forbidden", "응원팀을 먼저 선택해 주세요."],
  PGRST301: [401, "unauthorized", "로그인이 만료되었습니다."],
  PGRST303: [401, "unauthorized", "로그인이 만료되었습니다."],
  "22023": [400, "invalid_request", "놀릴 수 없는 대상이거나 잘못된 카드입니다."],
  "22P02": [400, "invalid_request", "요청 형식이 올바르지 않습니다."],
  P0002: [404, "target_not_found", "대상을 찾을 수 없습니다."],
  JK001: [402, "not_enough_points", "포인트가 부족합니다."],
  JK002: [429, "cooldown", "잠시 후 다시 놀릴 수 있습니다."],
  JK003: [429, "target_limit", "이 팬은 지금 너무 많이 놀림받았어요. 다른 팬을 골라 주세요."],
  JK004: [409, "target_inactive", "지금 접속하지 않은 팬입니다."],
  JK005: [403, "nickname_required", "닉네임을 먼저 설정해 주세요."],
  JK006: [404, "no_target", "지금 놀릴 수 있는 상대팀 팬이 없어요."],
};

export function fromDbError(error: PostgrestLikeError): HttpError {
  const mapped = error.code ? dbErrors[error.code] : undefined;
  if (mapped) return new HttpError(...mapped);
  console.error("Unexpected database error", error);
  return new HttpError(500, "internal_error", "잠시 후 다시 시도해 주세요.");
}

export function errorResponse(error: unknown) {
  let http: HttpError;
  if (error instanceof HttpError) {
    http = error;
  } else {
    console.error(error);
    http = new HttpError(500, "internal_error", "잠시 후 다시 시도해 주세요.");
  }
  return Response.json({ error: { code: http.code, message: http.message } }, { status: http.status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new HttpError(400, "invalid_request", "JSON 본문이 필요합니다.");
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
