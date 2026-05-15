import type { GameMode, Room, RoomSettings } from "./types";

const rooms = new Map<string, Room>();

const defaultSettings: RoomSettings = {
  pointsPerCorrect: 10,
  drawingPoints: 20,
  triviaPoints: 10,
  spyPoints: 30,
  codenamesBonus: 10,
  guessTimeLimit: 15,
  questionTimeLimit: 20,
};

export function createRoom(
  roomCode: string,
  creatorId: string,
  creatorName: string,
  settings?: Partial<RoomSettings>,
): Room {
  const room: Room = {
    id: roomCode,
    creatorId,
    players: [
      {
        id: creatorId,
        name: creatorName,
        team: null,
        isReady: false,
        isCreator: true,
      },
    ],
    currentRound: 1,
    teamAScore: 0,
    teamBScore: 0,
    gameMode: { type: "team", teamSize: 4 },
    gameStarted: false,
    teams: {
      teamA: {
        name: "\u0627\u0644\u0623\u0631\u0633\u0646\u0627\u0644",
        color: "#ef4444",
      },
      teamB: {
        name: "\u0645\u0627\u0646\u0633\u064a\u062a\u064a",
        color: "#3b82f6",
      },
    },
    roundData: null,
    settings: { ...defaultSettings, ...(settings ?? {}) },
  };
  rooms.set(roomCode, room);
  return room;
}

export function getRoom(roomCode: string): Room | undefined {
  return rooms.get(roomCode);
}

export function deleteRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
