"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buyFanCard, loadFanCardCollection, type FanCardCollection } from "@/lib/fan-session";

function purchaseError(error: unknown) {
  const detail = error && typeof error === "object" && "details" in error ? error.details : null;
  if (detail === "insufficient_points") return "포인트가 부족해요. 예측을 맞혀 모아요.";
  if (detail === "invalid_selection") return "응원팀의 캐릭터 카드를 다시 골라 주세요.";
  if (detail === "request_conflict") return "이미 처리된 요청이에요. 다시 선택해 주세요.";
  return "구매를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function useFanCollection(playerId: string | undefined, onPoints: (points: number) => void) {
  const [data, setData] = useState<FanCardCollection | null>(null);
  const [failure, setFailure] = useState(false);
  const revision = useRef(0);
  const requestIds = useRef(new Map<string, string>());
  const player = useRef(playerId);
  useEffect(() => { player.current = playerId; }, [playerId]);

  const refresh = useCallback(async () => {
    if (!playerId) return;
    const request = ++revision.current;
    try {
      const result = await loadFanCardCollection();
      if (request === revision.current) {
        setData(result);
        setFailure(false);
      }
    } catch {
      if (request === revision.current) setFailure(true);
    }
  }, [playerId]);

  useEffect(() => {
    void refresh();
    return () => { revision.current++; };
  }, [refresh]);

  async function buy(cardId?: string) {
    const key = cardId ?? "pack";
    const requestId = requestIds.current.get(key) ?? crypto.randomUUID();
    requestIds.current.set(key, requestId);
    const request = ++revision.current;
    try {
      const result = await buyFanCard(requestId, cardId);
      requestIds.current.delete(key);
      if (player.current === playerId && request === revision.current) {
        setData(result);
        setFailure(false);
        onPoints(result.points);
      }
      return result.charged;
    } catch (error) {
      throw new Error(purchaseError(error));
    }
  }

  function reset() {
    revision.current++;
    requestIds.current.clear();
    setData(null);
    setFailure(false);
  }
  return { data, failure, refresh, buy, reset };
}
