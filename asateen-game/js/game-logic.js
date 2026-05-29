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

function createRoom(hostSocketId, hostName, mode) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: mode || 'team',
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

    const isLeader = !isSolo && !Object.values(room.players).some(p => p.team === team && p.isLeader);

    room.players[socketId] = {
        socketId,
        name: playerName,
        team: team,
        isLeader: isLeader,
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
    if (player.team === newTeam) return room;

    const oldTeam = player.team;
    player.team = newTeam;

    if (player.isLeader) {
        player.isLeader = false;
        const oldTeamPlayers = Object.values(room.players).filter(p => p.team === oldTeam);
        if (oldTeamPlayers.length > 0) {
            oldTeamPlayers[0].isLeader = true;
        }
    }

    const newTeamHasLeader = Object.values(room.players).some(p => p.team === newTeam && p.isLeader);
    if (!newTeamHasLeader) {
        player.isLeader = true;
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
        const wasLeader = room.players[targetSocketId].isLeader;
        const playerTeam = room.players[targetSocketId].team;
        delete room.players[targetSocketId];
        delete room.scores[targetSocketId];

        if (wasLeader && room.mode !== 'solo') {
            const teamPlayers = Object.values(room.players).filter(p => p.team === playerTeam);
            if (teamPlayers.length > 0) {
                teamPlayers[0].isLeader = true;
            }
        }

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
    if (!player.isLeader) return null;

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

    let leaders = Object.values(room.players).filter(p => p.isLeader);

    if (leaders.length < 2) {
        const teams = [...new Set(Object.values(room.players).map(p => p.team))];
        for (const team of teams) {
            const hasLeader = leaders.some(l => l.team === team);
            if (!hasLeader) {
                const teamPlayers = Object.values(room.players).filter(p => p.team === team);
                if (teamPlayers.length > 0) {
                    teamPlayers[0].isLeader = true;
                    leaders.push(teamPlayers[0]);
                }
            }
        }
    }

    if (leaders.length < 2) return null;

    const words = shuffleArray(codenamesWords).slice(0, 2);
    room.game.drawWords = {};
    leaders.forEach((leader, i) => {
        room.game.drawWords[leader.socketId] = words[i];
    });
    room.game.drawGuesses = [];
    room.game.drawTimer = 30;
    room.game.drawPhase = 'drawing';

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

    if (room.game.drawPhase !== 'guessing') return null;

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

    const allWords = shuffleArray(codenamesWords).slice(0, 25);
    const teamAWords = allWords.slice(0, 9);
    const teamBWords = allWords.slice(9, 17);
    const neutralWords = allWords.slice(17, 24);
    const assassinWord = allWords[24];

    const gridWords = shuffleArray(allWords);

    const cardTypes = {};
    gridWords.forEach((word, index) => {
        if (teamAWords.includes(word)) cardTypes[index] = 'A';
        else if (teamBWords.includes(word)) cardTypes[index] = 'B';
        else if (word === assassinWord) cardTypes[index] = 'assassin';
        else cardTypes[index] = 'neutral';
    });

    room.game.codenamesWords = gridWords;
    room.game.codenamesCardTypes = cardTypes;
    room.game.codenamesRevealed = {};
    room.game.codenamesCurrentTeam = 'A';
    room.game.codenamesScore = { A: 0, B: 0 };
    room.game.codenamesWinner = null;
    room.game.codenamesHint = null;
    room.game.codenamesRemaining = 9;
    room.game.codenamesTeamWords = { A: teamAWords, B: teamBWords };

    const leaders = {};
    Object.values(room.players).forEach(p => {
        if (p.isLeader) leaders[p.team] = p.socketId;
    });

    return {
        words: gridWords,
        cardTypes: cardTypes,
        teamNames: room.teamNames,
        players: room.players,
        currentTeam: 'A',
        leaders,
        score: { A: 0, B: 0 },
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

    if (room.game.codenamesRevealed[wordIndex] !== undefined) return null;

    const cardType = room.game.codenamesCardTypes[wordIndex];
    room.game.codenamesRevealed[wordIndex] = cardType;

    if (cardType === 'assassin') {
        const winningTeam = player.team === 'A' ? 'B' : 'A';
        room.game.codenamesWinner = winningTeam;

        for (const p of Object.values(room.players)) {
            if (p.team === winningTeam) {
                p.score += 3;
                room.scores[p.socketId] = p.score;
            }
        }

        return { revealed: wordIndex, type: 'assassin', winner: winningTeam, teamNames: room.teamNames, score: room.game.codenamesScore };
    }

    if (cardType === 'A') {
        room.game.codenamesScore.A++;
        if (room.game.codenamesScore.A >= 9) {
            room.game.codenamesWinner = 'A';
            for (const p of Object.values(room.players)) {
                if (p.team === 'A') {
                    p.score += 3;
                    room.scores[p.socketId] = p.score;
                }
            }
            return { revealed: wordIndex, type: 'A', score: room.game.codenamesScore, winner: 'A', teamNames: room.teamNames };
        }
        return { revealed: wordIndex, type: 'A', score: room.game.codenamesScore, teamNames: room.teamNames };
    }

    if (cardType === 'B') {
        room.game.codenamesScore.B++;
        if (room.game.codenamesScore.B >= 8) {
            room.game.codenamesWinner = 'B';
            for (const p of Object.values(room.players)) {
                if (p.team === 'B') {
                    p.score += 3;
                    room.scores[p.socketId] = p.score;
                }
            }
            return { revealed: wordIndex, type: 'B', score: room.game.codenamesScore, winner: 'B', teamNames: room.teamNames };
        }
        return { revealed: wordIndex, type: 'B', score: room.game.codenamesScore, teamNames: room.teamNames };
    }

    room.game.codenamesCurrentTeam = player.team === 'A' ? 'B' : 'A';
    return { revealed: wordIndex, type: 'neutral', score: room.game.codenamesScore, currentTeam: room.game.codenamesCurrentTeam, teamNames: room.teamNames };
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
            const wasLeader = room.players[socketId].isLeader;
            const playerTeam = room.players[socketId].team;
            delete room.players[socketId];
            delete room.scores[socketId];

            if (wasLeader && room.mode !== 'solo') {
                const teamPlayers = Object.values(room.players).filter(p => p.team === playerTeam);
                if (teamPlayers.length > 0) {
                    teamPlayers[0].isLeader = true;
                }
            }

            if (Object.keys(room.players).length === 0) {
                delete rooms[code];
                return { code: null, room: null };
            } else {
                if (room.host === socketId) {
                    room.host = Object.keys(room.players)[0];
                }
            }
            return { code, room };
        }
    }
    return null;
}

