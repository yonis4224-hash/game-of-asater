
  isCreator: boolean;
}

export type Team = "teamA" | "teamB";

export interface TeamProfile {
  name: string;
  color: string;
}

export interface RoomSettings {
  pointsPerCorrect: number;
  drawingPoints: number;
  teamAScore: number;
  teamBScore: number;
  gameMode: "2v2" | "1v1";
  gameStarted: boolean;
  teams: Record<Team, TeamProfile>;
  roundData: RoundData | null;
  settings: RoomSettings;
}