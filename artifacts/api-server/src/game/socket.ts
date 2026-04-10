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

function maybeStartGame(roomCode: string): void {
  const room = getRoom(roomCode);
  if (!room) return;
  const playersNeeded = room.gameMode === "2v2" ? 4 : 2;
  const allReady = room.players.length >= playersNeeded && room.players.every((p) => p.isReady);
  if (allReady && room.currentRound === 1 && !room.roundData) {
    startGame(roomCode);
  }
}

export function initSocketServer(httpServer: HttpServer): void {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
  });

  const playerRoomMap = new Map<string, string>();

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Player connected");

    socket.on("createRoom", ({ playerName, settings }: { playerName: string; settings?: Record<string, number> }) => {
      const roomCode = generateRoomCode();
      createRoom(roomCode, socket.id, playerName, settings);
      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomCreated", { roomCode, playerId: socket.id, isCreator: true });
      const room = getRoom(roomCode)!;
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("roomSettings", room.settings);
    });

    socket.on("joinRoom", ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = getRoom(roomCode);
      if (!room) { socket.emit("error", "الغرفة غير موجودة"); return; }
      if (room.players.length >= 4) { socket.emit("error", "الغرفة ممتلئة"); return; }

      room.players.push({ id: socket.id, name: playerName, team: null, isReady: false, isCreator: false });
      socket.join(roomCode);
      playerRoomMap.set(socket.id, roomCode);
      socket.emit("roomJoined", { roomCode, playerId: socket.id, isCreator: false });
      io.to(roomCode).emit("playersUpdate", room.players);
      io.to(roomCode).emit("roomSettings", room.settings);
    });

    socket.on("checkRoom", (roomCode: string, callback: (r: { exists: boolean; playerCount: number }) => void) => {
      const room = getRoom(roomCode);
      callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    socket.on("updateSettings", ({ roomCode, settings }: { roomCode: string; settings: Record<string, number> }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتعديل الإعدادات"); return; }
      room.settings = { ...room.settings, ...settings };
      io.to(roomCode).emit("roomSettings", room.settings);
      io.to(roomCode).emit("systemMessage", "تم تحديث إعدادات الغرفة");
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
      }
    });

    socket.on("switchTeam", ({ roomCode, playerId, newTeam }: { roomCode: string; playerId: string; newTeam: "teamA" | "teamB" }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) { socket.emit("error", "ليس لديك صلاحية لتغيير الفرق"); return; }
      const player = room.players.find((p) => p.id === playerId);
      if (player) {
        player.team = newTeam;
        io.to(roomCode).emit("playersUpdate", room.players);
        io.to(roomCode).emit("systemMessage", `تم نقل ${player.name} إلى فريق ${newTeam === "teamA" ? "النور" : "الظلام"}`);
      }
    });

    socket.on("changeGameMode", ({ roomCode, mode }: { roomCode: string; mode: "2v2" | "1v1" }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      room.gameMode = mode;
      io.to(roomCode).emit("gameModeChanged", mode);
      io.to(roomCode).emit("systemMessage", `تم تغيير وضع اللعبة إلى ${mode === "2v2" ? "2 ضد 2" : "1 ضد 1"}`);
      maybeStartGame(roomCode);
    });

    socket.on("chooseTeam", ({ roomCode, team }: { roomCode: string; team: "teamA" | "teamB" }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        const teamCount = room.players.filter((p) => p.team === team).length;
        const maxPerTeam = room.gameMode === "2v2" ? 2 : 1;
        if (teamCount >= maxPerTeam && player.team !== team) { socket.emit("error", "هذا الفريق ممتلئ"); return; }
        player.team = team;
        io.to(roomCode).emit("playersUpdate", room.players);
        maybeStartGame(roomCode);
      }
    });

    socket.on("playerReady", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        player.isReady = true;
        io.to(roomCode).emit("playersUpdate", room.players);
        maybeStartGame(roomCode);
      }
    });

    socket.on("forceStartGame", ({ roomCode }: { roomCode: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.creatorId !== socket.id) return;
      if (room.players.length >= 2) {
        startGame(roomCode);
      } else {
        socket.emit("error", "يجب وجود لاعبين على الأقل لبدء اللعبة");
      }
    });

    function startGame(roomCode: string) {
      const room = getRoom(roomCode);
      if (!room) return;
      room.currentRound = 1;
      room.teamAScore = 0;
      room.teamBScore = 0;
      room.roundData = null;
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
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
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

    socket.on("submitAnswer", ({ roomCode, team, answerIndex }: { roomCode: string; team: "teamA" | "teamB"; answerIndex: number }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 1) return;
      const data = room.roundData as Round1Data;
      const q = data.questions[data.currentIndex]!;
      const isCorrect = answerIndex === q.correct;

      if (data.answers[team] === null) {
        data.answers[team] = isCorrect;
        if (isCorrect) data.scores[team] += room.settings.pointsPerCorrect;
        io.to(roomCode).emit("teamAnswered", { team, isCorrect });

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
        }
      }
    });

    function loadRound2(roomCode: string) {
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
      const data = room.roundData as Round2Data;
      data.drawings[team] = drawingData;
      io.to(roomCode).emit("drawingSubmitted", { team });

      if (data.drawings.teamA && data.drawings.teamB) {
        io.to(roomCode).emit("showGuesses", {
          drawingA: data.drawings.teamA,
          drawingB: data.drawings.teamB,
          wordLength: data.wordLength,
        });
      }
    });

    socket.on("submitGuess", ({ roomCode, team, guess }: { roomCode: string; team: "teamA" | "teamB"; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 2) return;
      const data = room.roundData as Round2Data;
      const isCorrect = guess.trim() === data.word;

      if (data.guesses[team] === null) {
        data.guesses[team] = isCorrect;
        if (isCorrect) {
          if (team === "teamA") room.teamAScore += room.settings.drawingPoints;
          else room.teamBScore += room.settings.drawingPoints;
        }
        io.to(roomCode).emit("guessResult", { team, isCorrect, correctWord: data.word });

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

    socket.on("submitWeirdAnswer", ({ roomCode, team, answer }: { roomCode: string; team: "teamA" | "teamB"; answer: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 3) return;
      const data = room.roundData as Round3Data;
      const q = data.questions[data.currentIndex]!;
      const isCorrect = answer === q.correct;

      if (data.answers[team] === null) {
        data.answers[team] = answer;
        if (isCorrect) data.scores[team] += room.settings.weirdPoints;
        io.to(roomCode).emit("weirdTeamAnswered", { team, answer, isCorrect });

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
        }
      }
    });

    function loadRound4(roomCode: string) {
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

    socket.on("submitSpyClue", ({ roomCode, team, clue }: { roomCode: string; team: "teamA" | "teamB"; clue: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const data = room.roundData as Round4Data;
      data.spyClues[team] = clue;
      io.to(roomCode).emit("spyClueSubmitted", { team });

      if (data.spyClues.teamA && data.spyClues.teamB) {
        io.to(roomCode).emit("showSpyGuesses", { clueA: data.spyClues.teamA, clueB: data.spyClues.teamB });
      }
    });

    socket.on("submitSpyGuess", ({ roomCode, team, guess }: { roomCode: string; team: "teamA" | "teamB"; guess: string }) => {
      const room = getRoom(roomCode);
      if (!room || room.currentRound !== 4) return;
      const data = room.roundData as Round4Data;
      const isCorrect = guess.trim() === data.word;

      if (data.guesses[team] === null) {
        data.guesses[team] = isCorrect;
        if (isCorrect) {
          if (team === "teamA") room.teamAScore += room.settings.spyPoints;
          else room.teamBScore += room.settings.spyPoints;
        }
        io.to(roomCode).emit("spyGuessResult", { team, isCorrect, correctWord: data.word });

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
      if (room.players.length === 0) {
        deleteRoom(roomCode);
      } else if (room.creatorId === socket.id && room.players.length > 0) {
        room.creatorId = room.players[0]!.id;
        room.players[0]!.isCreator = true;
        io.to(roomCode).emit("newCreator", room.players[0]!.id);
        io.to(roomCode).emit("systemMessage", `${room.players[0]!.name} هو المدير الجديد`);
        io.to(roomCode).emit("playersUpdate", room.players);
      }
    });
  });
}
