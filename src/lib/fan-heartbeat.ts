import { apiRequest } from "@/lib/api-request";

export const HEARTBEAT_INTERVAL_MS = 60_000;

/** 활동 신호 1회 전송. 갱신된 마지막 활동 시각을 돌려준다. */
export async function sendHeartbeat() {
  return (await apiRequest<{ lastActiveAt: string }>("/api/fans/heartbeat", { method: "POST" })).lastActiveAt;
}

/**
 * 화면이 보이는 동안 주기적으로 활동 신호를 보낸다.
 * - 시작 시, 그리고 탭/앱이 다시 보일 때 즉시 1회 전송
 * - 숨겨져 있는 동안은 보내지 않음
 * 반환값을 호출하면 중지된다. React에서는 입장한 뒤 useEffect에서 시작하고 cleanup으로 반환값을 호출한다.
 *
 *   useEffect(() => (profile ? startHeartbeat() : undefined), [profile?.id]);
 */
export function startHeartbeat(options: { intervalMs?: number; onError?: (error: unknown) => void } = {}) {
  const { intervalMs = HEARTBEAT_INTERVAL_MS, onError } = options;
  let timer: ReturnType<typeof setInterval> | undefined;

  const beat = () => {
    sendHeartbeat().catch((error) => onError?.(error));
  };

  const sync = () => {
    clearInterval(timer);
    timer = undefined;
    if (document.visibilityState !== "visible") return;
    beat();
    timer = setInterval(beat, intervalMs);
  };

  sync();
  document.addEventListener("visibilitychange", sync);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", sync);
  };
}
