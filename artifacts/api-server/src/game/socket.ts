import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { logger } from "../lib/logger";
import { createRoom, getRoom, deleteRoom, generateRoomCode } from "./rooms";
import {
  footballQuestions,
  triviaQuestions,
  drawingWords,
  codenamesWords,
  shuffle,
} from "./questions";
import type { Player, Round1Data, Round2Data, Round3Data, Round4Data, Team, GameMode } from "./types";

const TEAM_KEYS: Team[] = ["teamA", "teamB"];

function getPlayersNeeded(mode: GameMode): number {
  return mode.type === "1v1" ? 2 : mode.teamSize * 2;
}

function getTeamSize(mode: GameMode): number {
  return mode.type === "1v1" ? 1 : mode.teamSize;
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
      return `اللعبة تحتاج ${requiredPlayers} لاعبين (${requiredPerTeam} لكل فريق). (${room.players.length}/${requiredPlayers})`;
    }

    for (const team of TEAM_KEYS) {
      const teamPlayers = getTeamPlayers(room.players, team);
      if (teamPlayers.length !== requiredPerTeam) {
        return `${room.teams[team].name} يحتاج ${requiredPerTeam} ${requiredPerTeam === 1 ? "لاعب" : "لاعبين"}.`;
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

  function getDrawActor(roomCode: string, team: Team): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return getTeamPlayers(room.players, team)[0] ?? null;
  }

  function getGuessActor(roomCode: string, team: Team): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    const players = getTeamPlayers(room.players, team);
    return players[1 % players.length] ?? null;
  }

  function getSecondActor(roomCode: string, team: Team): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    const players = getTeamPlayers(room.players, team);
    return players[players.length > 1 ? 1 : 0] ?? null;
  }

  function getCodenamesRoles(roomCode: string, team: Team) {
    const room = getRoom(roomCode);
    if (!room) return { clueGiver: null, fieldAgent: null };
    if (room.gameMode.type === "1v1") {
      const player = getTeamPlayers(room.players, team)[0] ?? null;
      return { clueGiver: player, fieldAgent: player };
    }
    const players = getTeamPlayers(room.players, team);
    const clueGiver = players[0] ?? null;
    const fieldAgent = players[players.length > 1 ? 1 : 0] ?? null;
    return { clueGiver, fieldAgent };
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
        word: player.id === drawActor?.id || room.gameMode.type === "1v1" ? data.word : null,
        wordLength: data.wordLength,
        canDraw: player.id === drawActor?.id || room.gameMode.type === "1v1",
        role: player.id === drawActor?.id ? "drawer" : player.id === guessActor?.id ? "guesser" : "spectator",
        teammateName: player.id === drawActor?.id ? guessActor?.name : drawActor?.name,
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
        canGuess: player.id === guessActor?.id || room.gameMode.type === "1v1",
        role: player.id === guessActor?.id ? "guesser" : player.id === drawActor?.id ? "drawer" : "spectator",
        teammateName: player.id === guessActor?.id ? drawActor?.name : guessActor?.name,
      });
    });

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

    // Delay to ensure client components mount and register listeners
    setTimeout(() => {
      if (round === 1) loadRound1(roomCode);
      else if (round === 2) loadRound2(roomCode);
      else if (round === 3) loadRound3(roomCode);
      else if (round === 4) loadRound4(roomCode);
      else endGame(roomCode);
    }, 600);
  }

  // =================================================================
  // ROUND 1: Football Trivia
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

    const initialAnswers: Record<string, string | null> = {};
    room.players.forEach((p) => { initialAnswers[p.id] = null; });
    data.playerAnswers = initialAnswers;
    data.options = [];
    data.playerChoices = {};

    io.to(roomCode).emit("showQuestion", {
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
      finalizeRound1Options(roomCode);
    }, room.settings.questionTimeLimit * 1000));
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
    const extra = ["مورينيو", "رونالدو", "مبابي", "ليفاندوفسكي", "أغويرو", "مالديني", "صلاح", "نيمار"];
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

    io.to(roomCode).emit("showRound1Options", {
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
      const d = r.roundData as Round1Data;
      const correctIndex = d.options.indexOf(d.questions[d.currentIndex].correct);
      for (const p of r.players) {
        if (d.playerChoices[p.id] === null || d.playerChoices[p.id] === undefined) {
          d.playerChoices[p.id] = -1;
          io.to(roomCode).emit("round1ChoiceResult", { playerId: p.id, playerName: p.name, team: p.team, choiceIndex: -1, isCorrect: false, correctOptionIndex: correctIndex });
        }
      }
      if (r.players.every((pl) => d.playerChoices[pl.id] !== null && d.playerChoices[pl.id] !== undefined)) {
        proceedRound1AfterChoices(roomCode);
      }
    }, room.settings.questionTimeLimit * 1000));
  }

  function proceedRound1AfterChoices(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round1Data;
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
  // ROUND 2: Drawing & Guessing
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
  // ROUND 3: General Trivia
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
    }, room.settings.questionTimeLimit * 1000));
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
    const extra = ["توتانخامون", "أفريقيا", "مشهور", "معروف", "قديم", "حديث"];
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
    }, room.settings.questionTimeLimit * 1000));
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
  // ROUND 4: Full Codenames (5x5 grid)
  // =================================================================
  function loadRound4(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;

    if (room.gameMode.type === "1v1") {
      loadRound4Solo(roomCode);
      return;
    }

    // Generate 5x5 grid
    const pool = shuffle(codenamesWords).slice(0, 25);
    const grid: string[][] = [];
    for (let r = 0; r < 5; r++) {
      grid.push(pool.slice(r * 5, (r + 1) * 5));
    }

    // Assign cards: 9 teamA, 8 teamB, 7 neutral, 1 assassin
    const allPositions: { row: number; col: number }[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        allPositions.push({ row: r, col: c });
      }
    }
    const shuffled = shuffle(allPositions);

    const teamACards = shuffled.slice(0, 9);
    const teamBCards = shuffled.slice(9, 17);
    const neutralCards = shuffled.slice(17, 24);
    const assassinCard = shuffled[24]!;

    room.roundData = {
      type: "round4",
      grid,
      teamACards,
      teamBCards,
      neutralCards,
      assassinCard,
      revealed: [],
      clueGivers: { teamA: null, teamB: null },
      clues: { teamA: null, teamB: null },
      guessedTeam: { teamA: false, teamB: false },
      currentTurn: null,
      isSolo: false,
      teamAscores: 0,
      teamBscores: 0,
      totalCardsA: teamACards.length,
      totalCardsB: teamBCards.length,
    } as Round4Data;

    emitCodenamesGrid(roomCode);
  }

  function loadRound4Solo(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;

    const selected = codenamesWords[Math.floor(Math.random() * codenamesWords.length)] ?? "نور";
    room.roundData = {
      type: "round4",
      grid: [[selected]],
      teamACards: [{ row: 0, col: 0 }],
      teamBCards: [],
      neutralCards: [],
      assassinCard: { row: -1, col: -1 },
      revealed: [],
      clueGivers: { teamA: null, teamB: null },
      clues: { teamA: null, teamB: null },
      guessedTeam: { teamA: false, teamB: false },
      currentTurn: null,
      isSolo: true,
      teamAscores: 0,
      teamBscores: 0,
      totalCardsA: 1,
      totalCardsB: 0,
    } as Round4Data;
    emitCodenamesGrid(roomCode);
  }

  function emitCodenamesGrid(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round4Data;

    room.players.forEach((player) => {
      const team = player.team;
      if (!team) return;
      const { clueGiver, fieldAgent } = getCodenamesRoles(roomCode, team);
      const isSolo = data.isSolo;
      const isClueGiver = player.id === clueGiver?.id;

      // Clue giver sees the full board with card assignments
      // Field agent sees just the grid without assignments
      const cardMap = new Map<string, "teamA" | "teamB" | "neutral" | "assassin">();
      data.teamACards.forEach((c) => cardMap.set(`${c.row},${c.col}`, "teamA"));
      data.teamBCards.forEach((c) => cardMap.set(`${c.row},${c.col}`, "teamB"));
      data.neutralCards.forEach((c) => cardMap.set(`${c.row},${c.col}`, "neutral"));
      cardMap.set(`${data.assassinCard.row},${data.assassinCard.col}`, "assassin");

      const revealedSet = new Set(data.revealed.map((c) => `${c.row},${c.col}`));

      if (isSolo) {
        // In 1v1 mode, both players see everything
        const canClue = player.id === clueGiver?.id;
        io.to(player.id).emit("startCodenamesGrid", {
          grid: data.grid,
          cardMap: Object.fromEntries(cardMap),
          revealed: data.revealed,
          teamACards: data.teamACards,
          teamBCards: data.teamBCards,
          canClue,
          clue: data.clues[team] ?? null,
          isClueGiver: canClue,
          isFieldAgent: canClue,
          teamsCards: {
            teamA: data.totalCardsA - data.revealed.filter((c) => data.teamACards.some((tc) => tc.row === c.row && tc.col === c.col)).length,
            teamB: data.totalCardsB - data.revealed.filter((c) => data.teamBCards.some((tc) => tc.row === c.row && tc.col === c.col)).length,
          },
        });
        return;
      }

      io.to(player.id).emit("startCodenamesGrid", {
        grid: data.grid,
        cardMap: isClueGiver ? Object.fromEntries(cardMap) : {},
        revealed: data.revealed,
        teamACards: isClueGiver ? data.teamACards : [],
        teamBCards: isClueGiver ? data.teamBCards : [],
        canClue: isClueGiver,
        clue: data.clues[team] ?? null,
        isClueGiver,
        isFieldAgent: player.id === fieldAgent?.id,
        teamsCards: {
          teamA: data.totalCardsA - data.revealed.filter((c) => data.teamACards.some((tc) => tc.row === c.row && tc.col === c.col)).length,
          teamB: data.totalCardsB - data.revealed.filter((c) => data.teamBCards.some((tc) => tc.row === c.row && tc.col === c.col)).length,
        },
      });
    });
  }

  function handleCodenamesClue(roomCode: string, socketId: string, clue: string) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 4) return;
    const data = room.roundData as Round4Data;
    const team = getTeamFromSocket(roomCode, socketId);
    if (!team) return;
    const { clueGiver } = getCodenamesRoles(roomCode, team);
    if (socketId !== clueGiver?.id && !data.isSolo) return;

    if (!data.isSolo && data.clues[team] !== null) return;

    data.clues[team] = clue;
    data.clueGivers[team] = socketId;
    io.to(roomCode).emit("codenamesClue", { team, clue });

    // If both clues are in, start the game
    if (data.clues.teamA !== null && data.clues.teamB !== null) {
      data.currentTurn = "teamA";
      io.to(roomCode).emit("codenamesTurn", { team: "teamA" });
    }
  }

  function handleCodenamesPick(roomCode: string, socketId: string, row: number, col: number) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 4) return;
    const data = room.roundData as Round4Data;
    const team = getTeamFromSocket(roomCode, socketId);
    if (!team) return;

    if (data.isSolo) {
      handleSoloCodenamesPick(roomCode, socketId, row, col);
      return;
    }

    // Only field agent can pick (or any non-clue-giver in team mode)
    const { clueGiver, fieldAgent } = getCodenamesRoles(roomCode, team);
    if (socketId === clueGiver?.id) return;

    if (data.currentTurn !== team) {
      io.to(socketId).emit("systemMessage", "ليس دور فريقك الآن");
      return;
    }

    // Check if already revealed
    if (data.revealed.some((c) => c.row === row && c.col === col)) return;

    data.revealed.push({ row, col });

    // Determine what was picked
    const isTeamA = data.teamACards.some((c) => c.row === row && c.col === col);
    const isTeamB = data.teamBCards.some((c) => c.row === row && c.col === col);
    const isNeutral = data.neutralCards.some((c) => c.row === row && c.col === col);
    const isAssassin = data.assassinCard.row === row && data.assassinCard.col === col;

    if (isAssassin) {
      // Assassin! This team loses
      io.to(roomCode).emit("codenamesPickResult", {
        row,
        col,
        type: "assassin",
        team,
        word: data.grid[row]?.[col],
      });
      // Assassin gives bonus to other team
      if (team === "teamA") {
        room.teamBScore += room.settings.codenamesBonus * 2;
      } else {
        room.teamAScore += room.settings.codenamesBonus * 2;
      }
      finishRound4(roomCode);
      return;
    }

    if (isTeamA) {
      data.teamAscores++;
      io.to(roomCode).emit("codenamesPickResult", {
        row,
        col,
        type: "teamA",
        team,
        word: data.grid[row]?.[col],
      });
      // Check if team A found all their cards
      if (data.teamAscores >= data.totalCardsA) {
        room.teamAScore += room.settings.codenamesBonus * 3;
        io.to(roomCode).emit("codenamesGameOver", { winner: "teamA" });
        finishRound4(roomCode);
        return;
      }
    } else if (isTeamB) {
      data.teamBscores++;
      io.to(roomCode).emit("codenamesPickResult", {
        row,
        col,
        type: "teamB",
        team,
        word: data.grid[row]?.[col],
      });
      if (data.teamBscores >= data.totalCardsB) {
        room.teamBScore += room.settings.codenamesBonus * 3;
        io.to(roomCode).emit("codenamesGameOver", { winner: "teamB" });
        finishRound4(roomCode);
        return;
      }
      // If team A picked team B's card, switch turn
      if (team === "teamA") {
        data.currentTurn = "teamB";
        io.to(roomCode).emit("codenamesTurn", { team: "teamB" });
        return;
      }
    } else if (isNeutral) {
      io.to(roomCode).emit("codenamesPickResult", {
        row,
        col,
        type: "neutral",
        team,
        word: data.grid[row]?.[col],
      });
      // Neutral card = turn passes
      const nextTeam = team === "teamA" ? "teamB" : "teamA";
      data.currentTurn = nextTeam;
      io.to(roomCode).emit("codenamesTurn", { team: nextTeam });
      return;
    }

    // Correct pick - same team continues
    if (!isAssassin) {
      const remainingTeamA = data.totalCardsA - data.teamAscores;
      const remainingTeamB = data.totalCardsB - data.teamBscores;
      if (remainingTeamA <= 0) {
        room.teamAScore += room.settings.codenamesBonus * 3;
        io.to(roomCode).emit("codenamesGameOver", { winner: "teamA" });
        finishRound4(roomCode);
        return;
      }
      if (remainingTeamB <= 0) {
        room.teamBScore += room.settings.codenamesBonus * 3;
        io.to(roomCode).emit("codenamesGameOver", { winner: "teamB" });
        finishRound4(roomCode);
        return;
      }
    }
  }

  function handleSoloCodenamesPick(roomCode: string, socketId: string, _row: number, _col: number) {
    const room = getRoom(roomCode);
    if (!room) return;
    const data = room.roundData as Round4Data;
    const team = getTeamFromSocket(roomCode, socketId);
    if (!team) return;
    if (data.guessedTeam[team]) return;

    if (data.clues[team] !== null && data.clues[team] === socketId) return;

    data.guessedTeam[team] = true;

    const isCorrect = data.clues[team] === data.clues[team === "teamA" ? "teamB" : "teamA"];
    // Actually for solo mode, just check if they guess the word from the opponent's clue
    io.to(roomCode).emit("spyGuessResult", { team, isCorrect: false, correctWord: data.grid[0]?.[0] ?? "" });

    if (data.guessedTeam.teamA && data.guessedTeam.teamB) {
      finishRound4(roomCode);
    }
  }

  function finishRound4(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;

    // Calculate remaining bonuses
    const data = room.roundData as Round4Data;

    // Points from correct guesses
    room.teamAScore += data.teamAscores * room.settings.codenamesBonus;
    room.teamBScore += data.teamBscores * room.settings.codenamesBonus;

    io.to(roomCode).emit("roundEnd", {
      round: 4,
      scores: {
        teamA: data.teamAscores * room.settings.codenamesBonus,
        teamB: data.teamBscores * room.settings.codenamesBonus,
      },
      totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
    });
    setTimeout(() => endGame(roomCode), 4000);
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
      if (room.players.length >= maxPlayers) { socket.emit("error", `الغرفة ممتلئة (${maxPlayers} لاعبين)`); return; }

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

    socket.on("changeGameMode", ({ roomCode, mode }: { roomCode: string; mode: { type: "team" | "1v1"; teamSize: number } }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      room.gameMode = mode;
      const modeLabel = mode.type === "1v1" ? "1 ضد 1" : `${mode.teamSize} ضد ${mode.teamSize}`;
      io.to(roomCode).emit("gameModeChanged", mode);
      io.to(roomCode).emit("systemMessage", `تم تغيير وضع اللعبة إلى ${modeLabel}`);
      room.gameStarted = false;
      room.players.forEach((p) => (p.isReady = false));

      // Trim extra players if needed
      const maxPlayers = getPlayersNeeded(mode);
      while (room.players.length > maxPlayers) {
        const removed = room.players.pop()!;
        io.to(removed.id).emit("kicked", "تم إخراجك من الغرفة بسبب تغيير عدد اللاعبين");
        io.sockets.sockets.get(removed.id)?.leave(roomCode);
      }

      if (mode.type === "1v1") {
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
      const maxPerTeam = getTeamSize(room.gameMode);
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
      if (getDrawActor(roomCode, team)?.id !== socket.id && room.gameMode.type !== "1v1") { socket.emit("error", "دور الرسم ليس لك في هذه الجولة."); return; }
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
      if (getGuessActor(roomCode, team)?.id !== socket.id && room.gameMode.type !== "1v1") { socket.emit("error", "دور التخمين ليس لك الآن."); return; }
      const data = room.roundData as Round2Data;
      if (data.guesses[team] !== null) return;
      const isCorrect = guess.trim() === data.word;
      data.guesses[team] = isCorrect;
      if (isCorrect) { if (team === "teamA") room.teamAScore += room.settings.drawingPoints; else room.teamBScore += room.settings.drawingPoints; }

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
    // ROUND 4: Codenames
    // =================================================================
    socket.on("submitCodenamesClue", ({ roomCode, clue }: { roomCode: string; clue: string }) => {
      handleCodenamesClue(roomCode, socket.id, clue);
    });

    socket.on("submitCodenamesPick", ({ roomCode, row, col }: { roomCode: string; row: number; col: number }) => {
      handleCodenamesPick(roomCode, socket.id, row, col);
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
