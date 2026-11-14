import type { Team } from "./fan-session";

export const tauntCost = 100;

export const tauntCards = [
  { id: "first", emoji: "🤡", label: "처음 봐요?", text: "오늘 야구 처음 봐요?" },
  { id: "turtle", emoji: "🐢", label: "거북이 주루", text: "주루가 거북이네~" },
  { id: "sleepy", emoji: "🥱", label: "졸린 경기력", text: "벌써 졸린 경기력" },
  { id: "decline", emoji: "📉", label: "타율 하락 중", text: "타율 실시간 하락 중" },
  { id: "salt", emoji: "🧂", label: "소금 한 사발", text: "짠내 나는 경기력이네" },
  { id: "violin", emoji: "🎻", label: "슬픈 바이올린", text: "BGM 깔아드릴게요" },
] as const;

const previousPhrases = [
  { id: "first", text: "야구 처음 봐요?" },
  { id: "turtle", text: "주루가 거북이네~" },
  { id: "sleepy", text: "벌써 졸린 경기력" },
  { id: "next", text: "다음엔 맞히겠지^^" },
  { id: "wager", text: "그걸 왜 거기 걸어" },
] as const;

export type TauntCard = { id: string; emoji: string; label: string; text: string; image?: string; team?: Team };

function character(id: string, team: Team, label: string, text: string): TauntCard {
  return { id, team, label, text, emoji: "⚾", image: `/ipyagu/${id}.webp` };
}

export const teamTauntCards: Record<Team, readonly TauntCard[]> = {
  lg: [
    character("lg1", "lg", "메롱~", "메롱~ 그것도 못 쳐?"),
    character("lg2", "lg", "빵 터짐", "빵 터졌네ㅋㅋ"),
    character("lg3", "lg", "여유만만", "이 정도는 여유지~"),
    character("lg4", "lg", "눈물 닦아", "울지 마, 아직 5회야"),
    character("lg5", "lg", "부들부들", "부들부들 떨고 있니?"),
    character("lg6", "lg", "나이스!", "나이스~ 오늘은 우리가 이긴다"),
  ],
  doosan: [
    character("ds1", "doosan", "메롱~", "메롱~ 그것도 못 쳐?"),
    character("ds2", "doosan", "빵 터짐", "빵 터졌네ㅋㅋ"),
    character("ds3", "doosan", "여유만만", "이 정도는 여유지~"),
    character("ds4", "doosan", "눈물 닦아", "울지 마, 아직 5회야"),
    character("ds5", "doosan", "가즈아!", "가즈아~ 역전 간다"),
    character("ds6", "doosan", "헉!", "헉, 그걸 놓쳐?"),
  ],
};

export const tauntPhrases = [
  { id: "tease", text: "메롱~ 그것도 못 쳐?" },
  { id: "laugh", text: "빵 터졌네ㅋㅋ" },
  { id: "cry", text: "울지 마, 아직 5회야" },
  { id: "easy", text: "이 정도는 여유지~" },
  { id: "next", text: "다음엔 맞히겠지^^" },
] as const;

export function getTauntCard(id: string): TauntCard {
  return [...teamTauntCards.lg, ...teamTauntCards.doosan, ...tauntCards].find((entry) => entry.id === id)
    ?? { id, label: "도발 카드", emoji: "⚾", text: "도발 카드를 받았어요." };
}

export function getTauntText(cardId: string, phraseId: string): string {
  return [...tauntPhrases, ...previousPhrases].find((entry) => entry.id === phraseId)?.text ?? getTauntCard(cardId).text;
}

export type FanTaunt = {
  id: string;
  cardId: string;
  phraseId: string;
  senderNickname: string | null;
  recipientNickname: string | null;
  sentAt: string;
  readAt: string | null;
  replyTo: string | null;
};

export function tauntErrorMessage(error: unknown): string {
  const detail = error && typeof error === "object" && "details" in error ? error.details : null;
  switch (detail) {
    case "inactive_opponent": return "지금 활동 중인 상대 팬이 없어요. 잠시 후 다시 시도해 주세요.";
    case "cooldown": return "도발은 잠시 간격을 두고 보낼 수 있어요.";
    case "insufficient_points": return "포인트가 부족해요. 예측을 맞혀 100P를 모아요.";
    case "invalid_reply": return "이미 반격했거나 반격할 수 없는 카드예요.";
    case "invalid_selection": return "카드와 문구를 다시 선택해 주세요.";
    case "card_not_owned": return "상점에서 먼저 이 카드를 구매해 주세요.";
    case "request_conflict": return "이미 처리된 요청이에요. 다시 선택해 주세요.";
    default: return "카드를 보내지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}
