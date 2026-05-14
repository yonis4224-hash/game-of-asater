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
  guessTimeLimit: number;
}

export interface Room {
  id: string;
  creatorId: string;
  players: Player[];
  currentRound: number;
  teamAScore: number;
  teamBScore: number;
  gameMode: "4v4" | "1v1";
  gameStarted: boolean;
  roundData: RoundData | null;
  settings: RoomSettings;
  teams: Record<Team, TeamProfile>;
}

export type RoundData = Round1Data | Round2Data | Round3Data | Round4Data;

/** Round 1: Football trivia — all players write their own answer, then everyone picks from all answers + correct */
export interface Round1Data {
  type: "round1";
  questions: TriviaQuestion[];
  currentIndex: number;
  // Phase 1: each player writes their own answer
  playerAnswers: Record<string, string | null>;
  // Phase 2: shuffled options = all unique player answers + correct answer
  options: string[];
  // Phase 3: each player picks an option index
  playerChoices: Record<string, number | null>;
  scores: { teamA: number; teamB: number };
}

/** Round 2: Drawing — drawer draws, guesser guesses with 15s timer */
export interface Round2Data {
  type: "round2";
  word: string;
  drawings: { teamA: string | null; teamB: string | null };
  guesses: { teamA: boolean | null; teamB: boolean | null };
  wordLength: number;
}

/** Round 3: Movies/Games/Geography trivia — same system as Round 1 */
export interface Round3Data {
  type: "round3";
  questions: TriviaQuestion[];
  currentIndex: number;
  playerAnswers: Record<string, string | null>;
  options: string[];
  playerChoices: Record<string, number | null>;
  scores: { teamA: number; teamB: number };
}

/** Round 4: Codenames (Spy Master) — clue giver gives hint, guesser guesses */
export interface Round4Data {
  type: "round4";
  word: string;
  clues: string[];
  spyClues: { teamA: string | null; teamB: string | null };
  guesses: { teamA: boolean | null; teamB: boolean | null };
}

export interface TriviaQuestion {
  q: string;
  correct: string;
}