const mafiaRoles = {
    mafia: { name: 'مافيا', team: 'mafia', emoji: '🔫', description: 'اقتل المواطنين في الليل' },
    citizen: { name: 'مواطن', team: 'citizen', emoji: '👤', description: 'اكتشف المافيا وصوّت لطردها' },
    doctor: { name: 'طبيب', team: 'citizen', emoji: '💊', description: 'انقذ أحد اللاعبين في الليل' },
    police: { name: 'شرطي', team: 'citizen', emoji: '🔍', description: 'تحقق من هوية لاعب في الليل' }
};

function createMafiaRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: 'mafia',
        teamNames: { A: 'المافيا', B: 'المواطنون' },
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
        status: 'waiting',
        mafiaConfig: {
            mafiaCount: 1,
            doctorEnabled: true,
            policeEnabled: true
        }
    };
    rooms[code].scores[hostSocketId] = 0;
    return rooms[code];
}

function updateMafiaConfig(code, config) {
    const room = rooms[code];
    if (!room || room.mode !== 'mafia') return null;
    if (config.mafiaCount !== undefined) room.mafiaConfig.mafiaCount = Math.min(Math.max(1, config.mafiaCount), 4);
    if (config.doctorEnabled !== undefined) room.mafiaConfig.doctorEnabled = config.doctorEnabled;
    if (config.policeEnabled !== undefined) room.mafiaConfig.policeEnabled = config.policeEnabled;
    return room;
}

