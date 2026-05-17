const rooms = {};
const fs = require('fs');
const path = require('path');

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

const dataDir = path.join(__dirname, '..', 'data');
const cultureDB = JSON.parse(fs.readFileSync(path.join(dataDir, 'قاعدة_الأسئلة.json'), 'utf8'));

const categoryQuestions = {
    1: cultureDB.ثقافة_عامة || [],
    2: cultureDB.سينما_وأنمي || [],
    3: cultureDB.تاريخ_وجغرافيا || [],
    4: cultureDB.مصارعة || []
};

const totalRounds = 4;
const questionsPerRound = 5;

const codenamesWords = [
    'كرة', 'ملعب', 'حارس', 'هدف', 'كأس', 'دوري', 'حكم', 'تمرير', 'هجوم', 'درع',
    'بطولة', 'مدرب', 'لاعب', 'شباك', 'ركلة', 'تسلل', 'مراوغة', 'صافرة', 'جمهور', 'تتويج',
    'ذهبي', 'فضي', 'نحاسي', 'بطل', 'وصيف', 'مباراة', 'شوط', 'إصابة', 'علاج', 'تدريب',
    'استاد', 'جماهير', 'هتاف', 'علم', 'نشيد', 'كأس', 'ميدالية', 'تتويج', 'احتفال', 'دموع',
    'ريال', 'برشلونة', 'ليفربول', 'مانشستر', 'ميلان', 'بايرن', 'باريس', 'يوفنتوس', 'تشيلسي', 'أرسنال'
];

function createRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: 'custom',
        teamNames: { A: 'الفريق أ', B: 'الفريق ب' },
        scores: {},
        players: {
            [hostSocketId]: {
                socketId: hostSocketId,
                name: hostName,
                team: 'A',
                isLeader: true,
                score: 0,
                ready: true,
                trapAnswer: null,
                selectedOption: null,
                avatar: null
            }
        },
        game: null,
        status: 'waiting'
    };
    rooms[code].scores[hostSocketId] = 0;
    return rooms[code];
}

function joinRoom(code, socketId, playerName, avatar) {
    const room = rooms[code];
    if (!room) return { success: false, message: 'الغرفة غير موجودة' };
    if (room.status !== 'waiting') return { success: false, message: 'اللعبة بدأت بالفعل' };
    if (Object.keys(room.players).length >= 12) return { success: false, message: 'الغرفة ممتلئة' };
    if (room.players[socketId]) return { success: false, message: 'أنت بالفعل في الغرفة' };

    const teams = Object.values(room.players).map(p => p.team);
    const teamA = teams.filter(t => t === 'A').length;
    const teamB = teams.filter(t => t === 'B').length;

    room.players[socketId] = {
        socketId,
        name: playerName,
        team: teamA <= teamB ? 'A' : 'B',
        isLeader: false,
        score: 0,
        ready: true,
        trapAnswer: null,
        selectedOption: null,
        avatar: avatar || null
    };
    room.scores[socketId] = 0;

    return { success: true, room };
}

function kickPlayer(code, socketId, targetSocketId) {
    const room = rooms[code];
    if (!room) return { success: false, message: 'الغرفة غير موجودة' };
    if (room.host !== socketId) return { success: false, message: 'فقط المضيف يمكنه الطرد' };
    if (targetSocketId === socketId) return { success: false, message: 'لا يمكنك طرد نفسك' };
    if (room.status !== 'waiting') return { success: false, message: 'لا يمكن الطرد أثناء اللعب' };

    if (room.players[targetSocketId]) {
        delete room.players[targetSocketId];
        delete room.scores[targetSocketId];
        return { success: true, room };
    }
    return { success: false, message: 'اللاعب غير موجود' };
}

function setLeader(code, socketId, targetSocketId) {
    const room = rooms[code];
    if (!room) return null;
    const player = room.players[socketId];
    const target = room.players[targetSocketId];
    if (!player || !target) return null;
    if (player.team !== target.team) return null;

    Object.values(room.players).forEach(p => {
        if (p.team === player.team) p.isLeader = false;
    });
    target.isLeader = true;
    return room;
}

function updateTeamNames(code, teamAName, teamBName) {
    const room = rooms[code];
    if (!room) return null;
    if (teamAName) room.teamNames.A = teamAName;
    if (teamBName) room.teamNames.B = teamBName;
    return room;
}

function getRoom(code) {
    return rooms[code] || null;
}

function getTeamScore(room, team) {
    const players = Object.values(room.players).filter(p => p.team === team);
    return players.reduce((sum, p) => sum + p.score, 0);
}

