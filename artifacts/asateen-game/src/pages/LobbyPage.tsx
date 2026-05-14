import { useState } from "react";
import { motion } from "framer-motion";
import { getSocket, emitWhenConnected } from "@/lib/socket";
import type { RoomSettings } from "@/types/game";

interface LobbyPageProps {
  onRoomCreated: (roomCode: string, playerId: string, isCreator: boolean) => void;
  onRoomJoined: (roomCode: string, playerId: string, isCreator: boolean) => void;
  initialRoomCode?: string;
}

export default function LobbyPage({ onRoomCreated, onRoomJoined, initialRoomCode = "" }: LobbyPageProps) {
  const [mode, setMode] = useState<"none" | "create" | "join">(initialRoomCode ? "join" : "none");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const defaultSettings: RoomSettings = {
    pointsPerCorrect: 10,
    drawingPoints: 20,
    weirdPoints: 2,
    spyPoints: 30,
    timeLimit: 30,
  };

  const handleCreate = () => {
    if (!playerName.trim()) { setError("الرجاء إدخال اسمك"); return; }
    setLoading(true);
    setError("");
    const socket = getSocket();
    socket.once("roomCreated", (data: { roomCode: string; playerId: string; isCreator: boolean }) => {
      setLoading(false);
      onRoomCreated(data.roomCode, data.playerId, data.isCreator);
    });
    socket.once("error", (msg: string) => {
      setLoading(false);
      setError(msg);
    });
    emitWhenConnected("createRoom", { playerName: playerName.trim(), settings: defaultSettings });
  };

  const handleJoin = () => {
    if (!playerName.trim() || !roomCode.trim()) { setError("الرجاء إدخال اسمك ورمز الغرفة"); return; }
    setLoading(true);
    setError("");
    const socket = getSocket();
    const doJoin = () => {
      socket.emit("checkRoom", roomCode.trim().toUpperCase(), (res: { exists: boolean; playerCount: number }) => {
        if (!res.exists) { setLoading(false); setError("الغرفة غير موجودة"); return; }
        if (res.playerCount >= 4) { setLoading(false); setError("الغرفة ممتلئة"); return; }
        socket.once("roomJoined", (data: { roomCode: string; playerId: string; isCreator: boolean }) => {
          setLoading(false);
          onRoomJoined(data.roomCode, data.playerId, data.isCreator);
        });
        socket.once("error", (msg: string) => { setLoading(false); setError(msg); });
        socket.emit("joinRoom", { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim() });
      });
    };
    if (socket.connected) {
      doJoin();
    } else {
      socket.once("connect", doJoin);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.h1
            className="mb-2 font-bold text-[39px]"
            style={{ background: "linear-gradient(45deg, #FFD700, #FF8C00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            animate={{ textShadow: ["0 0 10px rgba(255,215,0,0.5)", "0 0 30px rgba(255,215,0,0.9)", "0 0 10px rgba(255,215,0,0.5)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            الأساطير
          </motion.h1>
          <p className="text-white/60 text-lg">لعبة العباقرة</p>
        </div>

        <div className="rounded-3xl p-8 backdrop-blur-md" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,215,0,0.3)" }}>
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => { setMode("create"); setError(""); }}
              className="flex-1 py-3 rounded-2xl font-bold text-white transition-all"
              style={{ background: mode === "create" ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "rgba(255,255,255,0.1)", color: mode === "create" ? "#000" : "#fff" }}
            >
              إنشاء غرفة
            </button>
            <button
              onClick={() => { setMode("join"); setError(""); }}
              className="flex-1 py-3 rounded-2xl font-bold transition-all"
              style={{ background: mode === "join" ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "rgba(255,255,255,0.1)", color: mode === "join" ? "#000" : "#fff" }}
            >
              انضمام
            </button>
          </div>

          {mode !== "none" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <input
                className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none focus:ring-2"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                placeholder="اسمك"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") mode === "create" ? handleCreate() : handleJoin(); }}
                dir="rtl"
              />
              {mode === "join" && (
                <input
                  className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none uppercase"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="رمز الغرفة"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                  dir="rtl"
                  maxLength={6}
                />
              )}
              {error && <p className="text-red-400 text-center text-sm">{error}</p>}
              <button
                onClick={mode === "create" ? handleCreate : handleJoin}
                disabled={loading}
                className="w-full py-4 rounded-2xl font-bold text-black text-lg transition-all active:scale-95 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}
              >
                {loading ? "جارٍ التحميل..." : mode === "create" ? "إنشاء الغرفة" : "انضمام"}
              </button>
            </motion.div>
          )}

          {mode === "none" && (
            <div className="text-center text-white/40 text-sm py-4">
              اختر إنشاء غرفة جديدة أو انضم إلى غرفة موجودة
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-6 text-white/40 text-sm">
          <span>الجولة 1: أسئلة رياضية</span>
          <span>الجولة 2: رسم وتخمين</span>
          <span>الجولة 3: ألغاز</span>
          <span>الجولة 4: كود سري</span>
        </div>
      </motion.div>
    </div>
  );
}