function startMafiaGame(code) {
    const room = rooms[code];
    if (!room) return null;

    room.status = 'playing';
    const playerIds = Object.keys(room.players);
    const playerCount = playerIds.length;

    if (playerCount < 4) return null;

    const config = room.mafiaConfig;
    const shuffled = shuffleArray([...playerIds]);

    const mafiaCount = Math.min(config.mafiaCount, Math.floor(playerCount / 3));
    const roles = [];

    for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
    if (config.doctorEnabled && playerCount >= 4) roles.push('doctor');
    if (config.policeEnabled && playerCount >= 5) roles.push('police');
    while (roles.length < playerCount) roles.push('citizen');

    const shuffledRoles = shuffleArray(roles);

    shuffled.forEach((id, i) => {
        room.players[id].role = shuffledRoles[i];
        room.players[id].alive = true;
        room.players[id].team = mafiaRoles[shuffledRoles[i]].team;
        room.players[id].lastVote = null;
    });

    room.game = {
        phase: 'night',
        day: 1,
        mafiaChoices: {},
        doctorChoice: null,
        policeChoice: null,
        votes: {},
        nominated: [],
        dead: [],
        nightResolved: false,
        dayMessages: [],
        lastCheckResult: null,
        mafiaTeam: shuffled.filter(id => room.players[id].role === 'mafia')
    };

    Object.keys(room.players).forEach(id => { room.scores[id] = 0; });

    return {
        code,
        players: room.players,
        day: 1,
        phase: 'night',
        mafiaConfig: config,
        teamNames: room.teamNames,
        mafiaTeam: room.game.mafiaTeam
    };
}

function mafiaKill(code, mafiaId, targetId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'night') return null;
    if (room.players[mafiaId]?.role !== 'mafia') return null;
    if (!room.players[targetId] || !room.players[targetId].alive) return null;

    room.game.mafiaChoices[mafiaId] = targetId;

    const allMafiaVoted = room.game.mafiaTeam.every(id => room.game.mafiaChoices[id] !== undefined);
    const counts = {};
    Object.values(room.game.mafiaChoices).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const maxCount = Math.max(...Object.values(counts));
    const agreed = Object.entries(counts).find(([_, c]) => c === maxCount);

    if (allMafiaVoted) {
        return { waiting: false, target: agreed ? agreed[0] : null, submittedCount: Object.keys(room.game.mafiaChoices).length, totalMafia: room.game.mafiaTeam.length };
    }

    return { waiting: true, submittedCount: Object.keys(room.game.mafiaChoices).length, totalMafia: room.game.mafiaTeam.length };
}

function doctorSave(code, doctorId, targetId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'night') return null;
    if (room.players[doctorId]?.role !== 'doctor') return null;
    if (targetId && (!room.players[targetId] || !room.players[targetId].alive)) return null;

    room.game.doctorChoice = targetId;
    return { saved: targetId };
}

function policeCheck(code, policeId, targetId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'night') return null;
    if (room.players[policeId]?.role !== 'police') return null;
    if (!room.players[targetId] || !room.players[targetId].alive) return null;

    const target = room.players[targetId];
    const isMafia = target.role === 'mafia';
    room.game.policeChoice = targetId;
    room.game.lastCheckResult = { targetId, targetName: target.name, isMafia };

    return { targetId, targetName: target.name, isMafia };
}

function resolveMafiaNight(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const killed = [];
    const saved = [];

    const mafiaTarget = Object.values(room.game.mafiaChoices)[0] || null;
    const doctorTarget = room.game.doctorChoice;

    if (mafiaTarget && doctorTarget === mafiaTarget) {
        saved.push({ socketId: mafiaTarget, name: room.players[mafiaTarget].name });
    } else if (mafiaTarget && room.players[mafiaTarget]) {
        room.players[mafiaTarget].alive = false;
        killed.push({ socketId: mafiaTarget, name: room.players[mafiaTarget].name, role: room.players[mafiaTarget].role, killedBy: 'mafia' });
        room.game.dead.push({ socketId: mafiaTarget, killedBy: 'mafia', day: room.game.day });
    }

    room.game.mafiaChoices = {};
    room.game.doctorChoice = null;
    room.game.policeChoice = null;
    room.game.phase = 'day';
    room.game.nightResolved = true;
    room.game.votes = {};
    room.game.nominated = [];

    const win = checkMafiaWin(code);

    return {
        killed,
        saved,
        day: room.game.day,
        players: room.players,
        checkResult: room.game.lastCheckResult,
        win
    };
}

function nominatePlayer(code, nominatorId, targetId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'day') return null;
    if (!room.players[nominatorId]?.alive) return null;
    if (!room.players[targetId]?.alive) return null;
    if (room.game.nominated.includes(targetId)) return null;

    room.game.nominated.push(targetId);
    return { nominated: room.game.nominated, players: room.players };
}

