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
  triviaPoints: number;
  spyPoints: number;
  guessTimeLimit: number;
  questionTimeLimit?: number;
}

export type GameMode = "4v4" | "1v1";

export interface TriviaQuestion {
  q: string;
  correct: string;
}

export type GameScreen = "lobby" | "room" | "game";

export type Team = "teamA" | "teamB";
