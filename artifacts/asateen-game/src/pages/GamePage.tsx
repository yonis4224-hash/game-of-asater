import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSocket } from "@/lib/socket";
import type { TriviaQuestion, Team, GameMode, CodenamesGridData } from "@/types/game";

interface TeamProfile {
  name: string;
  color: string;
}

interface GamePageProps {
  roomCode: string;
  myTeam: Team | null;
  teamProfiles: Record<Team, TeamProfile>;
  onGameOver: () => void;
  gameMode?: GameMode;
}

type GamePhase =
  | { type: "waiting" }
  | { type: "round_intro"; round: number }
  | { type: "write_answer"; question: TriviaQuestion; qNum: number; total: number; submitted: boolean }
  | { type: "choose_option"; question: TriviaQuestion; options: string[]; qNum: number; total: number; answered: boolean }
  | { type: "drawing"; word: string; wordLength: number; submitted: boolean }
  | { type: "guess_drawing"; drawingA: string; drawingB: string; wordLength: number; guessed: boolean; timeLeft: number }
  | { type: "spy_master"; word: string; clues: string[]; submitted: boolean }
  | { type: "spy_guess"; clueA: string; clueB: string; guessed: boolean }
  | { type: "codenames"; gridData: CodenamesGridData; phase: "clue" | "pick" | "waiting" }
  | { type: "round_end"; round: number; scores: { teamA: number; teamB: number }; totalScores: { teamA: number; teamB: number } }
  | { type: "game_end"; finalScores: { teamA: number; teamB: number }; winner: string };

const ROUND_NAMES: Record<number, string> = {
  1: "الجولة 1: أسئلة كروية",
  2: "الجولة 2: رسم وتخمين",
  3: "الجولة 3: ألعاب وأفلام وجغرافيا",
  4: "الجولة 4: كود نيمز",
};

const ROUND_ICONS = ["⚽", "🎨", "🎬", "🕵️"];

