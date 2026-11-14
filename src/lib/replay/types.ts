export type PlateAppearance = {
  id: string;
  inning: number;
  half: "top" | "bottom";
  batter: string;
  result: string;
  choice: "safe" | "out" | null;
  pitchCount: number;
  firstPitchTime: string | null;
  resultTime: string | null;
};

export type ReplayGame = {
  gameId: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  sourceUrl: string;
  startedAt: string;
  endedAt: string;
  appearances: PlateAppearance[];
};
