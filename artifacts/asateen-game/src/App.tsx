import { useState, useEffect } from "react";
import LobbyPage from "@/pages/LobbyPage";
import RoomPage from "@/pages/RoomPage";
import GamePage from "@/pages/GamePage";
import type { Team, GameMode } from "@/types/game";
import { getSocket } from "@/lib/socket";

type Screen = "lobby" | "room" | "game";

interface TeamProfile {
  name: string;
  color: string;
}

interface GameState {
  roomCode: string;
  playerId: string;
  isCreator: boolean;
  myTeam: Team | null;
  teams: Record<Team, TeamProfile>;
  gameMode: GameMode;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState>({
    roomCode: "", playerId: "", isCreator: false, myTeam: null,
    gameMode: { type: "team", teamSize: 4 },
    teams: {
      teamA: { name: "\u0627\u0644\u0623\u0631\u0633\u0646\u0627\u0644", color: "#ef4444" },
      teamB: { name: "\u0645\u0627\u0646\u0633\u064a\u062a\u064a", color: "#3b82f6" },
    },
  });
  const [initialRoomCode, setInitialRoomCode] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      setInitialRoomCode(roomParam.toUpperCase());
    }
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
  }, []);

  const handleRoomCreated = (roomCode: string, playerId: string, isCreator: boolean) => {
    setGameState((s) => ({ ...s, roomCode, playerId, isCreator, myTeam: null }));
    setScreen("room");
  };

  const handleRoomJoined = (roomCode: string, playerId: string, isCreator: boolean) => {
    setGameState((s) => ({ ...s, roomCode, playerId, isCreator, myTeam: null }));
    setScreen("room");
  };

  const handleGameStart = () => {
    setScreen("game");
  };

  useEffect(() => {
    const socket = getSocket();
    socket.on("roomMeta", (meta: { gameMode: GameMode; teams: Record<Team, { name: string; color: string }> }) => {
      setGameState((s) => ({ ...s, teams: meta.teams, gameMode: meta.gameMode }));
    });
    socket.on("roomCreated", (data: { playerId: string }) => {
      setGameState((s) => ({ ...s, playerId: data.playerId }));
    });
    return () => { socket.off("roomMeta"); socket.off("roomCreated"); };
  }, []);

  const handleKicked = () => {
    getSocket().disconnect();
    setGameState((s) => ({ ...s, roomCode: "", playerId: "", isCreator: false, myTeam: null }));
    setScreen("lobby");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleGameOver = () => {
    setGameState((s) => ({ ...s, roomCode: "", playerId: "", isCreator: false, myTeam: null }));
    setScreen("lobby");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleNewCreator = () => {
    setGameState((s) => ({ ...s, isCreator: true }));
  };

  if (screen === "lobby") {
    return <LobbyPage onRoomCreated={handleRoomCreated} onRoomJoined={handleRoomJoined} initialRoomCode={initialRoomCode} />;
  }

  if (screen === "room") {
    return (
      <RoomPage
        roomCode={gameState.roomCode}
        playerId={gameState.playerId}
        isCreator={gameState.isCreator}
        onGameStart={handleGameStart}
        onKicked={handleKicked}
        onNewCreator={handleNewCreator}
      />
    );
  }

  if (screen === "game") {
    return (
      <GamePage
        roomCode={gameState.roomCode}
        myTeam={gameState.myTeam}
        teamProfiles={gameState.teams}
        onGameOver={handleGameOver}
        gameMode={gameState.gameMode}
      />
    );
  }

  return null;
}

export function BgParticles() {
  return <div className="bg-particles" />;
}
