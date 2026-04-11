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

export interface Room {
  id: string;
  creatorId: string;
  players: Player[];
  currentRound: number;
  teamAScore: number;
  teamBScore: number;
  gameMode: "2v2" | "1v1";
  roundData: RoundData | null;
  settings: RoomSettings;
}

export type RoundData = Round1Data | Round2Data | Round3Data | Round4Data;

export interface Round1Data {
  type: "round1";
  questions: SportsQuestion[];
  currentIndex: number;
  answers: { teamA: boolean | null; teamB: boolean | null };
  scores: { teamA: number; teamB: number };
}

export interface Round2Data {
  type: "round2";
  word: string;
  drawings: { teamA: string | null; teamB: string | null };
  guesses: { teamA: boolean | null; teamB: boolean | null };
  wordLength: number;
}

export interface Round3Data {
  type: "round3";
  questions: WeirdQuestion[];
  currentIndex: number;
  answers: { teamA: string | null; teamB: string | null };
  scores: { teamA: number; teamB: number };
  currentOptions: string[];
}

export interface Round4Data {
  type: "round4";
  word: string;
  clues: string[];
  spyClues: { teamA: string | null; teamB: string | null };
  guesses: { teamA: boolean | null; teamB: boolean | null };
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
