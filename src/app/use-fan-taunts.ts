"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listFanTaunts, readFanTaunt, sendFanTaunt, updateTauntActivity } from "@/lib/fan-session";
import { tauntErrorMessage, type FanTaunt } from "@/lib/fan-taunts";

export function useFanTaunts(playerId: string | undefined, onPoints: (points: number) => void) {
  const [inbox, setInbox] = useState<FanTaunt[]>([]);
  const [opened, setOpened] = useState<FanTaunt | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const requests = useRef(new Map<string, string>());
  const incoming = opened ?? inbox.find((taunt) => !taunt.readAt && !dismissed.includes(taunt.id)) ?? null;

  useEffect(() => {
    if (!playerId) return;
    let stopped = false;
    let polling = false;
    async function poll() {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      try {
        const messages = await listFanTaunts();
        if (!stopped) setInbox(messages);
      } catch {
        // Keep the last confirmed inbox while the connection reconnects.
      } finally {
        polling = false;
      }
    }
    let activity = Promise.resolve();
    function markActivity(active: boolean) {
      activity = activity.then(() => stopped && active ? undefined : updateTauntActivity(active)).catch(() => {});
    }
    function onVisibility() {
      const visible = document.visibilityState === "visible";
      markActivity(visible);
      if (visible) void poll();
    }
    function onPageHide() { markActivity(false); }
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const pollTimer = window.setInterval(poll, 1800);
    const activityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") markActivity(true);
    }, 30000);
    return () => {
      stopped = true;
      window.clearInterval(pollTimer);
      window.clearInterval(activityTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [playerId]);

  const read = useCallback(async (id: string) => {
    const message = await readFanTaunt(id);
    if (message) {
      setOpened(message);
      setInbox((current) => current.map((item) => item.id === id ? message : item));
    }
  }, []);

  async function send(cardId: string, phraseId: string, replyTo?: string) {
    const key = JSON.stringify([cardId, phraseId, replyTo ?? null]);
    const requestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, requestId);
    try {
      const result = await sendFanTaunt(cardId, phraseId, requestId, replyTo);
      requests.current.delete(key);
      onPoints(result.points);
      return result.taunt;
    } catch (error) {
      throw new Error(tauntErrorMessage(error));
    }
  }

  function dismiss() {
    if (incoming) setDismissed((current) => [...current, incoming.id]);
    setOpened(null);
  }

  function reset() {
    setInbox([]);
    setOpened(null);
    setDismissed([]);
    requests.current.clear();
  }
  return { inbox, incoming, read, send, dismiss, reset, open: setOpened };
}
