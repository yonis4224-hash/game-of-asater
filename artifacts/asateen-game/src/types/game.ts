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
  codenamesBonus: number;
  guessTimeLimit: number;
  questionTimeLimit: number;
}

export interface GameMode {
  type: "team" | "1v1";
  teamSize: number;
}

export interface TriviaQuestion {
  q: string;
  correct: string;
}

export type GameScreen = "lobby" | "room" | "game";

export type Team = "teamA" | "teamB";

export interface CodenamesGridData {
  grid: string[][];
  cardMap: Record<string, "teamA" | "teamB" | "neutral" | "assassin">;
  revealed: { row: number; col: number }[];
  teamACards: { row: number; col: number }[];
  teamBCards: { row: number; col: number }[];
  canClue: boolean;
  clue: string | null;
  isClueGiver: boolean;
  isFieldAgent: boolean;
  teamsCards: { teamA: number; teamB: number };
}
