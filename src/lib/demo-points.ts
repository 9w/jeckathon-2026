import { apiRequest } from "@/lib/api-request";

/** 데모용 포인트 지급(예측 보상 100P, 충전 300P). 같은 key로는 한 번만 지급된다. 지급 후 잔액을 돌려준다. */
export async function claimDemoPoints(key: string, amount: 100 | 300) {
  return (
    await apiRequest<{ points: number }>("/api/fans/demo-points", {
      method: "POST",
      body: JSON.stringify({ key, amount }),
    })
  ).points;
}
