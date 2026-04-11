
import type { Server as HttpServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { logger } from "../lib/logger";
import { createRoom, getRoom, deleteRoom, generateRoomCode } from "./rooms";
import {
  sportsQuestions,
  weirdQuestions,
  drawingWords,
  spyWords,
  fakeAnswers,
  shuffle,
} from "./questions";
import type { Round1Data, Round2Data, Round3Data, Round4Data } from "./types";
import { createRoom, deleteRoom, generateRoomCode, getRoom } from "./rooms";
import { drawingWords, fakeAnswers, shuffle, sportsQuestions, spyWords, weirdQuestions } from "./questions";
import type { Player, Round1Data, Round2Data, Round3Data, Round4Data, Team, TeamProfile } from "./types";

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

function getRoundActor(roomCode: string, teamPlayers: Player[], index: number): Player | null {
  if (teamPlayers.length === 0) return null;
  return teamPlayers[index % teamPlayers.length] ?? null;
}

export function initSocketServer(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {

  const playerRoomMap = new Map<string, string>();

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
    room.players.forEach((player) => {
      player.isReady = false;
    });
    io.to(roomCode).emit("playersUpdate", room.players);
  }

  function validateRoomForStart(roomCode: string): string | null {
    const room = getRoom(roomCode);
    if (!room) return "الغرفة غير موجودة";

    const requiredPlayers = getPlayersNeeded(room.gameMode);
    const requiredPerTeam = getTeamSize(room.gameMode);

    if (room.players.length !== requiredPlayers) {
      return room.gameMode === "2v2"
        ? "نمط 2 ضد 2 يحتاج أربعة لاعبين قبل البدء."
        : "نمط 1 ضد 1 يحتاج لاعبين اثنين فقط قبل البدء.";
    }

    for (const team of TEAM_KEYS) {
      const teamPlayers = getTeamPlayers(room.players, team);
      if (teamPlayers.length !== requiredPerTeam) {
        return `${room.teams[team].name} يحتاج ${requiredPerTeam} ${requiredPerTeam === 1 ? "لاعب" : "لاعبين"} قبل البدء.`;
      }
    }

    if (room.players.some((player) => !player.team)) {
      return "يجب توزيع جميع اللاعبين على الفرق قبل البدء.";
    }

    if (room.players.some((player) => !player.isReady)) {
      return "يجب أن يعلن جميع اللاعبين جاهزيتهم قبل البدء.";
    }

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

    const everyoneReady = room.players.length > 0 && room.players.every((player) => player.isReady);
    if (everyoneReady) {
      io.to(roomCode).emit("systemMessage", reason);
    }
  }

  function getPlayerOrNull(roomCode: string, socketId: string): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return room.players.find((player) => player.id === socketId) ?? null;
  }

  function getTeamFromSocket(roomCode: string, socketId: string): Team | null {
    const player = getPlayerOrNull(roomCode, socketId);
    return player?.team ?? null;
  }

  function getQuestionActor(roomCode: string, team: Team, questionIndex: number): Player | null {
    const room = getRoom(roomCode);
    if (!room) return null;
    return getRoundActor(roomCode, getTeamPlayers(room.players, team), questionIndex);
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

  function loadRound1(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.roundData = {
      type: "round1",
      questions: shuffle(sportsQuestions).slice(0, 4),
      currentIndex: 0,
      answers: { teamA: null, teamB: null },
      scores: { teamA: 0, teamB: 0 },
    } satisfies Round1Data;
    sendRound1Question(roomCode);
  }

  function sendRound1Question(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 1) return;
    const data = room.roundData as Round1Data;
    const question = data.questions[data.currentIndex];
    if (!question) return;
    io.to(roomCode).emit("showQuestion", {
      question,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
      activePlayers: {
        teamA: getQuestionActor(roomCode, "teamA", data.currentIndex)?.id ?? null,
        teamB: getQuestionActor(roomCode, "teamB", data.currentIndex)?.id ?? null,
      },
    });
  }

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
    } satisfies Round2Data;
    emitDrawingRound(roomCode);
  }

  function loadRound3(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room) return;
    room.roundData = {
      type: "round3",
      questions: shuffle(weirdQuestions).slice(0, 4),
      currentIndex: 0,
      answers: { teamA: null, teamB: null },
      scores: { teamA: 0, teamB: 0 },
      currentOptions: [],
    } satisfies Round3Data;
    sendRound3Question(roomCode);
  }

  function sendRound3Question(roomCode: string) {
    const room = getRoom(roomCode);
    if (!room || room.currentRound !== 3) return;
    const data = room.roundData as Round3Data;
    const question = data.questions[data.currentIndex];
    if (!question) return;
    const options = shuffle([question.correct, ...shuffle(fakeAnswers).slice(0, 3)]);
    data.currentOptions = options;
    data.answers = { teamA: null, teamB: null };
    io.to(roomCode).emit("showWeirdQuestion", {
      question,
      options,
      questionNumber: data.currentIndex + 1,
      totalQuestions: data.questions.length,
      activePlayers: {
        teamA: getQuestionActor(roomCode, "teamA", data.currentIndex)?.id ?? null,
        teamB: getQuestionActor(roomCode, "teamB", data.currentIndex)?.id ?? null,
      },
    });
  }

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
    } satisfies Round4Data;
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
    room.players.forEach((player) => {
      player.isReady = false;
    });
    io.to(roomCode).emit("playersUpdate", room.players);
  }

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Player connected");

      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomCreated", { roomCode, playerId: socket.id, isCreator: true });
      const room = getRoom(roomCode)!;
      const room = getRoom(roomCode);
      if (!room) return;
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("roomSettings", room.settings);
      emitRoomMeta(roomCode);
    });

    socket.on("joinRoom", ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = getRoom(roomCode);
      if (!room) { socket.emit("error", "الغرفة غير موجودة"); return; }
      if (room.players.length >= 4) { socket.emit("error", "الغرفة ممتلئة"); return; }
      if (!room) {
        socket.emit("error", "الغرفة غير موجودة");
        return;
      }
      if (room.players.length >= 4) {
        socket.emit("error", "الغرفة ممتلئة");
        return;
      }

      room.players.push({ id: socket.id, name: playerName, team: null, isReady: false, isCreator: false });
      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomJoined", { roomCode, playerId: socket.id, isCreator: false });
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("roomSettings", room.settings);
      emitRoomMeta(roomCode);
    });

    socket.on("checkRoom", (roomCode: string, callback: (r: { exists: boolean; playerCount: number }) => void) => {
    socket.on("checkRoom", (roomCode: string, callback: (response: { exists: boolean; playerCount: number }) => void) => {
      const room = getRoom(roomCode);
      callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    socket.on("updateSettings", ({ roomCode, settings }: { roomCode: string; settings: Record<string, number> }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتعديل الإعدادات"); return; }
      if (!room || room.creatorId !== socket.id) {
        socket.emit("error", "ليس لديك صلاحية لتعديل الإعدادات");
        return;
      }

      room.settings = { ...room.settings, ...settings };
      io.to(roomCode).emit("roomSettings", room.settings);
      io.to(roomCode).emit("systemMessage", "تم تحديث إعدادات الغرفة");
      resetReadyState(roomCode);
      emitRoomMeta(roomCode);
      io.to(roomCode).emit("systemMessage", "تم تحديث إعدادات اللعبة وإعادة ضبط الجاهزية.");
    });

    socket.on("updateTeamProfile", ({ roomCode, team, profile }: { roomCode: string; team: Team; profile: TeamProfile }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) {
        socket.emit("error", "فقط مدير الغرفة يمكنه تعديل أسماء الفرق وألوانها.");
        return;
      }
      room.teams[team] = {
        name: profile.name.trim() || room.teams[team].name,
        color: profile.color,
      };
      emitRoomMeta(roomCode);
      io.to(roomCode).emit("systemMessage", "تم تحديث هوية الفرق.");
    });

    socket.on("kickPlayer", ({ roomCode, playerId }: { roomCode: string; playerId: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لطرد اللاعبين"); return; }
      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx !== -1 && room.players[idx]!.id !== room.creatorId) {
        const kicked = room.players[idx]!;
        io.to(playerId).emit("kicked", "تم طردك من الغرفة من قبل المدير");
        io.sockets.sockets.get(playerId)?.leave(roomCode);
        room.players.splice(idx, 1);
        io.to(roomCode).emit("playersUpdate", room.players);
        io.to(roomCode).emit("systemMessage", `تم طرد ${kicked.name} من الغرفة`);
      if (!room || room.creatorId !== socket.id) {
        socket.emit("error", "ليس لديك صلاحية لطرد اللاعبين");
        return;
      }
      const index = room.players.findIndex((player) => player.id === playerId);
      if (index === -1 || room.players[index]?.id === room.creatorId) return;

      const kickedPlayer = room.players[index];
      io.to(playerId).emit("kicked");
      io.sockets.sockets.get(playerId)?.leave(roomCode);
      room.players.splice(index, 1);
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("systemMessage", `تم طرد ${kickedPlayer?.name ?? "لاعب"} من الغرفة.`);
    });

    socket.on("switchTeam", ({ roomCode, playerId, newTeam }: { roomCode: string; playerId: string; newTeam: "teamA" | "teamB" }) => {
    socket.on("switchTeam", ({ roomCode, playerId, newTeam }: { roomCode: string; playerId: string; newTeam: Team }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتغيير الفرق"); return; }
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.team = newTeam;
        io.to(roomCode).emit("playersUpdate", room.players);
        io.to(roomCode).emit("systemMessage", `تم نقل ${player.name} إلى فريق ${newTeam === "teamA" ? "النور" : "الظلام"}`);
      if (!room || room.creatorId !== socket.id) {
        socket.emit("error", "ليس لديك صلاحية لتغيير الفرق");
        return;
      }

      const player = room.players.find((item) => item.id === playerId);
      if (!player) return;

      const maxPerTeam = getTeamSize(room.gameMode);
      const teamCount = getTeamPlayers(room.players, newTeam).filter((item) => item.id !== player.id).length;
      if (teamCount >= maxPerTeam) {
        socket.emit("error", `لا يمكن إضافة لاعب جديد إلى ${room.teams[newTeam].name}.`);
        return;
      }

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
      room.players.forEach((player) => {
        player.isReady = false;
      });

      if (mode === "1v1") {
        const kept = { teamA: 0, teamB: 0 } as Record<Team, number>;
        room.players.forEach((player) => {
          if (!player.team) return;
          kept[player.team] += 1;
          if (kept[player.team] > 1) {
            player.team = null;
          }
        });
      }

      io.to(roomCode).emit("playersUpdate", room.players);
      emitRoomMeta(roomCode);
      io.to(roomCode).emit(
        "systemMessage",
        mode === "2v2"
          ? "تم التحويل إلى 2 ضد 2. وزّع اللاعبين على فريقين ثم أعلنوا الجاهزية."
          : "تم التحويل إلى 1 ضد 1. بقي لاعب واحد فقط في كل فريق وتمت إعادة ضبط الجاهزية.",
      );
    });

    socket.on("chooseTeam", ({ roomCode, team }: { roomCode: string; team: "teamA" | "teamB" }) => {
    socket.on("chooseTeam", ({ roomCode, team }: { roomCode: string; team: Team }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        const teamCount = room.players.filter((p) => p.team === team).length;
        const maxPerTeam = room.gameMode === "2v2" ? 2 : 1;
        if (teamCount >= maxPerTeam && player.team !== team) { socket.emit("error", "هذا الفريق ممتلئ"); return; }
        player.team = team;
        io.to(roomCode).emit("playersUpdate", room.players);

      const player = room.players.find((item) => item.id === socket.id);
      if (!player) return;

      const maxPerTeam = getTeamSize(room.gameMode);
      const teamCount = getTeamPlayers(room.players, team).filter((item) => item.id !== player.id).length;
      if (teamCount >= maxPerTeam) {
        socket.emit("error", `${room.teams[team].name} ممتلئ حاليًا.`);
        return;
      }

      player.team = team;
      player.isReady = false;
      io.to(roomCode).emit("playersUpdate", room.players);
    });

    socket.on("playerReady", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        player.isReady = true;
        io.to(roomCode).emit("playersUpdate", room.players);
        const playersNeeded = room.gameMode === "2v2" ? 4 : 2;
        const allReady = room.players.length >= playersNeeded && room.players.every((p) => p.isReady);
        if (allReady) startGame(roomCode);
      const player = room.players.find((item) => item.id === socket.id);
      if (!player) return;
      if (!player.team) {
        socket.emit("error", "اختر فريقك أولًا قبل إعلان الجاهزية.");
        return;
      }

      player.isReady = true;
      io.to(roomCode).emit("playersUpdate", room.players);
      maybeStartGame(roomCode);
    });

    socket.on("forceStartGame", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      if (room.players.length >= 2) {
        startGame(roomCode);
      } else {
        socket.emit("error", "يجب وجود لاعبين على الأقل لبدء اللعبة");

      const reason = validateRoomForStart(roomCode);
      if (reason) {
        socket.emit("error", reason);
        return;
      }
      startGame(roomCode);
    });

    function startGame(roomCode: string) {
      const room = getRoom(roomCode);
      if (!room) return;
      room.currentRound = 1;
      room.teamAScore = 0;
      room.teamBScore = 0;
      io.to(roomCode).emit("gameStarted", { room });
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
      });
      if (round === 1) loadRound1(roomCode);
      else if (round === 2) loadRound2(roomCode);
      else if (round === 3) loadRound3(roomCode);
      else if (round === 4) loadRound4(roomCode);
      else endGame(roomCode);
    }

    function loadRound1(roomCode: string) {
      const room = getRoom(roomCode);
      if (!room) return;
      const questions = shuffle(sportsQuestions).slice(0, 4);
      room.roundData = {
        type: "round1",
        questions,
        currentIndex: 0,
        answers: { teamA: null, teamB: null },
        scores: { teamA: 0, teamB: 0 },
      } as Round1Data;
      sendRound1Question(roomCode);
    }

    function sendRound1Question(roomCode: string) {
    socket.on("submitAnswer", ({ roomCode, answerIndex }: { roomCode: string; answerIndex: number }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      const data = room.roundData as Round1Data;
      const q = data.questions[data.currentIndex]!;
      io.to(roomCode).emit("showQuestion", {
        round: 1,
        question: q,
        questionNumber: data.currentIndex + 1,
        totalQuestions: data.questions.length,
      });
      data.answers = { teamA: null, teamB: null };
    }
      const expectedPlayerId = getQuestionActor(roomCode, team, data.currentIndex)?.id;
      if (expectedPlayerId !== socket.id) {
        socket.emit("error", "ليس دورك للإجابة الآن.");
        return;
      }
      if (data.answers[team] !== null) return;

    socket.on("submitAnswer", ({ roomCode, team, answerIndex }: { roomCode: string; team: "teamA" | "teamB"; answerIndex: number }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
      const data = room.roundData as Round1Data;
      const q = data.questions[data.currentIndex]!;
      const isCorrect = answerIndex === q.correct;
      const question = data.questions[data.currentIndex];
      if (!question) return;
      const isCorrect = answerIndex === question.correct;
      data.answers[team] = isCorrect;
      if (isCorrect) data.scores[team] += room.settings.pointsPerCorrect;

      if (data.answers[team] === null) {
        data.answers[team] = isCorrect;
        if (isCorrect) data.scores[team] += room.settings.pointsPerCorrect;
        io.to(roomCode).emit("teamAnswered", { team, isCorrect });
      io.to(roomCode).emit("teamAnswered", {
        team,
        isCorrect,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

        if (data.answers.teamA !== null && data.answers.teamB !== null) {
          data.currentIndex++;
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
            setTimeout(() => sendRound1Question(roomCode), 2500);
          }
      if (data.answers.teamA !== null && data.answers.teamB !== null) {
        data.currentIndex += 1;
        if (data.currentIndex >= data.questions.length) {
          room.teamAScore += data.scores.teamA;
          room.teamBScore += data.scores.teamB;
          io.to(roomCode).emit("roundEnd", {
            round: 1,
            scores: data.scores,
            totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
            winner:
              data.scores.teamA === data.scores.teamB
                ? "تعادل"
                : data.scores.teamA > data.scores.teamB
                  ? room.teams.teamA.name
                  : room.teams.teamB.name,
          });
          setTimeout(() => loadRound(roomCode, 2), 4500);
        } else {
          setTimeout(() => sendRound1Question(roomCode), 2200);
        }
      }
    });

    function loadRound2(roomCode: string) {
    socket.on("submitDrawing", ({ roomCode, drawingData }: { roomCode: string; drawingData: string }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const word = drawingWords[Math.floor(Math.random() * drawingWords.length)]!;
      room.roundData = {
        type: "round2",
        word,
        drawings: { teamA: null, teamB: null },
        guesses: { teamA: null, teamB: null },
        wordLength: word.length,
      } as Round2Data;
      io.to(roomCode).emit("startDrawing", { word, wordLength: word.length });
    }

    socket.on("submitDrawing", ({ roomCode, team, drawingData }: { roomCode: string; team: "teamA" | "teamB"; drawingData: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 2) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getDrawActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") {
        socket.emit("error", "دور الرسم ليس لك في هذه الجولة.");
        return;
      }

      const data = room.roundData as Round2Data;
      data.drawings[team] = drawingData;
      io.to(roomCode).emit("drawingSubmitted", { team });
      io.to(roomCode).emit("drawingSubmitted", {
        team,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

      if (data.drawings.teamA && data.drawings.teamB) {
        io.to(roomCode).emit("showGuesses", {
          drawingA: data.drawings.teamA,
          drawingB: data.drawings.teamB,
          wordLength: data.wordLength,
        });
        emitGuessRound(roomCode);
      }
    });

    socket.on("submitGuess", ({ roomCode, team, guess }: { roomCode: string; team: "teamA" | "teamB"; guess: string }) => {
    socket.on("submitGuess", ({ roomCode, guess }: { roomCode: string; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 2) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getGuessActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") {
        socket.emit("error", "دور التخمين ليس لك الآن.");
        return;
      }

      const data = room.roundData as Round2Data;
      if (data.guesses[team] !== null) return;
      const isCorrect = guess.trim() === data.word;
      data.guesses[team] = isCorrect;
      if (isCorrect) {
        if (team === "teamA") room.teamAScore += room.settings.drawingPoints;
        else room.teamBScore += room.settings.drawingPoints;
      }

      if (data.guesses[team] === null) {
        data.guesses[team] = isCorrect;
        if (isCorrect) {
          if (team === "teamA") room.teamAScore += room.settings.drawingPoints;
          else room.teamBScore += room.settings.drawingPoints;
        }
        io.to(roomCode).emit("guessResult", { team, isCorrect, correctWord: data.word });
      io.to(roomCode).emit("guessResult", {
        team,
        isCorrect,
        correctWord: data.word,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

        if (data.guesses.teamA !== null && data.guesses.teamB !== null) {
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
      if (data.guesses.teamA !== null && data.guesses.teamB !== null) {
        io.to(roomCode).emit("roundEnd", {
          round: 2,
          scores: {
            teamA: data.guesses.teamA ? room.settings.drawingPoints : 0,
            teamB: data.guesses.teamB ? room.settings.drawingPoints : 0,
          },
          totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
          winner:
            data.guesses.teamA === data.guesses.teamB
              ? "تعادل"
              : data.guesses.teamA
                ? room.teams.teamA.name
                : room.teams.teamB.name,
        });
        setTimeout(() => loadRound(roomCode, 3), 4500);
      }
    });

    function loadRound3(roomCode: string) {
      const room = getRoom(roomCode);
      if (!room) return;
      const questions = shuffle(weirdQuestions).slice(0, 4);
      room.roundData = {
        type: "round3",
        questions,
        currentIndex: 0,
        answers: { teamA: null, teamB: null },
        scores: { teamA: 0, teamB: 0 },
        currentOptions: [],
      } as Round3Data;
      sendRound3Question(roomCode);
    }

    function sendRound3Question(roomCode: string) {
    socket.on("submitWeirdAnswer", ({ roomCode, answer }: { roomCode: string; answer: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 3) return;
      const data = room.roundData as Round3Data;
      const q = data.questions[data.currentIndex]!;
      const options = shuffle([q.correct, ...shuffle(fakeAnswers).slice(0, 3)]);
      data.currentOptions = options;
      data.answers = { teamA: null, teamB: null };
      io.to(roomCode).emit("showWeirdQuestion", {
        question: q,
        options,
        questionNumber: data.currentIndex + 1,
        totalQuestions: data.questions.length,
      });
    }
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;

    socket.on("submitWeirdAnswer", ({ roomCode, team, answer }: { roomCode: string; team: "teamA" | "teamB"; answer: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 3) return;
      const data = room.roundData as Round3Data;
      const q = data.questions[data.currentIndex]!;
      const isCorrect = answer === q.correct;
      const expectedPlayerId = getQuestionActor(roomCode, team, data.currentIndex)?.id;
      if (expectedPlayerId !== socket.id) {
        socket.emit("error", "ليس دورك للإجابة الآن.");
        return;
      }
      if (data.answers[team] !== null) return;

      if (data.answers[team] === null) {
        data.answers[team] = answer;
        if (isCorrect) data.scores[team] += room.settings.weirdPoints;
        io.to(roomCode).emit("weirdTeamAnswered", { team, answer, isCorrect });
      const question = data.questions[data.currentIndex];
      if (!question) return;
      const isCorrect = answer === question.correct;
      data.answers[team] = answer;
      if (isCorrect) data.scores[team] += room.settings.weirdPoints;

        if (data.answers.teamA !== null && data.answers.teamB !== null) {
          data.currentIndex++;
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
            setTimeout(() => sendRound3Question(roomCode), 2500);
          }
      io.to(roomCode).emit("weirdTeamAnswered", {
        team,
        answer,
        isCorrect,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

      if (data.answers.teamA !== null && data.answers.teamB !== null) {
        data.currentIndex += 1;
        if (data.currentIndex >= data.questions.length) {
          room.teamAScore += data.scores.teamA;
          room.teamBScore += data.scores.teamB;
          io.to(roomCode).emit("roundEnd", {
            round: 3,
            scores: data.scores,
            totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
            winner:
              data.scores.teamA === data.scores.teamB
                ? "تعادل"
                : data.scores.teamA > data.scores.teamB
                  ? room.teams.teamA.name
                  : room.teams.teamB.name,
          });
          setTimeout(() => loadRound(roomCode, 4), 4500);
        } else {
          setTimeout(() => sendRound3Question(roomCode), 2200);
        }
      }
    });

    function loadRound4(roomCode: string) {
    socket.on("submitSpyClue", ({ roomCode, clue }: { roomCode: string; clue: string }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const selected = spyWords[Math.floor(Math.random() * spyWords.length)]!;
      room.roundData = {
        type: "round4",
        word: selected.word,
        clues: selected.clues,
        spyClues: { teamA: null, teamB: null },
        guesses: { teamA: null, teamB: null },
      } as Round4Data;
      io.to(roomCode).emit("startSpyMaster", { word: selected.word, clues: selected.clues });
    }
      if (!room || room.currentRound !== 4) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getDrawActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") {
        socket.emit("error", "دور قائد الشفرة ليس لك الآن.");
        return;
      }

    socket.on("submitSpyClue", ({ roomCode, team, clue }: { roomCode: string; team: "teamA" | "teamB"; clue: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const data = room.roundData as Round4Data;
      data.spyClues[team] = clue;
      io.to(roomCode).emit("spyClueSubmitted", { team });
      io.to(roomCode).emit("spyClueSubmitted", {
        team,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

      if (data.spyClues.teamA && data.spyClues.teamB) {
        io.to(roomCode).emit("showSpyGuesses", { clueA: data.spyClues.teamA, clueB: data.spyClues.teamB });
        emitSpyGuessRound(roomCode);
      }
    });

    socket.on("submitSpyGuess", ({ roomCode, team, guess }: { roomCode: string; team: "teamA" | "teamB"; guess: string }) => {
    socket.on("submitSpyGuess", ({ roomCode, guess }: { roomCode: string; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const team = getTeamFromSocket(roomCode, socket.id);
      if (!team) return;
      if (getGuessActor(roomCode, team)?.id !== socket.id && room.gameMode !== "1v1") {
        socket.emit("error", "دور عميل التخمين ليس لك الآن.");
        return;
      }

      const data = room.roundData as Round4Data;
      if (data.guesses[team] !== null) return;
      const isCorrect = guess.trim() === data.word;
      data.guesses[team] = isCorrect;
      if (isCorrect) {
        if (team === "teamA") room.teamAScore += room.settings.spyPoints;
        else room.teamBScore += room.settings.spyPoints;
      }

      if (data.guesses[team] === null) {
        data.guesses[team] = isCorrect;
        if (isCorrect) {
          if (team === "teamA") room.teamAScore += room.settings.spyPoints;
          else room.teamBScore += room.settings.spyPoints;
        }
        io.to(roomCode).emit("spyGuessResult", { team, isCorrect, correctWord: data.word });
      io.to(roomCode).emit("spyGuessResult", {
        team,
        isCorrect,
        correctWord: data.word,
        playerName: getPlayerOrNull(roomCode, socket.id)?.name ?? "لاعب",
      });

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
      if (data.guesses.teamA !== null && data.guesses.teamB !== null) {
        io.to(roomCode).emit("roundEnd", {
          round: 4,
          scores: {
            teamA: data.guesses.teamA ? room.settings.spyPoints : 0,
            teamB: data.guesses.teamB ? room.settings.spyPoints : 0,
          },
          totalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
          winner:
            data.guesses.teamA === data.guesses.teamB
              ? "تعادل"
              : data.guesses.teamA
                ? room.teams.teamA.name
                : room.teams.teamB.name,
        });
        setTimeout(() => endGame(roomCode), 4500);
      }
    });

    function endGame(roomCode: string) {
      const room = getRoom(roomCode);
      if (!room) return;
      let winner = "";
      if (room.teamAScore > room.teamBScore) winner = "فريق النور";
      else if (room.teamBScore > room.teamAScore) winner = "فريق الظلام";
      else winner = "تعادل";
      io.to(roomCode).emit("gameEnd", {
        finalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
        winner,
      });
    }

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Player disconnected");
      const roomCode = playerRoomMap.get(socket.id);
      playerRoomMap.delete(socket.id);
      if (!roomCode) return;

      const room = getRoom(roomCode);
      if (!room) return;
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx === -1) return;
      const left = room.players[idx]!;
      room.players.splice(idx, 1);
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("systemMessage", `غادر ${left.name} الغرفة`);

      const index = room.players.findIndex((player) => player.id === socket.id);
      if (index === -1) return;

      const departingPlayer = room.players[index];
      room.players.splice(index, 1);
      room.gameStarted = false;
      room.players.forEach((player) => {
        player.isReady = false;
        player.isCreator = false;
      });

      if (room.players.length === 0) {
        deleteRoom(roomCode);
      } else if (room.creatorId === socket.id && room.players.length > 0) {
        room.creatorId = room.players[0]!.id;
        room.players[0]!.isCreator = true;
        io.to(roomCode).emit("newCreator", room.players[0]!.id);
        io.to(roomCode).emit("systemMessage", `${room.players[0]!.name} هو المدير الجديد`);
        io.to(roomCode).emit("playersUpdate", room.players);
        return;
      }

      room.creatorId = room.players[0]!.id;
      room.players[0]!.isCreator = true;
      io.to(roomCode).emit("newCreator", room.players[0]!.id);
      io.to(roomCode).emit("playersUpdate", room.players);
      emitRoomMeta(roomCode);
      io.to(roomCode).emit(
        "systemMessage",
        `${departingPlayer?.name ?? "أحد اللاعبين"} غادر الغرفة. تم إيقاف أي جولة جارية وإعادة ضبط الجاهزية.`,
      );
    });
  });
}