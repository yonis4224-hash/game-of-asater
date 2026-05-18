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

const allCategories = {
    culture: cultureDB.ثقافة_عامة || [],
    cinema: cultureDB.سينما_وأنمي || [],
    history: cultureDB.تاريخ_وجغرافيا || [],
    wrestling: cultureDB.مصارعة || []
};

const randomCategories = ['culture', 'cinema', 'wrestling'];
const randomCategoryNames = {
    culture: 'كرة قدم',
    cinema: 'سينما',
    wrestling: 'مصارعة'
};

const codenamesWords = [
    'كرة', 'ملعب', 'حارس', 'هدف', 'كأس', 'دوري', 'حكم', 'تمرير', 'هجوم', 'درع',
    'بطولة', 'مدرب', 'لاعب', 'شباك', 'ركلة', 'تسلل', 'مراوغة', 'صافرة', 'جمهور', 'تتويج',
    'ذهبي', 'فضي', 'نحاسي', 'بطل', 'وصيف', 'مباراة', 'شوط', 'إصابة', 'علاج', 'تدريب',
    'استاد', 'جماهير', 'هتاف', 'علم', 'نشيد', 'ميدالية', 'احتفال', 'دموع',
    'ريال', 'برشلونة', 'ليفربول', 'مانشستر', 'ميلان', 'بايرن', 'باريس', 'يوفنتوس', 'تشيلسي', 'أرسنال'
];

function createRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: 'team',
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
                hasConfirmed: false,
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

    const maxPlayers = room.mode === 'solo' ? 8 : 12;
    if (Object.keys(room.players).length >= maxPlayers) return { success: false, message: 'الغرفة ممتلئة' };
    if (room.players[socketId]) return { success: false, message: 'أنت بالفعل في الغرفة' };

    const isSolo = room.mode === 'solo';
    let team = 'A';
    if (!isSolo) {
        const teams = Object.values(room.players).map(p => p.team);
        const teamA = teams.filter(t => t === 'A').length;
        const teamB = teams.filter(t => t === 'B').length;
        team = teamA <= teamB ? 'A' : 'B';
    }

    room.players[socketId] = {
        socketId,
        name: playerName,
        team: team,
        isLeader: false,
        score: 0,
        ready: true,
        trapAnswer: null,
        selectedOption: null,
        hasConfirmed: false,
        avatar: avatar || null
    };
    room.scores[socketId] = 0;

    return { success: true, room };
}

function switchTeam(code, socketId, newTeam) {
    const room = rooms[code];
    if (!room || !room.players[socketId]) return null;
    if (room.status !== 'waiting') return null;
    if (room.mode === 'solo') return null;

    const player = room.players[socketId];
    if (newTeam !== 'A' && newTeam !== 'B') return null;

    player.team = newTeam;

    if (newTeam === 'A') {
        const hasLeaderA = Object.values(room.players).some(p => p.isLeader && p.team === 'A');
        if (!hasLeaderA) player.isLeader = true;
    }

    return room;
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

function startGame(code) {
    const room = rooms[code];
    if (!room) return null;

    room.status = 'playing';
    const isSolo = room.mode === 'solo';

    room.game = {
        currentRound: 1,
        currentQuestionIndex: 0,
        timer: 10,
        questions: null,
        teamOptions: null,
        drawWords: null,
        drawGuesses: [],
        codenamesWords: null,
        codenamesTeamWords: null,
        codenamesRevealed: {},
        codenamesCurrentTeam: 'A',
        codenamesScore: { A: 0, B: 0 },
        codenamesWinner: null,
        isSolo: isSolo,
        randomCategory: null,
        phase: 'trivia'
    };

    if (isSolo) {
        const allQ = [...allCategories.culture, ...allCategories.cinema, ...allCategories.history, ...allCategories.wrestling];
        room.game.questions = shuffleArray(allQ).slice(0, 15);
    } else {
        const round1Q = shuffleArray(allCategories.culture).slice(0, 5);
        const randomCat = randomCategories[Math.floor(Math.random() * randomCategories.length)];
        room.game.randomCategory = randomCat;
        const round3Q = shuffleArray(allCategories[randomCat]).slice(0, 5);
        room.game.questions = {
            1: round1Q,
            3: round3Q
        };
    }

    Object.keys(room.players).forEach(id => {
        room.players[id].score = 0;
        room.players[id].trapAnswer = null;
        room.players[id].selectedOption = null;
        room.players[id].hasConfirmed = false;
        room.scores[id] = 0;
    });

    if (isSolo) {
        return {
            code,
            round: 1,
            questionIndex: 0,
            question: room.game.questions[0],
            timer: 10,
            players: room.players,
            mode: room.mode,
            teamNames: room.teamNames,
            isSolo: true,
            totalQuestions: 15,
            roundTitle: 'سؤال 1 من 15'
        };
    } else {
        return {
            code,
            round: 1,
            questionIndex: 0,
            question: room.game.questions[1][0],
            timer: 10,
            players: room.players,
            mode: room.mode,
            teamNames: room.teamNames,
            isSolo: false,
            totalQuestions: 5,
            roundTitle: 'الجولة الأولى - أسئلة عامة'
        };
    }
}

function submitTrapAnswer(code, socketId, questionIndex, answer) {
    const room = rooms[code];
    if (!room || !room.players[socketId]) return null;

    room.players[socketId].trapAnswer = answer;
    room.players[socketId].hasConfirmed = true;

    const submittedCount = Object.values(room.players).filter(p => p.hasConfirmed === true).length;
    const totalCount = Object.keys(room.players).length;

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount };
}

