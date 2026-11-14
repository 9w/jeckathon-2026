import { getAccessToken } from "@/lib/fan-session";

export type ApiError = { code: string; message: string };

/** 서버 API 실패. code로 분기하고 message는 사용자에게 그대로 보여줄 수 있다. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 게스트 세션 토큰을 붙여 서버 API를 호출한다. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiRequestError(401, "unauthorized", "응원팀을 먼저 선택해 주세요.");

  const response = await fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: ApiError } | null)?.error;
    throw new ApiRequestError(response.status, error?.code ?? "internal_error", error?.message ?? "요청에 실패했습니다.");
  }
  return body as T;
}
