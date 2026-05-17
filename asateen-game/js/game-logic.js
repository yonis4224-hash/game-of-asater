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

function createRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: '1v1',
        scores: {},
        players: {
            [hostSocketId]: {
                socketId: hostSocketId,
                name: hostName,
                team: 'A',
                score: 0,
                ready: true,
                trapAnswer: null,
                selectedOption: null
            }
        },
        game: null,
        status: 'waiting'
    };
    rooms[code].scores[hostSocketId] = 0;
    return rooms[code];
}

function joinRoom(code, socketId, playerName) {
    const room = rooms[code];
    if (!room) {
        return { success: false, message: 'الغرفة غير موجودة' };
    }
    if (room.status !== 'waiting') {
        return { success: false, message: 'اللعبة بدأت بالفعل' };
    }
    if (Object.keys(room.players).length >= 8) {
        return { success: false, message: 'الغرفة ممتلئة' };
    }
    if (room.players[socketId]) {
        return { success: false, message: 'أنت بالفعل في الغرفة' };
    }

    const teams = Object.values(room.players).map(p => p.team);
    const teamA = teams.filter(t => t === 'A').length;
    const teamB = teams.filter(t => t === 'B').length;

    room.players[socketId] = {
        socketId,
        name: playerName,
        team: teamA <= teamB ? 'A' : 'B',
        score: 0,
        ready: true,
        trapAnswer: null,
        selectedOption: null
    };
    room.scores[socketId] = 0;

    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers === 2) room.mode = '1v1';
    else if (totalPlayers === 4) room.mode = '2v2';
    else room.mode = '4v4';

    return { success: true, room };
}

function getRoom(code) {
    return rooms[code] || null;
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
        teamOptions: null
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

    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers === 2) room.mode = '1v1';
    else if (totalPlayers === 4) room.mode = '2v2';
    else room.mode = '4v4';

    return {
        code,
        round: 1,
        questionIndex: 0,
        question: room.game.questions[1][0],
        timer: 30,
        players: room.players,
        mode: room.mode
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
            correctPlayers.push({ name: player.name, team: player.team, score: player.score });
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

    return { correctPlayers, wrongPlayers, trapInfo, scores: room.scores, teamScores, mode: room.mode };
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
            room.status = 'finished';
            return { isFinished: true };
        }
    }

    return {
        round: room.game.currentRound,
        questionIndex: room.game.currentQuestionIndex,
        question: room.game.questions[room.game.currentRound]?.[room.game.currentQuestionIndex],
        timer: 30,
        players: room.players,
        mode: room.mode,
        isFinished: false
    };
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
    getRoom,
    startGame,
    submitTrapAnswer,
    submitOption,
    disconnectPlayer,
    buildOptions,
    calculateQuestionResults,
    resetForNextQuestion,
    rooms
};