function autoConfirmTrapPlayers(code) {
    const room = rooms[code];
    if (!room) return null;

    for (const player of Object.values(room.players)) {
        if (!player.hasConfirmed) {
            player.trapAnswer = '';
            player.hasConfirmed = true;
        }
    }

    return { allSubmitted: true };
}

function submitOption(code, socketId, questionIndex, optionIndex) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    room.players[socketId].selectedOption = optionIndex;
    room.players[socketId].hasConfirmed = true;

    const submittedCount = Object.values(room.players).filter(p => p.selectedOption !== null).length;
    const totalCount = Object.keys(room.players).length;

    const confirmedPlayers = Object.values(room.players).map(p => ({
        socketId: p.socketId,
        name: p.name,
        avatar: p.avatar,
        confirmed: p.hasConfirmed === true
    }));

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount, confirmedPlayers };
}

function autoConfirmOptionPlayers(code) {
    const room = rooms[code];
    if (!room) return null;

    for (const player of Object.values(room.players)) {
        if (!player.hasConfirmed) {
            player.selectedOption = 0;
            player.hasConfirmed = true;
        }
    }

    const confirmedPlayers = Object.values(room.players).map(p => ({
        socketId: p.socketId,
        name: p.name,
        avatar: p.avatar,
        confirmed: p.hasConfirmed === true
    }));

    return { allSubmitted: true, confirmedPlayers };
}

function buildOptions(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const isSolo = room.game.isSolo;
    let question;
    if (isSolo) {
        question = room.game.questions[questionIndex];
    } else {
        question = room.game.questions[room.game.currentRound]?.[questionIndex];
    }
    if (!question) return null;

    const correctAnswer = question.خيارات[question.الجواب];
    const defaultWrong = question.خيارات.filter((_, i) => i !== question.الجواب);

    if (isSolo) {
        const options = question.خيارات.map(text => ({ text, isTrap: false }));
        const correctIndex = options.findIndex(o => o.text === correctAnswer);
        room.game.teamOptions = { all: { options, correctIndex } };

        const confirmedPlayers = Object.values(room.players).map(p => ({
            socketId: p.socketId,
            name: p.name,
            avatar: p.avatar,
            confirmed: false
        }));

        return { teamOptions: { all: { options, correctIndex } }, confirmedPlayers };
    }

    const teams = [...new Set(Object.values(room.players).map(p => p.team))];
    const teamOptions = {};

    for (const team of teams) {
        const opponentTraps = [];
        const seenTexts = new Set([correctAnswer]);

        for (const player of Object.values(room.players)) {
            if (player.team !== team && player.trapAnswer && player.trapAnswer.trim() !== '' && !seenTexts.has(player.trapAnswer)) {
                opponentTraps.push({ text: player.trapAnswer, isTrap: true, fromPlayer: player.name });
                seenTexts.add(player.trapAnswer);
            }
        }

        let opts = [{ text: correctAnswer, isTrap: false }];

        for (const trap of opponentTraps) {
            if (opts.length >= 4) break;
            opts.push(trap);
        }

        for (const wrong of defaultWrong) {
            if (opts.length >= 4) break;
            if (!seenTexts.has(wrong)) {
                opts.push({ text: wrong, isTrap: false });
                seenTexts.add(wrong);
            }
        }

        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }

        const correctIndex = opts.findIndex(o => o.text === correctAnswer);
        teamOptions[team] = { options: opts, correctIndex };
    }

    room.game.teamOptions = teamOptions;

    const confirmedPlayers = Object.values(room.players).map(p => ({
        socketId: p.socketId,
        name: p.name,
        avatar: p.avatar,
        confirmed: false
    }));

    return { teamOptions, confirmedPlayers };
}

