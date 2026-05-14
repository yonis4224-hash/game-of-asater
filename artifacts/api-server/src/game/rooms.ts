import type { Room, RoomSettings } from "./types";

const rooms = new Map<string, Room>();

const defaultSettings: RoomSettings = {
  pointsPerCorrect: 10,
  drawingPoints: 20,
  triviaPoints: 10,
  spyPoints: 30,
  guessTimeLimit: 15,
};

export function createRoom(
  roomCode: string,
  creatorId: string,
  creatorName: string,
  settings?: Partial<RoomSettings>
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
    gameMode: "2v2",
    gameStarted: false,
    teams: {
      teamA: { name: "\u0641\u0631\u064a\u0642 \u0627\u0644\u0646\u0648\u0631", color: "#22c55e" },
      teamB: { name: "\u0641\u0631\u064a\u0642 \u0627\u0644\u0638\u0644\u0627\u0645", color: "#f97316" },
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