function getTeamCount(room, team) {
    return Object.values(room.players).filter(p => p.team === team).length;
}

function normalizeScores(room) {
    const countA = getTeamCount(room, 'A');
    const countB = getTeamCount(room, 'B');
    if (countA === 0 || countB === 0) return;

    const scoreA = getTeamScore(room, 'A');
    const scoreB = getTeamScore(room, 'B');

    const avgA = scoreA / countA;
    const avgB = scoreB / countB;

    if (countA > countB) {
        const ratio = countA / countB;
        Object.values(room.players).forEach(p => {
            if (p.team === 'B') {
                p.score = Math.round(p.score * ratio);
                room.scores[p.socketId] = p.score;
            }
        });
    } else if (countB > countA) {
        const ratio = countB / countA;
        Object.values(room.players).forEach(p => {
            if (p.team === 'A') {
                p.score = Math.round(p.score * ratio);
                room.scores[p.socketId] = p.score;
            }
        });
    }
}

function startGame(code) {
    const room = rooms[code];
    if (!room) return null;

    room.status = 'playing';
    room.game = {
        currentRound: 1,
        currentQuestionIndex: 0,
        totalRounds,
        questionsPerRound,
        timer: 30,
        questions: {},
        teamOptions: null,
        drawWord: null,
        drawGuesses: [],
        codenamesWords: null,
        codenamesRevealed: {},
        codenamesCurrentTeam: 'A',
        codenamesScore: { A: 0, B: 0 }
    };

    for (let r = 1; r <= totalRounds; r++) {
        room.game.questions[r] = shuffleArray(categoryQuestions[r]).slice(0, questionsPerRound);
    }

    Object.keys(room.players).forEach(id => {
        room.players[id].score = 0;
        room.players[id].trapAnswer = null;
        room.players[id].selectedOption = null;
        room.scores[id] = 0;
    });

    return {
        code,
        round: 1,
        questionIndex: 0,
        question: room.game.questions[1][0],
        timer: 30,
        players: room.players,
        mode: room.mode,
        teamNames: room.teamNames
    };
}

function submitTrapAnswer(code, socketId, questionIndex, answer) {
    const room = rooms[code];
    if (!room || !room.players[socketId]) return null;

    room.players[socketId].trapAnswer = answer;

    const submittedCount = Object.values(room.players).filter(p => p.trapAnswer !== null).length;
    const totalCount = Object.keys(room.players).length;

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount };
}

function submitOption(code, socketId, questionIndex, optionIndex) {
    const room = rooms[code];
    if (!room || !room.players[socketId] || !room.game) return null;

    room.players[socketId].selectedOption = optionIndex;

    const submittedCount = Object.values(room.players).filter(p => p.selectedOption !== null).length;
    const totalCount = Object.keys(room.players).length;

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount };
}

function buildOptions(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const question = room.game.questions[room.game.currentRound]?.[questionIndex];
    if (!question) return null;

    const teams = [...new Set(Object.values(room.players).map(p => p.team))];
    const correctAnswer = question.خيارات[question.الجواب];
    const defaultWrong = question.خيارات.filter((_, i) => i !== question.الجواب);

    const teamOptions = {};

    for (const team of teams) {
        const opponentTraps = [];
        const seenTexts = new Set([correctAnswer]);

        for (const player of Object.values(room.players)) {
            if (player.team !== team && player.trapAnswer && !seenTexts.has(player.trapAnswer)) {
                opponentTraps.push({ text: player.trapAnswer, isTrap: true, fromPlayer: player.name });
                seenTexts.add(player.trapAnswer);
            }
        }

        let options;

        if (opponentTraps.length === 0) {
            options = question.خيارات.map(text => ({ text, isTrap: false }));
        } else {
            options = [{ text: correctAnswer, isTrap: false }];

            for (const trap of opponentTraps) {
                if (options.length >= 4) break;
                options.push(trap);
            }

            for (const wrong of defaultWrong) {
                if (options.length >= 4) break;
                if (!seenTexts.has(wrong)) {
                    options.push({ text: wrong, isTrap: false });
                    seenTexts.add(wrong);
                }
            }

            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
        }

        const correctIndex = options.findIndex(o => o.text === correctAnswer);
        teamOptions[team] = { options, correctIndex };
    }

    room.game.teamOptions = teamOptions;
    return teamOptions;
}