function mafiaVoteDay(code, voterId, targetId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'day') return null;
    if (!room.players[voterId]?.alive) return null;

    if (targetId === 'skip') {
        room.game.votes[voterId] = 'skip';
    } else {
        if (!room.players[targetId]?.alive) return null;
        room.game.votes[voterId] = targetId;
    }

    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    const totalVotes = Object.keys(room.game.votes).length;

    return { totalVotes, neededVotes: alivePlayers.length, votes: room.game.votes };
}

function resolveMafiaDay(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const voteCounts = {};
    Object.values(room.game.votes).forEach(v => {
        voteCounts[v] = (voteCounts[v] || 0) + 1;
    });

    const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    const eliminated = [];
    let skipVotes = voteCounts['skip'] || 0;

    if (sorted.length > 0 && sorted[0][0] !== 'skip') {
        const topVotes = sorted.filter(([_, c]) => c === sorted[0][1]);
        if (topVotes.length === 1 && sorted[0][1] > skipVotes) {
            const targetId = sorted[0][0];
            room.players[targetId].alive = false;
            eliminated.push({ socketId: targetId, name: room.players[targetId].name, role: room.players[targetId].role, killedBy: 'voted' });
            room.game.dead.push({ socketId: targetId, killedBy: 'voted', day: room.game.day });
        }
    }

    room.game.votes = {};
    room.game.nominated = [];
    room.game.phase = 'night';
    room.game.day++;
    room.game.nightResolved = false;
    room.game.lastCheckResult = null;

    const win = checkMafiaWin(code);

    return {
        eliminated,
        voteCounts,
        skipVotes,
        day: room.game.day,
        players: room.players,
        win
    };
}

function checkMafiaWin(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const alive = Object.values(room.players).filter(p => p.alive);
    const mafiaAlive = alive.filter(p => p.role === 'mafia').length;
    const citizensAlive = alive.filter(p => p.team === 'citizen').length;

    if (mafiaAlive === 0) return { winner: 'citizen', reason: 'تم القضاء على المافيا!' };
    if (mafiaAlive >= citizensAlive) return { winner: 'mafia', reason: 'المافيا سيطرت على المدينة!' };

    return null;
}

function getMafiaGameState(code, socketId) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const player = room.players[socketId];
    if (!player) return null;

    const alive = Object.values(room.players).filter(p => p.alive);
    const aliveInfo = alive.map(p => ({ socketId: p.socketId, name: p.name, role: p.role }));

    const mafiaVisible = player.role === 'mafia' ? room.game.mafiaTeam.map(id => ({ socketId: id, name: room.players[id].name })) : null;

    return {
        phase: room.game.phase,
        day: room.game.day,
        myRole: player.role,
        alive: aliveInfo,
        dead: room.game.dead,
        mafiaTeam: mafiaVisible,
        nominated: room.game.nominated,
        votes: room.game.votes,
        checkResult: player.role === 'police' ? room.game.lastCheckResult : null,
        players: room.players,
        mafiaConfig: room.mafiaConfig
    };
}

function addMafiaChatMessage(code, socketId, message) {
    const room = rooms[code];
    if (!room || !room.game) return null;
    const player = room.players[socketId];
    if (!player || !player.alive) return null;

    const msg = {
        socketId,
        name: player.name,
        message: message.substring(0, 200),
        timestamp: Date.now(),
        role: player.role
    };
    room.game.dayMessages.push(msg);
    return msg;
}

function createCodenamesRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: 'codenames',
        teamNames: { A: 'الفريق الأحمر', B: 'الفريق الأزرق' },
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

