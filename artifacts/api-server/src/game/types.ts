export type Team = "teamA" | "teamB";

export interface TeamProfile {
  name: string;
  color: string;
}

export interface Player {
  id: string;
  name: string;
  team: Team | null;
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

export interface Room {
  id: string;
  creatorId: string;
  players: Player[];
  currentRound: number;
  teamAScore: number;
  teamBScore: number;
  gameMode: GameMode;
  gameStarted: boolean;
  roundData: RoundData | null;
  settings: RoomSettings;
  teams: Record<Team, TeamProfile>;
}

export type RoundData = Round1Data | Round2Data | Round3Data | Round4Data;

/** Round 1: Football trivia */
export interface Round1Data {
  type: "round1";
  questions: TriviaQuestion[];
  currentIndex: number;
  playerAnswers: Record<string, string | null>;
  options: string[];
  playerChoices: Record<string, number | null>;
  scores: { teamA: number; teamB: number };
}

/** Round 2: Drawing */
export interface Round2Data {
  type: "round2";
  word: string;
  drawings: { teamA: string | null; teamB: string | null };
  guesses: { teamA: boolean | null; teamB: boolean | null };
  wordLength: number;
}

/** Round 3: General trivia */
export interface Round3Data {
  type: "round3";
  questions: TriviaQuestion[];
  currentIndex: number;
  playerAnswers: Record<string, string | null>;
  options: string[];
  playerChoices: Record<string, number | null>;
  scores: { teamA: number; teamB: number };
}

/** Round 4: Full Codenames (5x5 grid) */
export interface Round4Data {
  type: "round4";
  grid: string[][];
  teamACards: { row: number; col: number }[];
  teamBCards: { row: number; col: number }[];
  neutralCards: { row: number; col: number }[];
  assassinCard: { row: number; col: number };
  revealed: { row: number; col: number }[];
  clueGivers: Record<Team, string | null>;
  clues: Record<Team, string | null>;
  guessedTeam: Record<Team, boolean>;
  currentTurn: Team | null;
  isSolo: boolean;
  teamAscores: number;
  teamBscores: number;
  totalCardsA: number;
  totalCardsB: number;
}

export interface TriviaQuestion {
  q: string;
  correct: string;
}
