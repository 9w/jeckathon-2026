export type ReplayPitch = {
  time: string | null;
  pitcher: string;
  outcome: "ball" | "strike" | "foul" | "in-play";
  balls: number;
  strikes: number;
};

export type ScoreboardEvent = {
  time: string;
  inning: number;
  half: "top" | "bottom";
  outs: number;
  away: number;
  home: number;
};

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
  pitches?: ReplayPitch[];
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
  scoreboard?: ScoreboardEvent[];
};