function startCodenamesStandalone(code) {
    const room = rooms[code];
    if (!room) return null;

    room.status = 'playing';

    const allWords = shuffleArray(codenamesWords).slice(0, 25);
    const teamAWords = allWords.slice(0, 9);
    const teamBWords = allWords.slice(9, 17);
    const neutralWords = allWords.slice(17, 24);
    const assassinWord = allWords[24];

    const gridWords = shuffleArray(allWords);

    const cardTypes = {};
    gridWords.forEach((word, index) => {
        if (teamAWords.includes(word)) cardTypes[index] = 'A';
        else if (teamBWords.includes(word)) cardTypes[index] = 'B';
        else if (word === assassinWord) cardTypes[index] = 'assassin';
        else cardTypes[index] = 'neutral';
    });

    room.game = {
        currentTeam: 'A',
        cardTypes: cardTypes,
        words: gridWords,
        revealed: {},
        score: { A: 9, B: 8 },
        phase: 'clue',
        clue: null,
        guessCount: 0,
        turnCount: 0
    };

    Object.keys(room.players).forEach(id => { room.scores[id] = 0; });

    const spymasters = {};
    Object.values(room.players).forEach(p => {
        if (p.isLeader) spymasters[p.team] = p.socketId;
    });

    return {
        code,
        words: gridWords,
        cardTypes: cardTypes,
        currentTeam: 'A',
        score: { A: 9, B: 8 },
        players: room.players,
        teamNames: room.teamNames,
        spymasters
    };
}

function submitClue(code, socketId, clueWord, clueCount) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'clue') return null;
    if (room.players[socketId]?.role !== 'spymaster' && !room.players[socketId]?.isLeader) return null;

    const playerTeam = room.players[socketId].team;
    if (playerTeam !== room.game.currentTeam) return null;

    const boardWords = room.game.words.map(w => w.toLowerCase());
    if (boardWords.includes(clueWord.toLowerCase())) return null;

    room.game.clue = { word: clueWord, count: parseInt(clueCount), team: playerTeam };
    room.game.phase = 'guess';
    room.game.guessCount = 0;

    return { clueWord, clueCount: parseInt(clueCount), team: playerTeam };
}

function guessCodenamesWord(code, socketId, wordIndex) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'guess') return null;
    if (room.players[socketId]?.team !== room.game.currentTeam) return null;
    if (room.game.revealed[wordIndex] !== undefined) return null;

    const cardType = room.game.cardTypes[wordIndex];
    room.game.revealed[wordIndex] = cardType;
    room.game.guessCount++;

    if (cardType === room.game.currentTeam) {
        room.game.score[room.game.currentTeam]--;

        if (room.game.score[room.game.currentTeam] === 0) {
            return { type: cardType, correct: true, gameOver: true, winner: room.game.currentTeam, score: room.game.score };
        }

        return { type: cardType, correct: true, gameOver: false, score: room.game.score };
    }

    if (cardType === 'assassin') {
        const losingTeam = room.game.currentTeam;
        const winningTeam = losingTeam === 'A' ? 'B' : 'A';
        return { type: 'assassin', correct: false, gameOver: true, winner: winningTeam, score: room.game.score };
    }

    const otherTeam = room.game.currentTeam === 'A' ? 'B' : 'A';
    room.game.currentTeam = otherTeam;
    room.game.phase = 'clue';
    room.game.clue = null;

    return { type: cardType, correct: false, gameOver: false, nextTeam: otherTeam, score: room.game.score };
}

function endCodenamesTurn(code, socketId) {
    const room = rooms[code];
    if (!room || !room.game || room.game.phase !== 'guess') return null;
    if (room.players[socketId]?.team !== room.game.currentTeam) return null;

    const otherTeam = room.game.currentTeam === 'A' ? 'B' : 'A';
    room.game.currentTeam = otherTeam;
    room.game.phase = 'clue';
    room.game.clue = null;

    return { nextTeam: otherTeam };
}

function getCodenamesGameState(code, socketId) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    return {
        words: room.game.words,
        cardTypes: room.game.cardTypes,
        revealed: room.game.revealed,
        currentTeam: room.game.currentTeam,
        score: room.game.score,
        phase: room.game.phase,
        clue: room.game.clue,
        players: room.players,
        teamNames: room.teamNames,
        isMyTurn: room.players[socketId]?.team === room.game.currentTeam,
        isSpymaster: room.players[socketId]?.isLeader
    };
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
    autoConfirmOptionPlayers,
    createMafiaRoom,
    updateMafiaConfig,
    startMafiaGame,
    mafiaKill,
    doctorSave,
    policeCheck,
    resolveMafiaNight,
    nominatePlayer,
    mafiaVoteDay,
    resolveMafiaDay,
    checkMafiaWin,
    getMafiaGameState,
    addMafiaChatMessage,
    mafiaRoles,
    createCodenamesRoom,
    startCodenamesStandalone,
    submitClue,
    guessCodenamesWord,
    endCodenamesTurn,
    getCodenamesGameState
};
