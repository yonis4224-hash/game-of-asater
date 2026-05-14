import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSocket } from "@/lib/socket";
import type { TriviaQuestion, Team } from "@/types/game";

interface GamePageProps {
  roomCode: string;
  myTeam: Team | null;
  onGameOver: () => void;
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
  | { type: "round_end"; round: number; scores: { teamA: number; teamB: number }; totalScores: { teamA: number; teamB: number } }
  | { type: "game_end"; finalScores: { teamA: number; teamB: number }; winner: string };

const ROUND_NAMES: Record<number, string> = {
  1: "الجولة 1: أسئلة كروية",
  2: "الجولة 2: رسم وتخمين",
  3: "الجولة 3: ألعاب وأفلام وجغرافيا",
  4: "الجولة 4: كود نيمز",
};

export default function GamePage({ roomCode, myTeam, onGameOver }: GamePageProps) {
  const [phase, setPhase] = useState<GamePhase>({ type: "waiting" });
  const [currentRound, setCurrentRound] = useState(1);
  const [scores, setScores] = useState({ teamA: 0, teamB: 0 });
  const [toast, setToast] = useState("");
  const [guessText, setGuessText] = useState("");
  const [clueText, setClueText] = useState("");
  const [answerText, setAnswerText] = useState("");
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

    // Round 1: Write answer phase
    socket.on("showQuestion", (data: { question: TriviaQuestion; questionNumber: number; totalQuestions: number; phase: string }) => {
      setAnswerText("");
      setPhase({ type: "write_answer", question: data.question, qNum: data.questionNumber, total: data.totalQuestions, submitted: false });
    });

    // Round 1: Choose from options phase
    socket.on("showRound1Options", (data: { question: TriviaQuestion; options: string[]; questionNumber: number; totalQuestions: number }) => {
      setPhase({ type: "choose_option", question: data.question, options: data.options, qNum: data.questionNumber, total: data.totalQuestions, answered: false });
    });

    socket.on("round1ChoiceResult", (data: { playerName: string; team: Team | null; isCorrect: boolean }) => {
      showToast(`${data.playerName} ${data.isCorrect ? "✓ صحيح!" : "✗ خطأ"}`);
    });

    // Round 2: Drawing
    socket.on("startDrawing", (data: { word: string; wordLength: number }) => {
      setPhase({ type: "drawing", word: data.word, wordLength: data.wordLength, submitted: false });
    });

    socket.on("drawingSubmitted", (data: { team: Team }) => {
      showToast(`${data.team === "teamA" ? "فريق النور" : "فريق الظلام"} أرسل رسمته`);
    });

    // Round 2: Guess with 15s timer
    socket.on("showGuesses", (data: { drawingA: string; drawingB: string; wordLength: number }) => {
      setGuessText("");
      setPhase({ type: "guess_drawing", drawingA: data.drawingA, drawingB: data.drawingB, wordLength: data.wordLength, guessed: false, timeLeft: 15 });
    });

    socket.on("guessResult", (data: { team: Team; isCorrect: boolean; correctWord: string }) => {
      showToast(data.isCorrect ? `${data.team === "teamA" ? "فريق النور" : "فريق الظلام"} خمّن صحيح!` : `خطأ! الكلمة: ${data.correctWord}`);
    });

    // Round 3: Write answer (same as Round 1)
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

    // Round 4: Spy
    socket.on("startSpyMaster", (data: { word: string; clues: string[] }) => {
      setClueText("");
      setPhase({ type: "spy_master", word: data.word, clues: data.clues, submitted: false });
    });

    socket.on("spyClueSubmitted", (data: { team: Team }) => {
      showToast(`${data.team === "teamA" ? "فريق النور" : "فريق الظلام"} أرسل تلميحه`);
    });

    socket.on("showSpyGuesses", (data: { clueA: string; clueB: string }) => {
      setGuessText("");
      setPhase({ type: "spy_guess", clueA: data.clueA, clueB: data.clueB, guessed: false });
    });

    socket.on("spyGuessResult", (data: { team: Team; isCorrect: boolean; correctWord: string }) => {
      showToast(data.isCorrect ? `${data.team === "teamA" ? "فريق النور" : "فريق الظلام"} خمّن صحيح!` : `خطأ! الكلمة: ${data.correctWord}`);
    });

    socket.on("roundEnd", (data: { round: number; scores: { teamA: number; teamB: number }; totalScores: { teamA: number; teamB: number } }) => {
      setScores(data.totalScores);
      setPhase({ type: "round_end", round: data.round, scores: data.scores, totalScores: data.totalScores });
    });

    socket.on("gameEnd", (data: { finalScores: { teamA: number; teamB: number }; winner: string }) => {
      setScores(data.finalScores);
      setPhase({ type: "game_end", finalScores: data.finalScores, winner: data.winner });
    });

    return () => {
      ["roundLoaded","showQuestion","showRound1Options","round1ChoiceResult",
       "startDrawing","drawingSubmitted","showGuesses","guessResult",
       "showQuestionRound3","showRound3Options","round3ChoiceResult",
       "startSpyMaster","spyClueSubmitted","showSpyGuesses","spyGuessResult",
       "roundEnd","gameEnd"]
        .forEach((ev) => socket.off(ev));
    };
  }, [showToast]);

  // 15-second countdown for guess_drawing
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

  const submitDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL();
    getSocket().emit("submitDrawing", { roomCode, team: myTeam, drawingData: data });
    setPhase((p) => p.type === "drawing" ? { ...p, submitted: true } : p);
  };

  const submitGuess = () => {
    if (!guessText.trim()) return;
    getSocket().emit("submitGuess", { roomCode, team: myTeam, guess: guessText.trim() });
    setPhase((p) => p.type === "guess_drawing" ? { ...p, guessed: true } : p);
  };

  const submitSpyClue = () => {
    if (!clueText.trim()) return;
    getSocket().emit("submitSpyClue", { roomCode, team: myTeam, clue: clueText.trim() });
    setPhase((p) => p.type === "spy_master" ? { ...p, submitted: true } : p);
  };

  const submitSpyGuess = () => {
    if (!guessText.trim()) return;
    getSocket().emit("submitSpyGuess", { roomCode, team: myTeam, guess: guessText.trim() });
    setPhase((p) => p.type === "spy_guess" ? { ...p, guessed: true } : p);
  };

  const submitPlayerAnswer = () => {
    if (!answerText.trim()) return;
    const event = currentRound === 3 ? "submitPlayerAnswerRound3" : "submitPlayerAnswer";
    getSocket().emit(event, { roomCode, answer: answerText.trim() });
    setPhase((p) => p.type === "write_answer" ? { ...p, submitted: true } : p);
  };

  const submitPlayerChoice = (choiceIndex: number) => {
    const event = currentRound === 3 ? "submitPlayerChoiceRound3" : "submitPlayerChoice";
    getSocket().emit(event, { roomCode, choiceIndex });
    setPhase((p) => p.type === "choose_option" ? { ...p, answered: true } : p);
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
              {["⚽", "🎨", "🎬", "🕵️"][phase.round - 1]}
            </motion.div>
            <h2 className="text-2xl font-bold text-white">{ROUND_NAMES[phase.round]}</h2>
          </motion.div>
        );

      case "write_answer":
        return (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-white/50 text-sm mb-2">السؤال {phase.qNum}/{phase.total}</p>
              <p className="text-white text-lg font-bold leading-relaxed">{phase.question.q}</p>
              <p className="text-white/40 text-xs mt-2">اكتب إجابتك الخاصة — ستُعرض جميع الإجابات مع الإجابة الصحيحة</p>
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
                  onClick={() => {
                    if (phase.answered) return;
                    submitPlayerChoice(i);
                  }}
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
                  <canvas
                    ref={canvasRef} width={380} height={260}
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
                {!phase.guessed && (
                  <span className="text-red-400 font-bold text-sm animate-pulse">
                    ⏱️ {phase.timeLeft}ث
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/50 text-xs text-center mb-1">رسمتك</p>
                <img src={myDrawing} className="w-full rounded-xl border border-white/10" />
              </div>
              <div>
                <p className="text-yellow-400 text-xs text-center mb-1 font-bold">رسمة الخصم (خمّن منها)</p>
                <img src={oppDrawing} className="w-full rounded-xl border border-yellow-400/30" />
              </div>
            </div>
            {!phase.guessed ? (
              <div className="space-y-2">
                <input
                  className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="اكتب تخمينك"
                  value={guessText}
                  onChange={(e) => setGuessText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitGuess()}
                  dir="rtl"
                />
                <button onClick={submitGuess} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>تخمين</button>
              </div>
            ) : (
              <div className="text-center text-white/50 py-4">في انتظار الفريق الآخر...</div>
            )}
          </div>
        );
      }

      case "spy_master":
        return (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-white font-bold text-lg mb-3">الكود السري</h3>
              <div className="p-4 rounded-2xl mb-3" style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.4)" }}>
                <p className="text-white/60 text-xs mb-1">كلمتك السرية:</p>
                <p className="text-yellow-400 text-3xl font-bold">{phase.word}</p>
              </div>
              <p className="text-white/50 text-sm">تلميحات مساعدة: {phase.clues.join(" · ")}</p>
            </div>
            {!phase.submitted ? (
              <div className="space-y-3">
                <textarea
                  className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none resize-none text-sm"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="اكتب تلميحاً لفريقك (لا تكتب الكلمة نفسها)"
                  value={clueText}
                  onChange={(e) => setClueText(e.target.value)}
                  rows={3}
                  dir="rtl"
                />
                <button onClick={submitSpyClue} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>إرسال التلميح</button>
              </div>
            ) : (
              <div className="text-center text-white/50 py-8">في انتظار التلميح الآخر...</div>
            )}
          </div>
        );

      case "spy_guess": {
        const myClue = myTeam === "teamA" ? phase.clueB : phase.clueA;
        return (
          <div className="space-y-4">
            <h3 className="text-white font-bold text-lg text-center">خمّن الكلمة السرية</h3>
            <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <p className="text-white/50 text-xs text-center mb-1">تلميح فريق الخصم:</p>
              <p className="text-white text-xl text-center font-bold">{myClue}</p>
            </div>
            {!phase.guessed ? (
              <div className="space-y-3">
                <input
                  className="w-full px-4 py-3 rounded-2xl text-white text-right outline-none"
                  style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,215,0,0.5)" }}
                  placeholder="خمّن الكلمة السرية"
                  value={guessText}
                  onChange={(e) => setGuessText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitSpyGuess()}
                  dir="rtl"
                />
                <button onClick={submitSpyGuess} className="w-full py-3 rounded-2xl text-black font-bold" style={{ background: "linear-gradient(135deg, #FFD700, #FF8C00)" }}>تخمين</button>
              </div>
            ) : (
              <div className="text-center text-white/50 py-4">في انتظار الفريق الآخر...</div>
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
                  <p className="text-green-400 font-bold text-sm mb-1">فريق النور</p>
                  <p className="text-white text-3xl font-bold">+{phase.scores.teamA}</p>
                </div>
                <div>
                  <p className="text-orange-400 font-bold text-sm mb-1">فريق الظلام</p>
                  <p className="text-white text-3xl font-bold">+{phase.scores.teamB}</p>
                </div>
              </div>
            </div>
            <p className="text-white/40 text-sm">الإجمالي: النور {phase.totalScores.teamA} - الظلام {phase.totalScores.teamB}</p>
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
            <div className="text-5xl">{phase.winner === "فريق النور" ? "🛡️" : phase.winner === "فريق الظلام" ? "🌑" : "🤝"}</div>
            <h3 className="text-2xl font-bold" style={{ color: "#FFD700" }}>{phase.winner}</h3>
            <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="flex justify-center gap-12">
                <div>
                  <p className="text-green-400 font-bold mb-1">فريق النور</p>
                  <p className="text-white text-3xl font-bold">{phase.finalScores.teamA}</p>
                </div>
                <div>
                  <p className="text-orange-400 font-bold mb-1">فريق الظلام</p>
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
    <div className="min-h-screen p-4" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-white/60 text-sm">الجولة {currentRound}/4</span>
          <div className="flex gap-4 text-sm font-bold">
            <span className="text-green-400">النور: {scores.teamA}</span>
            <span className="text-orange-400">الظلام: {scores.teamB}</span>
          </div>
          <span className="text-white/40 text-xs">{myTeam === "teamA" ? "🛡️ النور" : myTeam === "teamB" ? "🌑 الظلام" : ""}</span>
        </div>

        <div className="rounded-3xl p-6" style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,215,0,0.3)" }}>
          <AnimatePresence mode="wait">
            <motion.div key={`${phase.type}-${"qNum" in phase ? phase.qNum : phase.type}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {renderPhase()}
            </motion.div>
          </AnimatePresence>
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
    </div>
  );
}