function calculateQuestionResults(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game || !room.game.teamOptions) return null;

    const question = room.game.questions[room.game.currentRound]?.[questionIndex];
    if (!question) return null;

    const correctPlayers = [];
    const wrongPlayers = [];
    const trapInfo = {};

    for (const player of Object.values(room.players)) {
        if (player.selectedOption === null) continue;

        const teamOpts = room.game.teamOptions[player.team];
        if (!teamOpts) continue;

        const selectedOpt = teamOpts.options[player.selectedOption];
        if (!selectedOpt) continue;

        const isCorrect = player.selectedOption === teamOpts.correctIndex;

        if (isCorrect) {
            player.score += 100;
            correctPlayers.push({ name: player.name, team: player.team, score: player.score, selectedAnswer: selectedOpt.text });
        } else {
            if (selectedOpt.isTrap && selectedOpt.fromPlayer) {
                trapInfo[selectedOpt.fromPlayer] = (trapInfo[selectedOpt.fromPlayer] || 0) + 1;
                const trapper = Object.values(room.players).find(p => p.name === selectedOpt.fromPlayer);
                if (trapper) {
                    trapper.score += 50;
                    room.scores[trapper.socketId] = trapper.score;
                }
            }

            wrongPlayers.push({
                name: player.name,
                team: player.team,
                selectedAnswer: selectedOpt.text,
                fromPlayer: selectedOpt.fromPlayer || null
            });
        }

        room.scores[player.socketId] = player.score;
    }

    const teamScores = {};
    for (const player of Object.values(room.players)) {
        teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
    }

    return { correctPlayers, wrongPlayers, trapInfo, scores: room.scores, teamScores, mode: room.mode, teamNames: room.teamNames };
}

function resetForNextQuestion(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    for (const player of Object.values(room.players)) {
        player.trapAnswer = null;
        player.selectedOption = null;
    }

    room.game.teamOptions = null;

    room.game.currentQuestionIndex++;
    const questions = room.game.questions[room.game.currentRound];

    if (room.game.currentQuestionIndex >= questions.length) {
        room.game.currentRound++;
        room.game.currentQuestionIndex = 0;

        if (room.game.currentRound > room.game.totalRounds) {
            return { isFinished: false, nextPhase: 'draw' };
        }
    }

    return {
        round: room.game.currentRound,
        questionIndex: room.game.currentQuestionIndex,
        question: room.game.questions[room.game.currentRound]?.[room.game.currentQuestionIndex],
        timer: 30,
        players: room.players,
        mode: room.mode,
        teamNames: room.teamNames,
        isFinished: false
    };
}

function startDrawRound(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const leaders = Object.values(room.players).filter(p => p.isLeader);
    if (leaders.length < 2) return null;

    const words = shuffleArray(codenamesWords).slice(0, 2);
    room.game.drawWords = {};
    leaders.forEach((leader, i) => {
        room.game.drawWords[leader.socketId] = words[i];
    });
    room.game.drawGuesses = [];
    room.game.drawTimer = 30;

    return {
        drawWords: room.game.drawWords,
        players: room.players,
        teamNames: room.teamNames,
        timer: 30
    };
}

function submitDrawGuess(code, socketId, guess) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const player = room.players[socketId];
    if (!player || player.isLeader) return null;

    const leader = Object.values(room.players).find(p => p.isLeader && p.team === player.team);
    if (!leader) return null;

    const correctWord = room.game.drawWords[leader.socketId];
    const isCorrect = guess.trim().toLowerCase() === correctWord.trim().toLowerCase();

    if (isCorrect) {
        player.score += 100;
        room.scores[socketId] = player.score;
        room.game.drawGuesses.push({ name: player.name, team: player.team, correct: true });
        return { isCorrect, word: correctWord, score: player.score };
    }

    return { isCorrect: false };
}

function startCodenamesRound(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    normalizeScores(room);

    const words = shuffleArray(codenamesWords).slice(0, 15);
    const teamAWords = words.slice(0, 7);
    const teamBWords = words.slice(7, 14);
    const assassinWord = words[14];

    room.game.codenamesWords = words;
    room.game.codenamesTeamWords = { A: teamAWords, B: teamBWords, assassin: assassinWord };
    room.game.codenamesRevealed = {};
    room.game.codenamesCurrentTeam = 'A';
    room.game.codenamesTimer = 120;

    return {
        words,
        teamNames: room.teamNames,
        players: room.players,
        currentTeam: 'A',
        timer: 120
    };
}

