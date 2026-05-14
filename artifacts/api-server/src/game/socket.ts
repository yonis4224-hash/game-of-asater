import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { logger } from "../lib/logger";
import { createRoom, getRoom, deleteRoom, generateRoomCode } from "./rooms";
import {
  footballQuestions,
  triviaQuestions,
  drawingWords,
  spyWords,
  shuffle,
} from "./questions";
import type { Player, Round1Data, Round2Data, Round3Data, Round4Data, Team } from "./types";

const TEAM_KEYS: Team[] = ["teamA", "teamB"];

function getPlayersNeeded(mode: "2v2" | "1v1"): number {
  return mode === "2v2" ? 4 : 2;
}

function getTeamSize(mode: "2v2" | "1v1"): number {
  return mode === "2v2" ? 2 : 1;
}

function getTeamPlayers(players: Player[], team: Team): Player[] {
  return players.filter((player) => player.team === team);
}

function getRoundActor(teamPlayers: Player[], index: number): Player | null {
  if (teamPlayers.length === 0) return null;
  return teamPlayers[index % teamPlayers.length] ?? null;
}

export function initSocketServer(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
  });

  const playerRoomMap = new Map<string, string>();
  const suggestionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const choiceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const roomDeletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const guessTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function emitRoomMeta(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    io.to(roomCode).emit("roomMeta", {
      gameMode: room.gameMode,
      settings: room.settings,
      teams: room.teams,
    });
  }

  function resetReadyState(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.players.forEach((player) => (player.isReady = false));
    io.to(roomCode).emit("playersUpdate", room.players);
  }

  function validateTeamSetup(roomCode: string): string | null {
    const room = getRoom(roomCode);
    if (!room) return "الغرفة غير موجودة";

    const requiredPlayers = getPlayersNeeded(room.gameMode);
    const requiredPerTeam = getTeamSize(room.gameMode);

    if (room.players.length !== requiredPlayers) {
      return room.gameMode === "2v2"
        ? `نمط 2 ضد 2 يحتاج أربعة لاعبين قبل البدء. (${room.players.length}/${requiredPlayers})`
        : `نمط 1 ضد 1 يحتاج لاعبين اثنين فقط قبل البدء. (${room.players.length}/${requiredPlayers})`;
    }

    for (const team of TEAM_KEYS) {
      const teamPlayers = getTeamPlayers(room.players, team);
      if (teamPlayers.length !== requiredPerTeam) {
        return `${room.teams[team].name} يحتاج ${requiredPerTeam} ${requiredPerTeam === 1 ? "لاعب" : "لاعبين"} قبل البدء.`;
      }
    }

    if (room.players.some((player) => !player.team)) return "يجب توزيع جميع اللاعبين على الفرق قبل البدء.";
    return null;
  }

  function validateRoomForStart(roomCode: string): string | null {
    const teamError = validateTeamSetup(roomCode);
    if (teamError) return teamError;
    const room = getRoom(roomCode)!;
    if (room.players.some((player) => !player.isReady)) return "يجب أن يعلن جميع اللاعبين جاهزيتهم قبل البدء.";
    return null;
  }

  function maybeStartGame(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.gameStarted) return;

    const reason = validateRoomForStart(roomCode);
    if (!reason) {
      startGame(roomCode);
      return;
    }

    const everyoneReady = room.players.length > 0 && room.players.every((p) => p.isReady);
    if (everyoneReady) io.to(roomCode).emit("systemMessage", reason);
  }

  function getPlayerOrNull(roomCode: string, socketId: string): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return room.players.find((p) => p.id === socketId) ?? null;
  }

  function getTeamFromSocket(roomCode: string, socketId: string): Team | null {
    const pl = getPlayerOrNull(roomCode, socketId);
    return pl?.team ?? null;
  }

  function getQuestionActor(roomCode: string, team: Team, questionIndex: number): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return getRoundActor(getTeamPlayers(room.players, team), questionIndex);
  }

  function getDrawActor(roomCode: string, team: Team): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return getTeamPlayers(room.players, team)[0] ?? null;
  }

  function getGuessActor(roomCode: string, team: Team): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    const players = getTeamPlayers(room.players, team);
    return room.gameMode === "2v2" ? players[1] ?? null : players[0] ?? null;
  }

  function emitDrawingRound(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round2Data;

    room.players.forEach((player) => {
      const team = player.team;
      if (!team) return;
      const drawActor = getDrawActor(roomCode, team);
      const guessActor = getGuessActor(roomCode, team);
      io.to(player.id).emit("startDrawing", {
        word: player.id === drawActor?.id || room.gameMode === "1v1" ? data.word : null,
        wordLength: data.wordLength,
        canDraw: player.id === drawActor?.id || room.gameMode === "1v1",
        role: room.gameMode === "2v2" ? (player.id === drawActor?.id ? "drawer" : "guesser") : "solo",
        teammateName: room.gameMode === "2v2" ? (player.id === drawActor?.id ? guessActor?.name : drawActor?.name) : null,
      });
    });
  }

  function emitGuessRound(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round2Data;

    room.players.forEach((player) => {
      const team = player.team;
      if (!team) return;
      const drawActor = getDrawActor(roomCode, team);
      const guessActor = getGuessActor(roomCode, team);
      io.to(player.id).emit("showGuesses", {
        drawingA: data.drawings.teamA,
        drawingB: data.drawings.teamB,
        wordLength: data.wordLength,
        canGuess: player.id === guessActor?.id || room.gameMode === "1v1",
        role: room.gameMode === "2v2" ? (player.id === guessActor?.id ? "guesser" : "drawer") : "solo",
        teammateName: room.gameMode === "2v2" ? (player.id === guessActor?.id ? drawActor?.name : guessActor?.name) : null,
      });
    });

    // Start 15-second guess timer
    if (guessTimers.has(roomCode)) {
      clearTimeout(guessTimers.get(roomCode)!);
      guessTimers.delete(roomCode);
    }
    const timer = setTimeout(() => {
      const r = getRoom(roomCode);
      if (!r || r.currentRound !== 2) return;
      const d = r.roundData as Round2Data;
      for (const t of TEAM_KEYS) {
        if (d.guesses[t] === null) {
          d.guesses[t] = false;
          io.to(roomCode).emit("guessResult", { team: t, isCorrect: false, correctWord: d.word });
        }
      }
      const d2 = r.roundData as Round2Data;
      if (d2.guesses.teamA !== null && d2.guesses.teamB !== null) {
        io.to(roomCode).emit("roundEnd", {
          round: 2,
          scores: {
            teamA: d2.guesses.teamA ? r.settings.drawingPoints : 0,
            teamB: d2.guesses.teamB ? r.settings.drawingPoints : 0,
          },
          totalScores: { teamA: r.teamAScore, teamB: r.teamBScore },
        });
        setTimeout(() => loadRound(roomCode, 3), 4000);
      }
      guessTimers.delete(roomCode);
    }, 15_000);
    guessTimers.set(roomCode, timer);
  }

  function emitSpyMasterRound(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round4Data;

    room.players.forEach((player) => {
      const team = player.team;
      if (!team) return;
      const clueActor = getDrawActor(roomCode, team);
      const guessActor = getGuessActor(roomCode, team);
      io.to(player.id).emit("startSpyMaster", {
        word: player.id === clueActor?.id || room.gameMode === "1v1" ? data.word : null,
        clues: player.id === clueActor?.id || room.gameMode === "1v1" ? data.clues : [],
        canClue: player.id === clueActor?.id || room.gameMode === "1v1",
        role: room.gameMode === "2v2" ? (player.id === clueActor?.id ? "spymaster" : "field-agent") : "solo",
        teammateName: room.gameMode === "2v2" ? (player.id === clueActor?.id ? guessActor?.name : clueActor?.name) : null,
      });
    });
  }

  function emitSpyGuessRound(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round4Data;

    room.players.forEach((player) => {
      const team = player.team;
      if (!team) return;
      const clueActor = getDrawActor(roomCode, team);
      const guessActor = getGuessActor(roomCode, team);
      io.to(player.id).emit("showSpyGuesses", {
        clueA: data.spyClues.teamA,
        clueB: data.spyClues.teamB,
        canGuess: player.id === guessActor?.id || room.gameMode === "1v1",
        role: room.gameMode === "2v2" ? (player.id === guessActor?.id ? "field-agent" : "spymaster") : "solo",
        teammateName: room.gameMode === "2v2" ? (player.id === guessActor?.id ? clueActor?.name : guessActor?.name) : null,
      });
    });
  }

  function startGame(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.gameStarted) return;

    const reason = validateRoomForStart(roomCode);
    if (reason) {
      io.to(roomCode).emit("systemMessage", reason);
      return;
    }

    room.gameStarted = true;
    room.currentRound = 1;
    room.teamAScore = 0;
    room.teamBScore = 0;
    io.to(roomCode).emit("gameStarted", {
      roomCode,
      teams: room.teams,
      gameMode: room.gameMode,
    });
    loadRound(roomCode, 1);
  }

  function loadRound(roomCode: string, round: number) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.currentRound = round;
    io.to(roomCode).emit("roundLoaded", {
      round,
      scores: { teamA: room.teamAScore, teamB: room.teamBScore },
      settings: room.settings,
      teams: room.teams,
    });

    if (round === 1) loadRound1(roomCode);
    else if (round === 2) loadRound2(roomCode);
    else if (round === 3) loadRound3(roomCode);
    else if (round === 4) loadRound4(roomCode);
    else endGame(roomCode);
  }

  // =================================================================
  // ROUND 1: Football Trivia — ALL PLAYERS WRITE THEIR OWN ANSWER
  // =================================================================
  function loadRound1(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const questions = shuffle(footballQuestions).slice(0, 4);
    const initialAnswers: Record<string, string | null> = {};
    room.players.forEach((p) => { initialAnswers[p.id] = null; });

    room.roundData = {
      type: "round1",
      questions,
      currentIndex: 0,
      playerAnswers: initialAnswers,
      options: [],
      playerChoices: {},
      scores: { teamA: 0, teamB: 0 },
    } as Round1Data;
    sendRound1Question(roomCode);
  }

  function sendRound1Question(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 1) return;
    const data = room.roundData as Round1Data;
    const question = data.questions[data.currentIndex];
    if (!question) return;

    // Reset for new question
    const initialAnswers: Record<string, string | null> = {};
    room.players.forEach((p) => { initialAnswers[p.id] = null; });
    data.playerAnswers = initialAnswers;
    data.options = [];
    data.playerChoices = {};

    // Phase 1: prompt all players to write their own answer
    io.to(roomCode).emit("showQuestion", {
      question,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
      phase: "write_answer",
    });

    // Auto-suggest timeout: fallback to empty answers
    if (suggestionTimers.has(roomCode)) {
      clearTimeout(suggestionTimers.get(roomCode)!);
      suggestionTimers.delete(roomCode);
    }
    suggestionTimers.set(roomCode, setTimeout(() => {
      finalizeRound1Options(roomCode);
    }, 15000));
  }

  function finalizeRound1Options(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round1Data;
    if (!data || data.type !== "round1") return;
    const question = data.questions[data.currentIndex];

    const optsSet = new Set<string>();
    optsSet.add(question.correct);
    for (const answer of Object.values(data.playerAnswers)) {
      if (answer && answer.trim()) optsSet.add(answer.trim());
    }
    // Pad with some football-related distractors if needed (min 4)
    const extra = ["مورينيو", "رونالدو جنيور", "مبابي", "ليفاندوفسكي", "كان آغويرو", "مالديني"];
    for (const e of shuffle(extra)) {
      if (optsSet.size >= 4) break;
      optsSet.add(e);
    }
    const options = shuffle(Array.from(optsSet));
    data.options = options;

    // Clear suggestion timer
    if (suggestionTimers.has(roomCode)) {
      clearTimeout(suggestionTimers.get(roomCode)!);
      suggestionTimers.delete(roomCode);
    }

    // Phase 2: emit options to all players for choosing
    io.to(roomCode).emit("showRound1Options", {
      question,
      options,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
    });

    // Choice timeout
    if (choiceTimers.has(roomCode)) {
      clearTimeout(choiceTimers.get(roomCode)!);
      choiceTimers.delete(roomCode);
    }
    choiceTimers.set(roomCode, setTimeout(() => {
      const r = getRoom(roomCode);
      if (!r) return;
      const d = r.roundData as Round1Data;
      const correctIndex = d.options.indexOf(d.questions[d.currentIndex].correct);
      for (const p of r.players) {
        if (d.playerChoices[p.id] === null || d.playerChoices[p.id] === undefined) {
          d.playerChoices[p.id] = -1;
          io.to(roomCode).emit("round1ChoiceResult", { playerId: p.id, playerName: p.name, team: p.team, choiceIndex: -1, isCorrect: false, correctOptionIndex: correctIndex });
        }
      }
      // Check if all players have chosen after auto-fill
      if (r.players.every((pl) => d.playerChoices[pl.id] !== null && d.playerChoices[pl.id] !== undefined)) {
        proceedRound1AfterChoices(roomCode);
      }
    }, 12000));
  }

  function proceedRound1AfterChoices(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round1Data;
    if (!data) return;
    // Wait until all players have made a choice
    const allChosen = room.players.every((p) => data.playerChoices[p.id] !== null && data.playerChoices[p.id] !== undefined);
    if (!allChosen) return;

    if (choiceTimers.has(roomCode)) {
      clearTimeout(choiceTimers.get(roomCode)!);
      choiceTimers.delete(roomCode);
    }

    const question = data.questions[data.currentIndex];
    const correctIndex = data.options.indexOf(question.correct);

    // Award points per player
    for (const player of room.players) {
      const choice = data.playerChoices[player.id] ?? -1;
      const isCorrect = choice === correctIndex;
      if (isCorrect && player.team) {
        data.scores[player.team] += room.settings.triviaPoints;
      }
    }

    // Move to next question or round end
    data.currentIndex += 1;
    if (data.currentIndex >= data.questions.length) {
      room.teamAScore += data.scores.teamA;
      room.teamBScore += data.scores.teamB;
      io.to(roomCode).emit("roundEnd", {
        round: 1,
        scores: data.scores,
        totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
      });
      setTimeout(() => loadRound(roomCode, 2), 4000);
    } else {
      setTimeout(() => sendRound1Question(roomCode), 2200);
    }
  }

  // =================================================================
  // ROUND 2: Drawing & Guessing (15s timer)
  // =================================================================
  function loadRound2(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const word = drawingWords[Math.floor(Math.random() * drawingWords.length)] ?? "قمر";
    room.roundData = {
      type: "round2",
      word,
      drawings: { teamA: null, teamB: null },
      guesses: { teamA: null, teamB: null },
      wordLength: word.length,
    } as Round2Data;
    emitDrawingRound(roomCode);
  }

  // =================================================================
  // ROUND 3: Movies/Games/Geography Trivia — SAME AS ROUND 1
  // =================================================================
  function loadRound3(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const questions = shuffle(triviaQuestions).slice(0, 4);
    const initialAnswers: Record<string, string | null> = {};
    room.players.forEach((p) => { initialAnswers[p.id] = null; });

    room.roundData = {
      type: "round3",
      questions,
      currentIndex: 0,
      playerAnswers: initialAnswers,
      options: [],
      playerChoices: {},
      scores: { teamA: 0, teamB: 0 },
    } as Round3Data;
    sendRound3Question(roomCode);
  }

  function sendRound3Question(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 3) return;
    const data = room.roundData as Round3Data;
    const question = data.questions[data.currentIndex];
    if (!question) return;

    const initialAnswers: Record<string, string | null> = {};
    room.players.forEach((p) => { initialAnswers[p.id] = null; });
    data.playerAnswers = initialAnswers;
    data.options = [];
    data.playerChoices = {};

    io.to(roomCode).emit("showQuestionRound3", {
      question,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
      phase: "write_answer",
    });

    if (suggestionTimers.has(roomCode)) {
      clearTimeout(suggestionTimers.get(roomCode)!);
      suggestionTimers.delete(roomCode);
    }
    suggestionTimers.set(roomCode, setTimeout(() => {
      finalizeRound3Options(roomCode);
    }, 15000));
  }

  function finalizeRound3Options(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round3Data;
    if (!data || data.type !== "round3") return;
    const question = data.questions[data.currentIndex];

    const optsSet = new Set<string>();
    optsSet.add(question.correct);
    for (const answer of Object.values(data.playerAnswers)) {
      if (answer && answer.trim()) optsSet.add(answer.trim());
    }
    const extra = ["توتانخامن", "معرفتش", "مشهور", "معروف"];
    for (const e of shuffle(extra)) {
      if (optsSet.size >= 4) break;
      optsSet.add(e);
    }
    const options = shuffle(Array.from(optsSet));
    data.options = options;

    if (suggestionTimers.has(roomCode)) {
      clearTimeout(suggestionTimers.get(roomCode)!);
      suggestionTimers.delete(roomCode);
    }

    io.to(roomCode).emit("showRound3Options", {
      question,
      options,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
    });

    if (choiceTimers.has(roomCode)) {
      clearTimeout(choiceTimers.get(roomCode)!);
      choiceTimers.delete(roomCode);
    }
    choiceTimers.set(roomCode, setTimeout(() => {
      const r = getRoom(roomCode);
      if (!r) return;
      const d = r.roundData as Round3Data;
      const correctIndex = d.options.indexOf(d.questions[d.currentIndex].correct);
      for (const p of r.players) {
        if (d.playerChoices[p.id] === null || d.playerChoices[p.id] === undefined) {
          d.playerChoices[p.id] = -1;
          io.to(roomCode).emit("round3ChoiceResult", { playerId: p.id, playerName: p.name, team: p.team, choiceIndex: -1, isCorrect: false, correctOptionIndex: correctIndex });
        }
      }
      if (r.players.every((pl) => d.playerChoices[pl.id] !== null && d.playerChoices[pl.id] !== undefined)) {
        proceedRound3AfterChoices(roomCode);
      }
    }, 12000));
  }

  function proceedRound3AfterChoices(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round3Data;
    if (!data) return;
    const allChosen = room.players.every((p) => data.playerChoices[p.id] !== null && data.playerChoices[p.id] !== undefined);
    if (!allChosen) return;

    if (choiceTimers.has(roomCode)) {
      clearTimeout(choiceTimers.get(roomCode)!);
      choiceTimers.delete(roomCode);
    }

    const question = data.questions[data.currentIndex];
    const correctIndex = data.options.indexOf(question.correct);

    for (const player of room.players) {
      const choice = data.playerChoices[player.id] ?? -1;
      const isCorrect = choice === correctIndex;
      if (isCorrect && player.team) {
        data.scores[player.team] += room.settings.triviaPoints;
      }
    }

    data.currentIndex += 1;
    if (data.currentIndex >= data.questions.length) {
      room.teamAScore += data.scores.teamA;
      room.teamBScore += data.scores.teamB;
      io.to(roomCode).emit("roundEnd", {
        round: 3,
        scores: data.scores,
        totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
      });
      setTimeout(() => loadRound(roomCode, 4), 4000);
    } else {
      setTimeout(() => sendRound3Question(roomCode), 2200);
    }
  }

  // =================================================================
  // ROUND 4: Spy Master (Codenames)
  // =================================================================
  function loadRound4(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const selected = spyWords[Math.floor(Math.random() * spyWords.length)] ?? { word: "نور", clues: ["ضياء", "سطوع", "فجر"] };
    room.roundData = {
      type: "round4",
      word: selected.word,
      clues: selected.clues,
      spyClues: { teamA: null, teamB: null },
      guesses: { teamA: null, teamB: null },
    } as Round4Data;
    emitSpyMasterRound(roomCode);
  }

  function endGame(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;

    let winner = "تعادل";
    if (room.teamAScore > room.teamBScore) winner = room.teams.teamA.name;
    else if (room.teamBScore > room.teamAScore) winner = room.teams.teamB.name;

    io.to(roomCode).emit("gameEnd", {
      finalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
      winner,
    });
    room.gameStarted = false;
    room.roundData = null;
    room.players.forEach((player) => (player.isReady = false));
    io.to(roomCode).emit("playersUpdate", room.players);
  }

  // =================================================================
  // SOCKET EVENTS
  // =================================================================
  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Player connected");

    socket.on("createRoom", ({ playerName, settings }: { playerName: string; settings?: Partial<Record<string, number>> }) => {
      const roomCode = generateRoomCode();
      createRoom(roomCode, socket.id, playerName, settings);
      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomCreated", { roomCode, playerId: socket.id, isCreator: true });
      emitRoomMeta(roomCode);
      io.to(roomCode).emit("playersUpdate", getRoom(roomCode)!.players);
    });

    socket.on("joinRoom", ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = getRoom(roomCode);
      if (!room) { socket.emit("error", "الغرفة غير موجودة — تأكد من الكود وأن منشئ الغرفة لا يزال متصلاً"); return; }
      const maxPlayers = getPlayersNeeded(room.gameMode);
      if (room.players.length >= maxPlayers) { socket.emit("error", `الغرفة ممتلئة (${maxPlayers} لاعبين في وضع ${room.gameMode})`); return; }

      room.players.push({ id: socket.id, name: playerName, team: null, isReady: false, isCreator: false });
      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomJoined", { roomCode, playerId: socket.id, isCreator: false });
      emitRoomMeta(roomCode);
      io.to(roomCode).emit("playersUpdate", room.players);
    });

    socket.on("checkRoom", (roomCode: string, callback: (r: { exists: boolean; playerCount: number }) => void) => {
      const room = getRoom(roomCode);
      callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    socket.on("updateSettings", ({ roomCode, settings }: { roomCode: string; settings: Partial<Record<string, number>> }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتعديل الإعدادات"); return; }
      room.settings = { ...room.settings, ...(settings as any) };
      io.to(roomCode).emit("roomSettings", room.settings);
      io.to(roomCode).emit("systemMessage", "تم تحديث إعدادات الغرفة");
      resetReadyState(roomCode);
      emitRoomMeta(roomCode);
    });

    socket.on("updateTeamProfile", ({ roomCode, team, profile }: { roomCode: string; team: Team; profile: { name: string; color: string } }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "فقط مدير الغرفة يمكنه تعديل أسماء الفرق وألوانها."); return; }
      room.teams[team] = { name: profile.name.trim() || room.teams[team].name, color: profile.color };
      emitRoomMeta(roomCode);
      io.to(roomCode).emit("systemMessage", "تم تحديث هوية الفرق.");
    });

    socket.on("kickPlayer", ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لطرد اللاعبين"); return; }
      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx !== -1 && room.players[idx].id !== room.creatorId) {
        const kicked = room.players[idx];
        io.to(playerId).emit("kicked", "تم طردك من الغرفة من قبل المدير");
        io.sockets.sockets.get(playerId)?.leave(roomCode);
        room.players.splice(idx, 1);
        io.to(roomCode).emit("playersUpdate", room.players);
        io.to(roomCode).emit("systemMessage", `تم طرد ${kicked.name} من الغرفة`);
      }
    });

    socket.on("switchTeam", ({ roomCode, playerId, newTeam }: { roomCode: string; playerId: string; newTeam: Team }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتغيير الفرق"); return; }
      const player = room.players.find((p) => p.id === playerId);
      if (!player) return;
      const maxPerTeam = getTeamSize(room.gameMode);
      const teamCount = getTeamPlayers(room.players, newTeam).filter((p) => p.id !== player.id).length;
      if (teamCount >= maxPerTeam) { socket.emit("error", `لا يمكن إضافة لاعب جديد إلى ${room.teams[newTeam].name}.`); return; }
      player.team = newTeam;
      player.isReady = false;
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("systemMessage", `تم نقل ${player.name} إلى ${room.teams[newTeam].name}.`);
    });

    socket.on("changeGameMode", ({ roomCode, mode }: { roomCode: string; mode: "2v2" | "1v1" }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      room.gameMode = mode;
      io.to(roomCode).emit("gameModeChanged", mode);
      io.to(roomCode).emit("systemMessage", `تم تغيير وضع اللعبة إلى ${mode === "2v2" ? "2 ضد 2" : "1 ضد 1"}`);
      room.gameStarted = false;
      room.players.forEach((p) => (p.isReady = false));
      if (mode === "1v1") {
        const kept: Record<Team, number> = { teamA: 0, teamB: 0 };
        room.players.forEach((p) => {
          if (!p.team) return;
          kept[p.team] += 1;
          if (kept[p.team] > 1) p.team = null;
        });
      }
      io.to(roomCode).emit("playersUpdate", room.players);
      emitRoomMeta(roomCode);
    });

    socket.on("chooseTeam", ({ roomCode, team }: { roomCode: string; team: Team }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      const teamCount = room.players.filter((p) => p.team === team).length;
      const maxPerTeam = room.gameMode === "2v2" ? 2 : 1;
      if (teamCount >= maxPerTeam && player.team !== team) { socket.emit("error", "هذا الفريق ممتلئ"); return; }
      player.team = team;
      player.isReady = false;
      io.to(roomCode).emit("playersUpdate", room.players);
      maybeStartGame(roomCode);
    });

    socket.on("playerReady", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      if (!player.team) { socket.emit("error", "اختر فريقك أولًا قبل إعلان الجاهزية."); return; }
      player.isReady = true;
      io.to(roomCode).emit("playersUpdate", room.players);
      maybeStartGame(roomCode);
    });

    socket.on("forceStartGame", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      const reason = validateTeamSetup(roomCode);
      if (reason) { socket.emit("error", reason); return; }
      room.players.forEach((p) => (p.isReady = true));
      io.to(roomCode).emit("playersUpdate", room.players);
      startGame(roomCode);
    });

    // =================================================================
    // ROUND 1: Player-written answer
    // =================================================================
    socket.on("submitPlayerAnswer", ({ roomCode, answer }: { roomCode: string; answer: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
      const data = room.roundData as Round1Data;
      if (!data || data.type !== "round1") return;
      data.playerAnswers[socket.id] = answer.trim() || null;

      const allAnswered = room.players.every((p) => data.playerAnswers[p.id] !== null && data.playerAnswers[p.id] !== undefined);
      if (allAnswered) {
        if (suggestionTimers.has(roomCode)) {
          clearTimeout(suggestionTimers.get(roomCode)!);
          suggestionTimers.delete(roomCode);
        }
        finalizeRound1Options(roomCode);
      }
    });

    socket.on("submitPlayerChoice", ({ roomCode, choiceIndex }: { roomCode: string; choiceIndex: number }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
      const data = room.roundData as Round1Data;
      if (!data || data.type !== "round1") return;
      if (!data.options.length) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      if (data.playerChoices[socket.id] !== null && data.playerChoices[socket.id] !== undefined) return;

      const correct = data.questions[data.currentIndex].correct;
      const correctIndex = data.options.indexOf(correct);
      const isCorrect = choiceIndex === correctIndex;

      data.playerChoices[socket.id] = choiceIndex;

      io.to(roomCode).emit("round1ChoiceResult", {
        playerId: socket.id,
        playerName: player.name,
        team: player.team,
        choiceIndex,
        isCorrect,
        correctOptionIndex: correctIndex,
      });

      const allChosen = room.players.every((p) => data.playerChoices[p.id] !== null && data.playerChoices[p.id] !== undefined);
      if (allChosen) {
        proceedRound1AfterChoices(roomCode);
      }
    });

    // =================================================================
    // ROUND 2: Drawing
    // =================================================================
    socket.on("submitDrawing", ({ roomCode, drawingData }: { roomCode: string; drawingData: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 2) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getDrawActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") { socket.emit("error", "دور الرسم ليس لك في هذه الجولة."); return; }
      const data = room.roundData as Round2Data;
      data.drawings[team] = drawingData;
      io.to(roomCode).emit("drawingSubmitted", { team, playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب" });
      if (data.drawings.teamA && data.drawings.teamB) {
        emitGuessRound(roomCode);
      }
    });

    socket.on("submitGuess", ({ roomCode, guess }: { roomCode: string; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 2) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getGuessActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") { socket.emit("error", "دور التخمين ليس لك الآن."); return; }
      const data = room.roundData as Round2Data;
      if (data.guesses[team] !== null) return;
      const isCorrect = guess.trim() === data.word;
      data.guesses[team] = isCorrect;
      if (isCorrect) { if (team === "teamA") room.teamAScore += room.settings.drawingPoints; else room.teamBScore += room.settings.drawingPoints; }

      // Cancel guess timer if both have guessed
      if (data.guesses.teamA !== null && data.guesses.teamB !== null) {
        if (guessTimers.has(roomCode)) {
          clearTimeout(guessTimers.get(roomCode)!);
          guessTimers.delete(roomCode);
        }
        io.to(roomCode).emit("roundEnd", {
          round: 2,
          scores: {
            teamA: data.guesses.teamA ? room.settings.drawingPoints : 0,
            teamB: data.guesses.teamB ? room.settings.drawingPoints : 0,
          },
          totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
        });
        setTimeout(() => loadRound(roomCode, 3), 4000);
      }
      io.to(roomCode).emit("guessResult", { team, isCorrect, correctWord: data.word, playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب" });
    });

    // =================================================================
    // ROUND 3: Trivia (same system as Round 1)
    // =================================================================
    socket.on("submitPlayerAnswerRound3", ({ roomCode, answer }: { roomCode: string; answer: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 3) return;
      const data = room.roundData as Round3Data;
      if (!data || data.type !== "round3") return;
      data.playerAnswers[socket.id] = answer.trim() || null;

      const allAnswered = room.players.every((p) => data.playerAnswers[p.id] !== null && data.playerAnswers[p.id] !== undefined);
      if (allAnswered) {
        if (suggestionTimers.has(roomCode)) {
          clearTimeout(suggestionTimers.get(roomCode)!);
          suggestionTimers.delete(roomCode);
        }
        finalizeRound3Options(roomCode);
      }
    });

    socket.on("submitPlayerChoiceRound3", ({ roomCode, choiceIndex }: { roomCode: string; choiceIndex: number }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 3) return;
      const data = room.roundData as Round3Data;
      if (!data || data.type !== "round3") return;
      if (!data.options.length) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      if (data.playerChoices[socket.id] !== null && data.playerChoices[socket.id] !== undefined) return;

      const correct = data.questions[data.currentIndex].correct;
      const correctIndex = data.options.indexOf(correct);
      const isCorrect = choiceIndex === correctIndex;

      data.playerChoices[socket.id] = choiceIndex;

      io.to(roomCode).emit("round3ChoiceResult", {
        playerId: socket.id,
        playerName: player.name,
        team: player.team,
        choiceIndex,
        isCorrect,
        correctOptionIndex: correctIndex,
      });

      const allChosen = room.players.every((p) => data.playerChoices[p.id] !== null && data.playerChoices[p.id] !== undefined);
      if (allChosen) {
        proceedRound3AfterChoices(roomCode);
      }
    });

    // =================================================================
    // ROUND 4: Spy Master
    // =================================================================
    socket.on("submitSpyClue", ({ roomCode, clue }: { roomCode: string; clue: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getDrawActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") { socket.emit("error", "دور قائد الشفرة ليس لك الآن."); return; }
      const data = room.roundData as Round4Data;
      data.spyClues[team] = clue;
      io.to(roomCode).emit("spyClueSubmitted", { team, playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب" });
      if (data.spyClues.teamA && data.spyClues.teamB) {
        emitSpyGuessRound(roomCode);
      }
    });

    socket.on("submitSpyGuess", ({ roomCode, guess }: { roomCode: string; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getGuessActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") { socket.emit("error", "دور عميل التخمين ليس لك الآن."); return; }
      const data = room.roundData as Round4Data;
      if (data.guesses[team] !== null) return;
      const isCorrect = guess.trim() === data.word;
      data.guesses[team] = isCorrect;
      if (isCorrect) { if (team === "teamA") room.teamAScore += room.settings.spyPoints; else room.teamBScore += room.settings.spyPoints; }
      io.to(roomCode).emit("spyGuessResult", { team, isCorrect, correctWord: data.word, playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب" });
      if (data.guesses.teamA !== null && data.guesses.teamB !== null) {
        io.to(roomCode).emit("roundEnd", {
          round: 4,
          scores: {
            teamA: data.guesses.teamA ? room.settings.spyPoints : 0,
            teamB: data.guesses.teamB ? room.settings.spyPoints : 0,
          },
          totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
        });
        setTimeout(() => endGame(roomCode), 4000);
      }
    });

    // =================================================================
    // DISCONNECT
    // =================================================================
    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Player disconnected");
      const roomCode = playerRoomMap.get(socket.id);
      playerRoomMap.delete(socket.id);
      if (!roomCode) return;
      const room = getRoom(roomCode);
      if (!room) return;
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx === -1) return;
      const left = room.players[idx];
      room.players.splice(idx, 1);
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("systemMessage", `غادر ${left.name} الغرفة`);

      if (room.players.length === 0) {
        const timer = setTimeout(() => {
          const r = getRoom(roomCode);
          if (r && r.players.length === 0) {
            deleteRoom(roomCode);
            logger.info({ roomCode }, "Room deleted after grace period (empty)");
          }
          roomDeletionTimers.delete(roomCode);
        }, 60_000);
        roomDeletionTimers.set(roomCode, timer);
        return;
      }

      if (roomDeletionTimers.has(roomCode)) {
        clearTimeout(roomDeletionTimers.get(roomCode)!);
        roomDeletionTimers.delete(roomCode);
      }

      if (room.creatorId === socket.id && room.players.length > 0) {
        room.creatorId = room.players[0].id;
        room.players[0].isCreator = true;
        io.to(roomCode).emit("newCreator", room.players[0].id);
        io.to(roomCode).emit("systemMessage", `${room.players[0].name} هو المدير الجديد`);
        io.to(roomCode).emit("playersUpdate", room.players);
      }
      emitRoomMeta(roomCode);
    });
  });
}
