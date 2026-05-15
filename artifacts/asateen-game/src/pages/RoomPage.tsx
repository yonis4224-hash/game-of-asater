import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSocket } from "@/lib/socket";
import type { Player, RoomSettings, Team, GameMode } from "@/types/game";

interface RoomPageProps {
  roomCode: string;
  playerId: string;
  isCreator: boolean;
  onGameStart: () => void;
  onKicked: () => void;
  onNewCreator: () => void;
}

interface TeamProfile {
  name: string;
  color: string;
}

const TEAM_SIZES = [2, 3, 4, 5];

export default function RoomPage({ roomCode, playerId, isCreator: initialIsCreator, onGameStart, onKicked, onNewCreator }: RoomPageProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<RoomSettings>({
    pointsPerCorrect: 10, drawingPoints: 20, triviaPoints: 10, spyPoints: 30,
    codenamesBonus: 10, guessTimeLimit: 15, questionTimeLimit: 20,
  });
  const [isCreator, setIsCreator] = useState(initialIsCreator);
  const [gameMode, setGameMode] = useState<GameMode>({ type: "team", teamSize: 4 });
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [systemMsg, setSystemMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [teamProfiles, setTeamProfiles] = useState<Record<Team, TeamProfile>>({
    teamA: { name: "\u0627\u0644\u0623\u0631\u0633\u0646\u0627\u0644", color: "#ef4444" },
    teamB: { name: "\u0645\u0627\u0646\u0633\u064a\u062a\u064a", color: "#3b82f6" },
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("playersUpdate", (p: Player[]) => {
      setPlayers(p);
      const me = p.find((x) => x.id === playerId);
      if (me) setMyTeam(me.team);
    });
    socket.on("roomSettings", (s: RoomSettings) => setSettings(s));
    socket.on("gameModeChanged", (mode: GameMode) => setGameMode(mode));
    socket.on("roomMeta", (meta: { gameMode: GameMode; settings: RoomSettings; teams: Record<Team, TeamProfile> }) => {
      setGameMode(meta.gameMode);
      setTeamProfiles(meta.teams);
    });
    socket.on("systemMessage", (msg: string) => {
      setSystemMsg(msg);
      setTimeout(() => setSystemMsg(""), 3000);
    });
    socket.on("gameStarted", () => onGameStart());
    socket.on("kicked", () => onKicked());
    socket.on("newCreator", (newId: string) => {
      if (newId === playerId) {
        setIsCreator(true);
        onNewCreator();
      }
    });

    return () => {
      socket.off("playersUpdate");
      socket.off("roomSettings");
      socket.off("gameModeChanged");
      socket.off("roomMeta");
      socket.off("systemMessage");
      socket.off("gameStarted");
      socket.off("kicked");
      socket.off("newCreator");
    };
  }, [playerId, onGameStart, onKicked, onNewCreator]);

  const handleKick = (id: string) => {
    if (confirm("هل تريد طرد هذا اللاعب؟")) {
      getSocket().emit("kickPlayer", { roomCode, playerId: id });
    }
  };

  const handleSwitchTeam = (id: string, team: Team) => {
    getSocket().emit("switchTeam", { roomCode, playerId: id, newTeam: team });
  };

  const handleChooseTeam = (team: Team) => {
    setMyTeam(team);
    getSocket().emit("chooseTeam", { roomCode, team });
  };

  const handleReady = () => {
    setIsReady(true);
    getSocket().emit("playerReady", { roomCode });
  };

  const handleSaveSettings = () => {
    getSocket().emit("updateSettings", { roomCode, settings });
  };

  const handleForceStart = () => {
    getSocket().emit("forceStartGame", { roomCode });
  };

  const handleGameModeChange = (type: "team" | "1v1", teamSize?: number) => {
    const mode: GameMode = type === "1v1" ? { type: "1v1", teamSize: 1 } : { type: "team", teamSize: teamSize ?? 4 };
    setGameMode(mode);
    getSocket().emit("changeGameMode", { roomCode, mode });
  };

  const handleCopyLink = () => {
    const base = window.location.origin + (window.location.pathname !== "/" ? window.location.pathname : "");
    const url = `${base}?room=${roomCode}`;
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = roomCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const teamAPlayers = players.filter((p) => p.team === "teamA");
  const teamBPlayers = players.filter((p) => p.team === "teamB");
  const noTeamPlayers = players.filter((p) => !p.team);
  const playersNeeded = gameMode.type === "1v1" ? 2 : gameMode.teamSize * 2;
  const readyCount = players.filter((p) => p.isReady).length;
  const allReady = players.length >= playersNeeded && players.every((p) => p.isReady);

  const modeLabel = gameMode.type === "1v1" ? "1 ضد 1" : `${gameMode.teamSize} ضد ${gameMode.teamSize}`;

  return (
    <><div className="bg-particles" /><div className="min-h-screen p-4" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,215,0,0.3)" }}>
          <div className="absolute inset-0 opacity-5" style={{ background: "radial-gradient(circle at 50% 0%, #FFD700 0%, transparent 70%)" }} />
          <div className="relative z-10">
            <div className="mb-4">
              <p className="text-white/60 text-sm text-center mb-1">كود الغرفة — شاركه مع أصدقائك</p>
              <div className="flex items-center justify-center gap-3 mb-3">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-mono text-3xl font-bold tracking-widest transition-all active:scale-95"
                  style={{ background: "rgba(255,215,0,0.15)", border: "2px solid rgba(255,215,0,0.7)", color: "#FFD700", letterSpacing: "0.2em" }}
                  title="انقر للنسخ"
                >
                  {roomCode}
                  <span className="text-base font-normal" style={{ color: "rgba(255,215,0,0.6)" }}>
                    {copied ? "✓" : "📋"}
                  </span>
                </button>
              </div>
              <div className="flex gap-2 justify-center">
                <button onClick={handleCopyLink} className="px-4 py-2 rounded-xl text-sm text-white transition-all active:scale-95"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  {copied ? "✓ تم النسخ!" : "🔗 نسخ الرابط"}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {systemMsg && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mb-4 p-3 rounded-xl text-center text-white text-sm"
                  style={{ background: "rgba(0,0,0,0.7)", borderRight: "3px solid #FFD700" }}>
                  {systemMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-2xl p-3" style={{ background: `${teamProfiles.teamA.color}20`, border: `1px solid ${teamProfiles.teamA.color}66` }}>
                <h3 className="font-bold mb-2 text-center" style={{ color: teamProfiles.teamA.color }}>{teamProfiles.teamA.name} ({teamAPlayers.length}/{gameMode.teamSize})</h3>
                {teamAPlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-black/20 rounded-xl p-2 mb-1">
                    <span className="text-white text-sm">{p.isCreator ? "👑 " : ""}{p.name}</span>
                    <div className="flex gap-1 items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.isReady ? "bg-green-500" : "bg-orange-500"} text-white`}>
                        {p.isReady ? "جاهز" : "غير جاهز"}
                      </span>
                      {isCreator && p.id !== playerId && (
                        <>
                          <button onClick={() => handleSwitchTeam(p.id, "teamB")} className="text-xs text-orange-400 hover:text-orange-300">نقل</button>
                          <button onClick={() => handleKick(p.id)} className="text-xs text-red-400 hover:text-red-300">طرد</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {Array.from({ length: gameMode.teamSize - teamAPlayers.length }).map((_, i) => (
                  <div key={`empty-a-${i}`} className="flex items-center justify-center bg-black/10 rounded-xl p-2 mb-1 border border-dashed border-white/10">
                    <span className="text-white/20 text-sm">—</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-3" style={{ background: `${teamProfiles.teamB.color}20`, border: `1px solid ${teamProfiles.teamB.color}66` }}>
                <h3 className="font-bold mb-2 text-center" style={{ color: teamProfiles.teamB.color }}>{teamProfiles.teamB.name} ({teamBPlayers.length}/{gameMode.teamSize})</h3>
                {teamBPlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-black/20 rounded-xl p-2 mb-1">
                    <span className="text-white text-sm">{p.isCreator ? "👑 " : ""}{p.name}</span>
                    <div className="flex gap-1 items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.isReady ? "bg-green-500" : "bg-orange-500"} text-white`}>
                        {p.isReady ? "جاهز" : "غير جاهز"}
                      </span>
                      {isCreator && p.id !== playerId && (
                        <>
                          <button onClick={() => handleSwitchTeam(p.id, "teamA")} className="text-xs text-green-400 hover:text-green-300">نقل</button>
                          <button onClick={() => handleKick(p.id)} className="text-xs text-red-400 hover:text-red-300">طرد</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {Array.from({ length: gameMode.teamSize - teamBPlayers.length }).map((_, i) => (
                  <div key={`empty-b-${i}`} className="flex items-center justify-center bg-black/10 rounded-xl p-2 mb-1 border border-dashed border-white/10">
                    <span className="text-white/20 text-sm">—</span>
                  </div>
                ))}
              </div>
            </div>

            {noTeamPlayers.length > 0 && (
              <div className="mb-4">
                <h3 className="text-white/60 text-sm mb-2 text-center">بدون فريق</h3>
                <div className="space-y-1">
                  {noTeamPlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-xl p-2">
                      <span className="text-white text-sm">{p.isCreator ? "👑 " : ""}{p.name}</span>
                      {isCreator && p.id !== playerId && (
                        <div className="flex gap-2">
                          <button onClick={() => handleSwitchTeam(p.id, "teamA")} className="text-xs text-green-400">نقل ل{teamProfiles.teamA.name}</button>
                          <button onClick={() => handleSwitchTeam(p.id, "teamB")} className="text-xs text-orange-400">نقل ل{teamProfiles.teamB.name}</button>
                          <button onClick={() => handleKick(p.id)} className="text-xs text-red-400">طرد</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <button
                onClick={() => handleChooseTeam("teamA")}
                className="flex-1 py-3 rounded-2xl font-bold transition-all"
                style={{ background: myTeam === "teamA" ? teamProfiles.teamA.color : "rgba(255,255,255,0.1)", color: "white" }}
              >
                {teamProfiles.teamA.name}
              </button>
              <button
                onClick={() => handleChooseTeam("teamB")}
                className="flex-1 py-3 rounded-2xl font-bold transition-all"
                style={{ background: myTeam === "teamB" ? teamProfiles.teamB.color : "rgba(255,255,255,0.1)", color: "white" }}
              >
                {teamProfiles.teamB.name}
              </button>
            </div>

            {!isReady && (
              <button
                onClick={handleReady}
                className="w-full py-4 rounded-2xl font-bold text-white text-lg mb-3"
                style={{ background: "linear-gradient(135deg, #4CAF50, #45a049)" }}
              >
                جاهز
              </button>
            )}

            {isReady && (
              <div className="w-full py-4 rounded-2xl text-center text-white/60 bg-white/5 mb-3">
                {allReady ? "🎮 الجميع جاهز! سيبدأ قريباً..." : "في انتظار بقية اللاعبين..."}
              </div>
            )}

            {isCreator && (
              <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
                <h3 className="text-yellow-400 font-bold mb-3">إعدادات المدير</h3>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-white/60 text-xs block mb-1">اسم الفريق الأول</label>
                    <input value={teamProfiles.teamA.name}
                      onChange={(e) => {
                        const name = e.target.value.trim() || teamProfiles.teamA.name;
                        setTeamProfiles((prev) => ({ ...prev, teamA: { ...prev.teamA, name } }));
                        getSocket().emit("updateTeamProfile", { roomCode, team: "teamA", profile: { name, color: teamProfiles.teamA.color } });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-white text-sm outline-none text-right"
                      style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${teamProfiles.teamA.color}66` }}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs block mb-1">اسم الفريق الثاني</label>
                    <input value={teamProfiles.teamB.name}
                      onChange={(e) => {
                        const name = e.target.value.trim() || teamProfiles.teamB.name;
                        setTeamProfiles((prev) => ({ ...prev, teamB: { ...prev.teamB, name } }));
                        getSocket().emit("updateTeamProfile", { roomCode, team: "teamB", profile: { name, color: teamProfiles.teamB.color } });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-white text-sm outline-none text-right"
                      style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${teamProfiles.teamB.color}66` }}
                      dir="rtl"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-white/70 text-sm block mb-1">وضع اللعبة</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button onClick={() => handleGameModeChange("1v1")}
                      className="flex-1 py-2 rounded-xl text-sm font-bold min-w-[80px]"
                      style={{ background: gameMode.type === "1v1" ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "rgba(255,255,255,0.1)", color: gameMode.type === "1v1" ? "#000" : "#fff" }}>
                      1 ضد 1
                    </button>
                    {TEAM_SIZES.map((size) => (
                      <button key={size} onClick={() => handleGameModeChange("team", size)}
                        className="flex-1 py-2 rounded-xl text-sm font-bold min-w-[60px]"
                        style={{ background: gameMode.type === "team" && gameMode.teamSize === size ? "linear-gradient(135deg, #FFD700, #FF8C00)" : "rgba(255,255,255,0.1)", color: gameMode.type === "team" && gameMode.teamSize === size ? "#000" : "#fff" }}>
                        {size} ضد {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  {([
                    { key: "pointsPerCorrect", label: "نقاط الجولة 1" },
                    { key: "drawingPoints", label: "نقاط الجولة 2" },
                    { key: "triviaPoints", label: "نقاط الجولة 3" },
                    { key: "codenamesBonus", label: "نقاط كود نيمز" },
                    { key: "guessTimeLimit", label: "وقت التخمين (ث)" },
                    { key: "questionTimeLimit", label: "وقت الأسئلة (ث)" },
                  ] as const).map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-white/60 text-xs block mb-1">{label}</label>
                      <input type="number" value={settings[key] ?? 0}
                        onChange={(e) => setSettings((s) => ({ ...s, [key]: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 rounded-xl text-white text-center text-sm"
                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.3)" }}
                        min={1} max={100} />
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button onClick={handleSaveSettings} className="flex-1 py-3 rounded-2xl text-white font-bold"
                    style={{ background: "rgba(255,255,255,0.15)" }}>
                    حفظ الإعدادات
                  </button>
                  <button onClick={handleForceStart} className="flex-1 py-3 rounded-2xl text-black font-bold"
                    style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>
                    بدء اللعبة
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div></>
  );
}