export default function GamePage({ roomCode, myTeam, teamProfiles, onGameOver }: GamePageProps) {
  const [phase, setPhase] = useState<GamePhase>({ type: "waiting" });
  const [currentRound, setCurrentRound] = useState(1);
  const [scores, setScores] = useState({ teamA: 0, teamB: 0 });
  const [toast, setToast] = useState("");
  const [guessText, setGuessText] = useState("");
  const [clueText, setClueText] = useState("");
  const [clueNumber, setClueNumber] = useState(1);
  const [answerText, setAnswerText] = useState("");
  const [cnTurn, setCnTurn] = useState<Team | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef({ active: false, lastX: 0, lastY: 0 });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    socket.on("roundLoaded", (data: { round: number; scores: { teamA: number; teamB: number } }) => {
      setCurrentRound(data.round);
      setScores(data.scores);
      setPhase({ type: "round_intro", round: data.round });
      setTimeout(() => setPhase((p) => p.type === "round_intro" ? { type: "waiting" } : p), 2200);
    });

    // Round 1
    socket.on("showQuestion", (data: { question: TriviaQuestion; questionNumber: number; totalQuestions: number; phase: string }) => {
      setAnswerText("");
      setPhase({ type: "write_answer", question: data.question, qNum: data.questionNumber, total: data.totalQuestions, submitted: false });
    });

    socket.on("showRound1Options", (data: { question: TriviaQuestion; options: string[]; questionNumber: number; totalQuestions: number }) => {
      setPhase({ type: "choose_option", question: data.question, options: data.options, qNum: data.questionNumber, total: data.totalQuestions, answered: false });
    });

    socket.on("round1ChoiceResult", (data: { playerName: string; team: Team | null; isCorrect: boolean }) => {
      showToast(`${data.playerName} ${data.isCorrect ? "✓ صحيح!" : "✗ خطأ"}`);
    });

    // Round 2
    socket.on("startDrawing", (data: { word: string; wordLength: number }) => {
      setPhase({ type: "drawing", word: data.word, wordLength: data.wordLength, submitted: false });
    });

    socket.on("drawingSubmitted", (data: { team: Team }) => {
      showToast(`${data.team === "teamA" ? teamProfiles.teamA.name : teamProfiles.teamB.name} أرسل رسمته`);
    });

    socket.on("showGuesses", (data: { drawingA: string; drawingB: string; wordLength: number }) => {
      setGuessText("");
      setPhase({ type: "guess_drawing", drawingA: data.drawingA, drawingB: data.drawingB, wordLength: data.wordLength, guessed: false, timeLeft: 15 });
    });

    socket.on("guessResult", (data: { team: Team; isCorrect: boolean; correctWord: string }) => {
      showToast(data.isCorrect ? `${data.team === "teamA" ? teamProfiles.teamA.name : teamProfiles.teamB.name} خمّن صحيح!` : `خطأ! الكلمة: ${data.correctWord}`);
    });

    // Round 3
    socket.on("showQuestionRound3", (data: { question: TriviaQuestion; questionNumber: number; totalQuestions: number; phase: string }) => {
      setAnswerText("");
      setPhase({ type: "write_answer", question: data.question, qNum: data.questionNumber, total: data.totalQuestions, submitted: false });
    });

    socket.on("showRound3Options", (data: { question: TriviaQuestion; options: string[]; questionNumber: number; totalQuestions: number }) => {
      setPhase({ type: "choose_option", question: data.question, options: data.options, qNum: data.questionNumber, total: data.totalQuestions, answered: false });
    });

    socket.on("round3ChoiceResult", (data: { playerName: string; team: Team | null; isCorrect: boolean }) => {
      showToast(`${data.playerName} ${data.isCorrect ? "✓ صحيح!" : "✗ خطأ"}`);
    });

    // Round 4: Codenames
    socket.on("startCodenamesGrid", (data: CodenamesGridData) => {
      setClueText("");
      setClueNumber(1);
      setPhase({
        type: "codenames",
        gridData: data,
        phase: data.canClue ? "clue" : "waiting",
      });
    });

    socket.on("codenamesClue", (data: { team: Team; clue: string }) => {
      showToast(`تلميح من ${data.team === "teamA" ? teamProfiles.teamA.name : teamProfiles.teamB.name}: "${data.clue}"`);
      setPhase((p) => {
        if (p.type !== "codenames") return p;
        const newGrid = { ...p.gridData, clue: data.clue };
        return { ...p, gridData: newGrid, phase: p.gridData.isFieldAgent ? "pick" : "waiting" };
      });
    });

    socket.on("codenamesTurn", (data: { team: Team }) => {
      setCnTurn(data.team);
      setPhase((p) => {
        if (p.type !== "codenames") return p;
        const isMyTurn = myTeam === data.team && p.gridData.isFieldAgent;
        return { ...p, phase: isMyTurn ? "pick" : "waiting" };
      });
    });

    socket.on("codenamesPickResult", (data: { row: number; col: number; type: string; team: Team; word: string }) => {
      setPhase((p) => {
        if (p.type !== "codenames") return p;
        const newRevealed = [...p.gridData.revealed, { row: data.row, col: data.col }];
        const newCardMap = { ...p.gridData.cardMap };
        newCardMap[`${data.row},${data.col}`] = data.type as any;
        return { ...p, gridData: { ...p.gridData, revealed: newRevealed, cardMap: newCardMap } };
      });
      const typeLabel: Record<string, string> = {
        teamA: `✓ كلمة ${teamProfiles.teamA.name}`,
        teamB: `✓ كلمة ${teamProfiles.teamB.name}`,
        neutral: "⊙ كلمة محايدة",
        assassin: "💀 القاتل!",
      };
      showToast(`${data.word}: ${typeLabel[data.type] || data.type}`);
    });

    socket.on("codenamesGameOver", (data: { winner: Team }) => {
      showToast(`🏆 ${data.winner === "teamA" ? teamProfiles.teamA.name : teamProfiles.teamB.name} فاز في كود نيمز!`);
    });

    socket.on("spyGuessResult", (data: { team: Team; isCorrect: boolean; correctWord: string }) => {
      showToast(data.isCorrect ? `تخمين صحيح ✓` : `خطأ! الكلمة: ${data.correctWord}`);
    });

    // Round end & game end
    socket.on("roundEnd", (data: { round: number; scores: { teamA: number; teamB: number }; totalScores: { teamA: number; teamB: number } }) => {
      setScores(data.totalScores);
      setPhase({ type: "round_end", round: data.round, scores: data.scores, totalScores: data.totalScores });
    });

    socket.on("gameEnd", (data: { finalScores: { teamA: number; teamB: number }; winner: string }) => {
      setScores(data.finalScores);
      setPhase({ type: "game_end", finalScores: data.finalScores, winner: data.winner });
    });

    return () => {
      ["roundLoaded", "showQuestion", "showRound1Options", "round1ChoiceResult",
       "startDrawing", "drawingSubmitted", "showGuesses", "guessResult",
       "showQuestionRound3", "showRound3Options", "round3ChoiceResult",
       "startCodenamesGrid", "codenamesClue", "codenamesTurn", "codenamesPickResult",
       "codenamesGameOver", "roundEnd", "gameEnd", "spyGuessResult"]
        .forEach((ev) => socket.off(ev));
    };
  }, [showToast, teamProfiles, myTeam]);

  // Timer for guess drawing
  useEffect(() => {
    if (phase.type !== "guess_drawing") return;
    if (phase.guessed || phase.timeLeft <= 0) return;
    const interval = setInterval(() => {
      setPhase((p) => {
        if (p.type !== "guess_drawing" || p.guessed) return p;
        const next = p.timeLeft - 1;
        if (next <= 0) {
          getSocket().emit("submitGuess", { roomCode, team: myTeam, guess: "" });
          return { ...p, guessed: true, timeLeft: 0 };
        }
        return { ...p, timeLeft: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, roomCode, myTeam]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (phase.type === "drawing") setTimeout(initCanvas, 80);
  }, [phase.type, initCanvas]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0]!;
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasCoords(e, canvas);
    drawing.current = { active: true, lastX: x, lastY: y };
  };

  const continueDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(drawing.current.lastX, drawing.current.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawing.current.lastX = x;
    drawing.current.lastY = y;
  };

  const stopDraw = () => { drawing.current.active = false; };

  const submitDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL();
    getSocket().emit("submitDrawing", { roomCode, team: myTeam, drawingData: data });
    setPhase((p) => p.type === "drawing" ? { ...p, submitted: true } : p);
  }, [roomCode, myTeam]);

  const submitGuess = useCallback(() => {
    if (!guessText.trim()) return;
    getSocket().emit("submitGuess", { roomCode, team: myTeam, guess: guessText.trim() });
    setPhase((p) => p.type === "guess_drawing" ? { ...p, guessed: true } : p);
  }, [guessText, roomCode, myTeam]);

  const submitPlayerAnswer = useCallback(() => {
    if (!answerText.trim()) return;
    const event = currentRound === 3 ? "submitPlayerAnswerRound3" : "submitPlayerAnswer";
    getSocket().emit(event, { roomCode, answer: answerText.trim() });
    setPhase((p) => p.type === "write_answer" ? { ...p, submitted: true } : p);
  }, [answerText, roomCode, currentRound]);

  const submitPlayerChoice = useCallback((choiceIndex: number) => {
    const event = currentRound === 3 ? "submitPlayerChoiceRound3" : "submitPlayerChoice";
    getSocket().emit(event, { roomCode, choiceIndex });
    setPhase((p) => p.type === "choose_option" ? { ...p, answered: true } : p);
  }, [roomCode, currentRound]);

  const submitCodenamesClue = useCallback(() => {
    if (!clueText.trim()) return;
    const formatted = `${clueText.trim()} ${clueNumber}`;
    getSocket().emit("submitCodenamesClue", { roomCode, clue: formatted });
    setPhase((p) => p.type === "codenames" ? { ...p, phase: "waiting" } : p);
  }, [clueText, clueNumber, roomCode]);

  const submitCodenamesPick = useCallback((row: number, col: number) => {
    setPhase((p) => {
      if (p.type !== "codenames" || p.phase !== "pick") return p;
      getSocket().emit("submitCodenamesPick", { roomCode, row, col });
      return { ...p, phase: "waiting" };
    });
  }, [roomCode]);

  const getCellStyle = (row: number, col: number, gd: CodenamesGridData) => {
    const key = `${row},${col}`;
    const isRevealed = gd.revealed.some((r) => r.row === row && r.col === col);
    const cardType = gd.cardMap[key] as string | undefined;

    if (isRevealed) {
      switch (cardType) {
        case "teamA": return { background: `${teamProfiles.teamA.color}dd`, color: "#fff" };
        case "teamB": return { background: `${teamProfiles.teamB.color}dd`, color: "#fff" };
        case "neutral": return { background: "rgba(255,255,255,0.15)", color: "#aaa" };
        case "assassin": return { background: "#dc2626dd", color: "#fff" };
        default: return { background: "rgba(255,255,255,0.1)", color: "#fff" };
      }
    }
    // Not revealed - clue giver sees card type subtly
    if (gd.isClueGiver) {
      switch (cardType) {
        case "teamA": return { background: `${teamProfiles.teamA.color}40`, border: `1px solid ${teamProfiles.teamA.color}88` };
        case "teamB": return { background: `${teamProfiles.teamB.color}40`, border: `1px solid ${teamProfiles.teamB.color}88` };
        case "neutral": return { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
        case "assassin": return { background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)" };
        default: return { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
      }
    }
    return { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
  };

  const renderPhase = () => {
    switch (phase.type) {
      case "waiting":
        return (
          <div className="text-center text-white/60 py-16">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="text-4xl mb-4">⏳</motion.div>
            <p>جارٍ الانتظار...</p>
          </div>
        );

      case "round_intro":
        return (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center py-12">
            <motion.div className="text-7xl mb-4" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: 2 }}>
              {ROUND_ICONS[phase.round - 1] || "🎮"}
            </motion.div>
            <h2 className="text-2xl font-bold text-white">{ROUND_NAMES[phase.round] || `الجولة ${phase.round}`}</h2>
          </motion.div>
        );

      case "write_answer":
        return (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-white/50 text-sm mb-2">السؤال {phase.qNum}/{phase.total}</p>
              <p className="text-white text-lg font-bold leading-relaxed">{phase.question.q}</p>
            </div>
            {!phase.submitted ? (
              <div className="space-y-3">
                <input
                  className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="اكتب إجابتك هنا"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitPlayerAnswer()}
                  dir="rtl"
                />
                <button onClick={submitPlayerAnswer} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>إرسال الإجابة</button>
              </div>
            ) : (
              <div className="text-center text-white/50 py-6">✓ تم إرسال إجابتك — في انتظار بقية اللاعبين...</div>
            )}
          </div>
        );

      case "choose_option":
        return (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-white/50 text-sm mb-2">اختر الإجابة الصحيحة — السؤال {phase.qNum}/{phase.total}</p>
              <p className="text-white text-lg font-bold leading-relaxed">{phase.question.q}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {phase.options.map((opt, i) => (
                <motion.button key={i} whileHover={!phase.answered ? { scale: 1.03 } : {}} whileTap={!phase.answered ? { scale: 0.97 } : {}}
                  onClick={() => { if (phase.answered) return; submitPlayerChoice(i); }}
                  className="py-4 px-3 rounded-2xl text-white font-bold text-center text-sm"
                  style={{ background: phase.answered ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #667eea, #764ba2)", cursor: phase.answered ? "default" : "pointer" }}>
                  {opt}
                </motion.button>
              ))}
            </div>
            {phase.answered && <p className="text-center text-white/40 text-sm">في انتظار بقية اللاعبين...</p>}
          </div>
        );

      case "drawing":
        return (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-white font-bold text-lg mb-1">ارسم هذه الكلمة</h3>
              {!phase.submitted && <p className="text-yellow-400 text-2xl font-bold">{phase.word}</p>}
              <p className="text-white/40 text-sm">عدد الحروف: {phase.wordLength}</p>
            </div>
            {!phase.submitted ? (
              <>
                <div className="flex justify-center">
                  <canvas ref={canvasRef} width={380} height={260}
                    className="rounded-2xl touch-none"
                    style={{ background: "white", width: "100%", maxWidth: 380, cursor: "crosshair" }}
                    onMouseDown={startDraw} onMouseMove={continueDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={(e) => { e.preventDefault(); startDraw(e); }}
                    onTouchMove={(e) => { e.preventDefault(); continueDraw(e); }}
                    onTouchEnd={stopDraw}
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={initCanvas} className="flex-1 py-3 rounded-2xl text-white text-sm" style={{ background: "rgba(255,255,255,0.12)" }}>مسح</button>
                  <button onClick={submitDrawing} className="flex-1 py-3 rounded-2xl text-black font-bold text-sm" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>إرسال الرسم</button>
                </div>
              </>
            ) : (
              <div className="text-center text-white/50 py-10">في انتظار الفريق الآخر...</div>
            )}
          </div>
        );

      case "guess_drawing": {
        const myDrawing = myTeam === "teamA" ? phase.drawingA : phase.drawingB;
        const oppDrawing = myTeam === "teamA" ? phase.drawingB : phase.drawingA;
        return (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-white font-bold text-lg">خمّن الكلمة من رسمة الخصم</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                <p className="text-white/40 text-sm">عدد الحروف: {phase.wordLength}</p>
                {!phase.guessed && <span className="text-red-400 font-bold text-sm animate-pulse">⏱️ {phase.timeLeft}ث</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/50 text-xs text-center mb-1">رسمتك</p>
                <img src={myDrawing} className="w-full rounded-xl border border-white/10" alt="your drawing" />
              </div>
              <div>
                <p className="text-yellow-400 text-xs text-center mb-1 font-bold">رسمة الخصم</p>
                <img src={oppDrawing} className="w-full rounded-xl border border-yellow-400/30" alt="opponent drawing" />
              </div>
            </div>
            {!phase.guessed ? (
              <div className="space-y-2">
                <input className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="اكتب تخمينك" value={guessText} onChange={(e) => setGuessText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitGuess()} dir="rtl" />
                <button onClick={submitGuess} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>تخمين</button>
              </div>
            ) : (
              <div className="text-center text-white/50 py-4">في انتظار الفريق الآخر...</div>
            )}
          </div>
        );
      }

      case "codenames": {
        const gd = phase.gridData;
        const clueParts = gd.clue?.split(" ") ?? [];
        const clueWord = clueParts.slice(0, -1).join(" ");
        const clueNum = clueParts[clueParts.length - 1] ?? "";

        return (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-white font-bold text-lg">🕵️ كود نيمز</h3>
              {gd.clue && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-2 p-3 rounded-xl" style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)" }}>
                  <span className="text-yellow-400 font-bold text-xl">{clueWord}</span>
                  <span className="text-white/60 mx-2">—</span>
                  <span className="text-white font-bold text-xl">{clueNum}</span>
                </motion.div>
              )}
              <div className="flex justify-center gap-6 mt-3 text-sm">
                <div><span style={{ color: teamProfiles.teamA.color }} className="font-bold">{teamProfiles.teamA.name}:</span> {gd.teamsCards.teamA}</div>
                <div><span style={{ color: teamProfiles.teamB.color }} className="font-bold">{teamProfiles.teamB.name}:</span> {gd.teamsCards.teamB}</div>
              </div>
              {gd.isFieldAgent && cnTurn && (
                <p className={`text-sm font-bold mt-1 ${cnTurn === myTeam ? "text-green-400" : "text-red-400"}`}>
                  {cnTurn === myTeam ? "دورك في التخمين!" : "دور الفريق الآخر"}
                </p>
              )}
            </div>

            {/* 5x5 Grid */}
            <div className="grid grid-cols-5 gap-1.5 max-w-md mx-auto">
              {gd.grid.flatMap((row, r) =>
                row.map((word, c) => {
                  const key = `${r},${c}`;
                  const isRevealed = gd.revealed.some((rev) => rev.row === r && rev.col === c);
                  const style = getCellStyle(r, c, gd);
                  return (
                    <motion.button
                      key={key}
                      whileHover={!isRevealed && phase.phase === "pick" ? { scale: 1.08 } : {}}
                      whileTap={!isRevealed && phase.phase === "pick" ? { scale: 0.92 } : {}}
                      onClick={() => {
                        if (isRevealed || phase.phase !== "pick") return;
                        submitCodenamesPick(r, c);
                      }}
                      className="py-2.5 px-1 rounded-lg text-white font-bold text-[11px] leading-tight text-center transition-all"
                      style={{
                        ...style,
                        cursor: !isRevealed && phase.phase === "pick" ? "pointer" : "default",
                        opacity: isRevealed && (style as any).background?.includes("neutral") ? 0.5 : 1,
                      }}
                      dir="rtl"
                    >
                      {word}
                    </motion.button>
                  );
                })
              )}
            </div>

            {/* Clue input for spymaster */}
            {phase.phase === "clue" && gd.canClue && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-4 py-3 rounded-2xl text-white text-right outline-none text-sm"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                    placeholder="اكتب تلميحاً (كلمة واحدة)"
                    value={clueText}
                    onChange={(e) => setClueText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitCodenamesClue()}
                    dir="rtl"
                  />
                  <input
                    type="number" min={1} max={9}
                    className="w-16 px-2 py-3 rounded-2xl text-white text-center outline-none text-sm"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                    value={clueNumber}
                    onChange={(e) => setClueNumber(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <button onClick={submitCodenamesClue} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>
                  إرسال التلميح
                </button>
              </div>
            )}

            {phase.phase === "waiting" && (
              <div className="text-center text-white/50 py-4">
                {gd.isClueGiver && !gd.clue ? "اكتب تلميحاً لفريقك" : "في انتظار..."}
              </div>
            )}
          </div>
        );
      }

      case "round_end":
        return (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8 space-y-5">
            <div className="text-5xl">🎉</div>
            <h3 className="text-2xl font-bold text-white">نهاية الجولة {phase.round}</h3>
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.05)" }}>
              <p className="text-white/50 text-sm mb-4">نقاط هذه الجولة</p>
              <div className="flex justify-center gap-10">
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: teamProfiles.teamA.color }}>{teamProfiles.teamA.name}</p>
                  <p className="text-white text-3xl font-bold">+{phase.scores.teamA}</p>
                </div>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: teamProfiles.teamB.color }}>{teamProfiles.teamB.name}</p>
                  <p className="text-white text-3xl font-bold">+{phase.scores.teamB}</p>
                </div>
              </div>
            </div>
            <p className="text-white/40 text-sm">الإجمالي: {teamProfiles.teamA.name} {phase.totalScores.teamA} - {teamProfiles.teamB.name} {phase.totalScores.teamB}</p>
            <motion.p className="text-white/30 text-sm" animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
              جارٍ الانتقال للجولة التالية...
            </motion.p>
          </motion.div>
        );

      case "game_end":
        return (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-8 space-y-5">
            <motion.div className="text-6xl" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: 2 }}>🏆</motion.div>
            <h2 className="text-3xl font-bold text-white">نهاية اللعبة</h2>
            <h3 className="text-2xl font-bold" style={{ color: "#FFD700" }}>{phase.winner}</h3>
            <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="flex justify-center gap-12">
                <div>
                  <p className="font-bold mb-1" style={{ color: teamProfiles.teamA.color }}>{teamProfiles.teamA.name}</p>
                  <p className="text-white text-3xl font-bold">{phase.finalScores.teamA}</p>
                </div>
                <div>
                  <p className="font-bold mb-1" style={{ color: teamProfiles.teamB.color }}>{teamProfiles.teamB.name}</p>
                  <p className="text-white text-3xl font-bold">{phase.finalScores.teamB}</p>
                </div>
              </div>
            </div>
            <button onClick={onGameOver} className="px-8 py-4 rounded-2xl text-black font-bold text-lg" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>
              العودة للقائمة
            </button>
          </motion.div>
        );
    }
  };

  return (
    <><div className="bg-particles" /><div className="min-h-screen p-4" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/60 text-sm">الجولة {currentRound}/4</span>
          <div className="flex gap-4 text-sm font-bold">
            <span style={{ color: teamProfiles.teamA.color }}>{teamProfiles.teamA.name}: {scores.teamA}</span>
            <span style={{ color: teamProfiles.teamB.color }}>{teamProfiles.teamB.name}: {scores.teamB}</span>
          </div>
          <span className="text-white/40 text-xs">{myTeam === "teamA" ? `🛡️ ${teamProfiles.teamA.name}` : myTeam === "teamB" ? `🌑 ${teamProfiles.teamB.name}` : ""}</span>
        </div>

        <div className="rounded-3xl p-6 relative overflow-hidden" style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,215,0,0.3)" }}>
          <div className="absolute inset-0 opacity-5" style={{ background: "radial-gradient(circle at 50% 0%, #FFD700 0%, transparent 70%)" }} />
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              <motion.div key={`${phase.type}-${"qNum" in phase ? phase.qNum : phase.type}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                {renderPhase()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold z-50 whitespace-nowrap"
              style={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,215,0,0.6)" }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div></>
  );
}