function calculateQuestionResults(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game || !room.game.teamOptions) return null;

    const isSolo = room.game.isSolo;
    let question;
    if (isSolo) {
        question = room.game.questions[questionIndex];
    } else {
        question = room.game.questions[room.game.currentRound]?.[questionIndex];
    }
    if (!question) return null;

    const correctPlayers = [];
    const wrongPlayers = [];
    const trapInfo = {};

    for (const player of Object.values(room.players)) {
        if (player.selectedOption === null) continue;

        let teamOpts;
        if (isSolo) {
            teamOpts = room.game.teamOptions.all;
        } else {
            teamOpts = room.game.teamOptions[player.team];
        }
        if (!teamOpts) continue;

        const selectedOpt = teamOpts.options[player.selectedOption];
        if (!selectedOpt) continue;

        const isCorrect = player.selectedOption === teamOpts.correctIndex;

        if (isCorrect) {
            player.score += 3;
            room.scores[player.socketId] = player.score;
            correctPlayers.push({ name: player.name, team: player.team, score: player.score, selectedAnswer: selectedOpt.text });
        } else {
            if (selectedOpt.isTrap && selectedOpt.fromPlayer) {
                trapInfo[selectedOpt.fromPlayer] = (trapInfo[selectedOpt.fromPlayer] || 0) + 1;
                const trapper = Object.values(room.players).find(p => p.name === selectedOpt.fromPlayer);
                if (trapper) {
                    trapper.score += 1;
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
    }

    const teamScores = {};
    for (const player of Object.values(room.players)) {
        teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
    }

    return { correctPlayers, wrongPlayers, trapInfo, scores: room.scores, teamScores, mode: room.mode, teamNames: room.teamNames, isSolo };
}

function getRoundTitle(round, isSolo, randomCategory) {
    if (isSolo) return `سؤال ${round} من 15`;

    const titles = {
        1: 'الجولة الأولى - أسئلة عامة',
        2: 'الجولة الثانية - الرسم',
        3: `الجولة الثالثة - ${randomCategoryNames[randomCategory] || 'عشوائي'}`,
        4: 'الجولة الرابعة - كود نيمز'
    };
    return titles[round] || `الجولة ${round}`;
}

function getRoundDisplayName(round, isSolo, randomCategory) {
    if (isSolo) return 'أسئلة عشوائية';

    const names = {
        1: 'أسئلة عامة',
        2: 'الرسم',
        3: randomCategoryNames[randomCategory] || 'عشوائي',
        4: 'كود نيمز'
    };
    return names[round] || '';
}

function resetForNextQuestion(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const isSolo = room.game.isSolo;

    for (const player of Object.values(room.players)) {
        player.trapAnswer = null;
        player.selectedOption = null;
        player.hasConfirmed = false;
    }

    room.game.teamOptions = null;
    room.game.currentQuestionIndex++;

    if (isSolo) {
        if (room.game.currentQuestionIndex >= 15) {
            const finishData = finishGame(code);
            return { isFinished: true, finishData };
        }

        return {
            round: room.game.currentQuestionIndex + 1,
            questionIndex: room.game.currentQuestionIndex,
            question: room.game.questions[room.game.currentQuestionIndex],
            timer: 10,
            players: room.players,
            mode: room.mode,
            teamNames: room.teamNames,
            isSolo: true,
            totalQuestions: 15,
            roundTitle: `سؤال ${room.game.currentQuestionIndex + 1} من 15`,
            isFinished: false
        };
    }

    const questions = room.game.questions[room.game.currentRound];
    if (!questions || room.game.currentQuestionIndex >= questions.length) {
        room.game.currentRound++;
        room.game.currentQuestionIndex = 0;

        if (room.game.currentRound > 4) {
            const finishData = finishGame(code);
            return { isFinished: true, finishData };
        }

        if (room.game.currentRound === 2) {
            return { isFinished: false, nextPhase: 'draw', round: 2 };
        }

        if (room.game.currentRound === 4) {
            return { isFinished: false, nextPhase: 'codenames', round: 4 };
        }

        if (room.game.currentRound === 3) {
            return {
                round: 3,
                questionIndex: 0,
                question: room.game.questions[3][0],
                timer: 10,
                players: room.players,
                mode: room.mode,
                teamNames: room.teamNames,
                isSolo: false,
                totalQuestions: 5,
                roundTitle: getRoundTitle(3, false, room.game.randomCategory),
                isFinished: false,
                showRoundTransition: true,
                roundDisplayName: getRoundDisplayName(3, false, room.game.randomCategory)
            };
        }
    }

    return {
        round: room.game.currentRound,
        questionIndex: room.game.currentQuestionIndex,
        question: room.game.questions[room.game.currentRound]?.[room.game.currentQuestionIndex],
        timer: 10,
        players: room.players,
        mode: room.mode,
        teamNames: room.teamNames,
        isSolo: false,
        totalQuestions: 5,
        roundTitle: getRoundTitle(room.game.currentRound, false, room.game.randomCategory),
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
        timer: 30,
        round: 2,
        roundTitle: 'الجولة الثانية - الرسم',
        roundDisplayName: 'الرسم'
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

    if (isCorrect && !room.game.drawGuesses.find(g => g.socketId === socketId)) {
        player.score += 3;
        room.scores[socketId] = player.score;
        room.game.drawGuesses.push({ socketId, name: player.name, team: player.team, correct: true });
        return { isCorrect, word: correctWord, score: player.score };
    }

    return { isCorrect: false };
}

function startCodenamesRound(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const words = shuffleArray(codenamesWords).slice(0, 15);
    const teamAWords = words.slice(0, 7);
    const teamBWords = words.slice(7, 14);
    const assassinWord = words[14];

    room.game.codenamesWords = words;
    room.game.codenamesTeamWords = { A: teamAWords, B: teamBWords, assassin: assassinWord };
    room.game.codenamesRevealed = {};
    room.game.codenamesCurrentTeam = 'A';
    room.game.codenamesScore = { A: 0, B: 0 };
    room.game.codenamesWinner = null;

    const leaders = {};
    Object.values(room.players).forEach(p => {
        if (p.isLeader) leaders[p.team] = p.socketId;
    });

    return {
        words,
        teamNames: room.teamNames,
        players: room.players,
        currentTeam: 'A',
        teamWords: { A: teamAWords, B: teamBWords },
        leaders,
        teamColors: { A: 'red', B: 'blue' },
        round: 4,
        roundTitle: 'الجولة الرابعة - كود نيمز',
        roundDisplayName: 'كود نيمز'
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

        for (const p of Object.values(room.players)) {
            if (p.team === winningTeam) {
                p.score += 3;
                room.scores[p.socketId] = p.score;
            }
        }

        return { revealed: 'assassin', winner: winningTeam, teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
    }

    if (teamAWords.includes(word)) {
        room.game.codenamesRevealed[wordIndex] = 'A';
        room.game.codenamesScore.A++;
        if (room.game.codenamesScore.A >= teamAWords.length) {
            room.game.codenamesWinner = 'A';

            for (const p of Object.values(room.players)) {
                if (p.team === 'A') {
                    p.score += 3;
                    room.scores[p.socketId] = p.score;
                }
            }

            return { revealed: 'A', score: room.game.codenamesScore, winner: 'A', teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
        }
        return { revealed: 'A', score: room.game.codenamesScore, teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
    }

    if (teamBWords.includes(word)) {
        room.game.codenamesRevealed[wordIndex] = 'B';
        room.game.codenamesScore.B++;
        if (room.game.codenamesScore.B >= teamBWords.length) {
            room.game.codenamesWinner = 'B';

            for (const p of Object.values(room.players)) {
                if (p.team === 'B') {
                    p.score += 3;
                    room.scores[p.socketId] = p.score;
                }
            }

            return { revealed: 'B', score: room.game.codenamesScore, winner: 'B', teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
        }
        return { revealed: 'B', score: room.game.codenamesScore, teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
    }

    room.game.codenamesRevealed[wordIndex] = 'neutral';
    room.game.codenamesCurrentTeam = player.team === 'A' ? 'B' : 'A';
    return { revealed: 'neutral', score: room.game.codenamesScore, currentTeam: room.game.codenamesCurrentTeam, teamNames: room.teamNames, teamColors: { A: 'red', B: 'blue' } };
}

function finishGame(code) {
    const room = rooms[code];
    if (!room) return null;

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
    switchTeam,
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
    finishGame,
    rooms,
    autoConfirmTrapPlayers,
    autoConfirmOptionPlayers
};
