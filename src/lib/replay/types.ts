export type PlateAppearance = {
  id: string;
  inning: number;
  half: "top" | "bottom";
  batter: string;
  result: string;
  choice: "safe" | "out" | null;
  pitchCount: number;
  firstPitchTime: string | null;
};

export type ReplayGame = {
  gameId: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  sourceUrl: string;
  appearances: PlateAppearance[];
};
