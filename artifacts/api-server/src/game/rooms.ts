import type { Room, RoomSettings } from "./types";

const rooms = new Map<string, Room>();

const defaultSettings: RoomSettings = {
  pointsPerCorrect: 10,
  drawingPoints: 20,
  weirdPoints: 2,
  spyPoints: 30,
  timeLimit: 30,
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
