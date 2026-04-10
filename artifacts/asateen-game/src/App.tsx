import { useState, useEffect } from "react";
import LobbyPage from "@/pages/LobbyPage";
import RoomPage from "@/pages/RoomPage";
import GamePage from "@/pages/GamePage";
import type { Team } from "@/types/game";
import { getSocket } from "@/lib/socket";

type Screen = "lobby" | "room" | "game";

interface GameState {
  roomCode: string;
  playerId: string;
  isCreator: boolean;
  myTeam: Team | null;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState>({ roomCode: "", playerId: "", isCreator: false, myTeam: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) {
      setScreen("lobby");
    }
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    // Pre-connect socket eagerly so it's ready when the user clicks
    getSocket();
  }, []);

  const handleRoomCreated = (roomCode: string, playerId: string, isCreator: boolean) => {
    setGameState({ roomCode, playerId, isCreator, myTeam: null });
    setScreen("room");
  };

  const handleRoomJoined = (roomCode: string, playerId: string, isCreator: boolean) => {
    setGameState({ roomCode, playerId, isCreator, myTeam: null });
    setScreen("room");
  };

  const handleGameStart = () => {
    setScreen("game");
  };

  const handleKicked = () => {
    getSocket().disconnect();
    setGameState({ roomCode: "", playerId: "", isCreator: false, myTeam: null });
    setScreen("lobby");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleGameOver = () => {
    setGameState({ roomCode: "", playerId: "", isCreator: false, myTeam: null });
    setScreen("lobby");
    window.history.replaceState({}, "", window.location.pathname);
  };

  const handleNewCreator = () => {
    setGameState((s) => ({ ...s, isCreator: true }));
  };

  if (screen === "lobby") {
    return <LobbyPage onRoomCreated={handleRoomCreated} onRoomJoined={handleRoomJoined} />;
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
        onGameOver={handleGameOver}
      />
    );
  }

  return null;
}