function revealCodenameWord(code, socketId, wordIndex) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const player = room.players[socketId];
    if (!player) return null;

    const word = room.game.codenamesWords[wordIndex];
    if (!word) return null;

    if (room.game.codenamesRevealed[wordIndex] !== undefined) return null;

    const { A: teamAWords, B: teamBWords, assassin } = room.game.codenamesTeamWords;

    if (word === assassin) {
        room.game.codenamesRevealed[wordIndex] = 'assassin';
        const winningTeam = player.team === 'A' ? 'B' : 'A';
        room.game.codenamesWinner = winningTeam;
        return { revealed: 'assassin', winner: winningTeam, teamNames: room.teamNames };
    }

    if (teamAWords.includes(word)) {
        room.game.codenamesRevealed[wordIndex] = 'A';
        room.game.codenamesScore.A++;
        if (room.game.codenamesScore.A >= teamAWords.length) {
            room.game.codenamesWinner = 'A';
            return { revealed: 'A', score: room.game.codenamesScore, winner: 'A', teamNames: room.teamNames };
        }
        return { revealed: 'A', score: room.game.codenamesScore, teamNames: room.teamNames };
    }

    if (teamBWords.includes(word)) {
        room.game.codenamesRevealed[wordIndex] = 'B';
        room.game.codenamesScore.B++;
        if (room.game.codenamesScore.B >= teamBWords.length) {
            room.game.codenamesWinner = 'B';
            return { revealed: 'B', score: room.game.codenamesScore, winner: 'B', teamNames: room.teamNames };
        }
        return { revealed: 'B', score: room.game.codenamesScore, teamNames: room.teamNames };
    }

    room.game.codenamesRevealed[wordIndex] = 'neutral';
    room.game.codenamesCurrentTeam = player.team === 'A' ? 'B' : 'A';
    return { revealed: 'neutral', score: room.game.codenamesScore, currentTeam: room.game.codenamesCurrentTeam, teamNames: room.teamNames };
}

function startOvertime(code) {
    const room = rooms[code];
    if (!room) return null;

    const allQuestions = [...categoryQuestions[1], ...categoryQuestions[2], ...categoryQuestions[3], ...categoryQuestions[4]];
    const question = shuffleArray(allQuestions)[0];

    room.game.overtimeQuestion = question;
    room.game.overtimeTimer = 15;

    return {
        question,
        players: room.players,
        teamNames: room.teamNames,
        timer: 15
    };
}

function submitOvertimeAnswer(code, socketId, optionIndex) {
    const room = rooms[code];
    if (!room || !room.game || !room.game.overtimeQuestion) return null;

    const player = room.players[socketId];
    if (!player) return null;

    const question = room.game.overtimeQuestion;
    const isCorrect = optionIndex === question.الجواب;

    if (isCorrect) {
        player.score += 200;
        room.scores[socketId] = player.score;
        normalizeScores(room);

        const teamScores = {};
        for (const p of Object.values(room.players)) {
            teamScores[p.team] = (teamScores[p.team] || 0) + p.score;
        }

        const maxScore = Math.max(...Object.values(teamScores));
        const winners = Object.entries(teamScores).filter(([_, s]) => s === maxScore);

        if (winners.length === 1) {
            return { isCorrect: true, winner: winners[0][0], teamScores, teamNames: room.teamNames, gameOver: true };
        }

        return { isCorrect: true, teamScores, teamNames: room.teamNames, gameOver: false, needMore: true };
    }

    return { isCorrect: false, teamNames: room.teamNames };
}

function finishGame(code) {
    const room = rooms[code];
    if (!room) return null;

    normalizeScores(room);

    const teamScores = {};
    for (const player of Object.values(room.players)) {
        teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
    }

    const maxScore = Math.max(...Object.values(teamScores));
    const winners = Object.entries(teamScores).filter(([_, s]) => s === maxScore);

    if (winners.length === 1) {
        return { winner: winners[0][0], teamScores, players: room.players, teamNames: room.teamNames, mode: room.mode };
    }

    return { isTied: true, teamScores, players: room.players, teamNames: room.teamNames, mode: room.mode };
}

function disconnectPlayer(socketId) {
    for (const code in rooms) {
        const room = rooms[code];
        if (room.players[socketId]) {
            delete room.players[socketId];
            delete room.scores[socketId];
            if (Object.keys(room.players).length === 0) {
                delete rooms[code];
            } else {
                if (room.host === socketId) {
                    room.host = Object.keys(room.players)[0];
                }
            }
            break;
        }
    }
}

module.exports = {
    createRoom,
    joinRoom,
    kickPlayer,
    setLeader,
    updateTeamNames,
    getRoom,
    startGame,
    submitTrapAnswer,
    submitOption,
    disconnectPlayer,
    buildOptions,
    calculateQuestionResults,
    resetForNextQuestion,
    startDrawRound,
    submitDrawGuess,
    startCodenamesRound,
    revealCodenameWord,
    startOvertime,
    submitOvertimeAnswer,
    finishGame,
    rooms
};
