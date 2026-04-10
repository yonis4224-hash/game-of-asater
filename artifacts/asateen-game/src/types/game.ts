export interface Player {
  id: string;
  name: string;
  team: "teamA" | "teamB" | null;
  isReady: boolean;
  isCreator: boolean;
}

export interface RoomSettings {
  pointsPerCorrect: number;
  drawingPoints: number;
  weirdPoints: number;
  spyPoints: number;
  timeLimit: number;
}

export interface SportsQuestion {
  q: string;
  options: string[];
  correct: number;
}

export interface WeirdQuestion {
  q: string;
  correct: string;
}

export type GameScreen = "lobby" | "room" | "game";

export type Team = "teamA" | "teamB";
