const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// ==================== قاعدة الأسئلة ====================
const questionsDB = {
    football: [
        { q: "من فاز بكأس العالم 2018؟", answer: "فرنسا" },
        { q: "من فاز بكأس العالم 2022؟", answer: "الأرجنتين" },
        { q: "من هو الهداف التاريخي لكأس العالم؟", answer: "كلوزه" },
        { q: "كم عدد الكرات الذهبية لميسي؟", answer: "8" },
        { q: "من هو أفضل لاعب 2023؟", answer: "ميسي" },
        { q: "هداف الدوري الإنجليزي 2023؟", answer: "هالاند" },
        { q: "هداف الدوري الإسباني 2023؟", answer: "ليفاندوفسكي" },
        { q: "بطل دوري أبطال أوروبا 2023؟", answer: "مانشستر سيتي" },
        { q: "أفضل حارس مرمى 2023؟", answer: "كورتوا" },
        { q: "أين يلعب رونالدو؟", answer: "النصر" },
        { q: "أين يلعب ميسي؟", answer: "إنتر ميامي" },
        { q: "مدرب مانشستر سيتي؟", answer: "جوارديولا" },
        { q: "مدرب ريال مدريد؟", answer: "أنشيلوتي" }
    ],
    gaming: [
        { q: "أشهر لعبة باتل رويال؟", answer: "فورتنايت" },
        { q: "مطور ماينكرافت؟", answer: "موجانغ" },
        { q: "في أي لعبة ماريو؟", answer: "سوبر ماريو" },
        { q: "بطل God of War؟", answer: "كراتوس" },
        { q: "بطل The Witcher؟", answer: "جيرالت" }
    ],
    series: [
        { q: "في أي مسلسل والتر وايت؟", answer: "بريكينغ باد" },
        { q: "مبتكر صراع العروش؟", answer: "جورج مارتن" },
        { q: "عدد مواسم فريندز؟", answer: "10" },
        { q: "بطل لا كازا دي بابيل؟", answer: "بيدرو ألونسو" }
    ],
    ironman: [
        { emojis: "⚽🐐🇦🇷", hint: "لاعب كرة قدم", answer: "ميسي" },
        { emojis: "⚽🐐🇵🇹", hint: "لاعب كرة قدم", answer: "رونالدو" },
        { emojis: "🎤🕺", hint: "مغني", answer: "مايكل جاكسون" }
    ]
};

const rooms = new Map();
const roomLocks = new Map(); // لمنع تضارب الوصول المتزامن

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function acquireLock(roomCode) {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (!roomLocks.get(roomCode)) {
                roomLocks.set(roomCode, true);
                clearInterval(interval);
                resolve();
            }
        }, 10);
    });
}

function releaseLock(roomCode) {
    roomLocks.delete(roomCode);
}

function getRandomQuestions(category, count = 5) {
    if (!questionsDB[category]) return [];
    const shuffled = shuffleArray([...questionsDB[category]]);
    return shuffled.slice(0, count);
}

function createRoom(roomCode, creatorId, creatorName, teamData) {
    rooms.set(roomCode, {
        id: roomCode,
        creatorId: creatorId,
        players: [{
            id: creatorId,
            name: creatorName,
            team: 'teamA',
            isReady: false,
            isCreator: true
        }],
        teamAName: teamData.teamAName || 'النور',
        teamBName: teamData.teamBName || 'الظلام',
        teamAColor: teamData.teamAColor || '#7c3aed',
        teamBColor: teamData.teamBColor || '#fbbf24',
        gameMode: '1v1',
        currentRound: 1,
        scores: { teamA: 0, teamB: 0 },
        gameStarted: false,
        roundData: null,
        waitingForNext: false
    });
    return roomCode;
}

io.on('connection', (socket) => {
    console.log('🟢 لاعب متصل:', socket.id);

    socket.on('createRoom', ({ playerName, teamAName, teamBName, teamAColor, teamBColor }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        createRoom(roomCode, socket.id, playerName, { teamAName, teamBName, teamAColor, teamBColor });
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('playersUpdate', rooms.get(roomCode).players);
        console.log(`✅ غرفة ${roomCode} أنشئت بواسطة ${playerName} (${socket.id})`);
    });

    socket.on('joinRoom', async ({ roomCode, playerName }) => {
        await acquireLock(roomCode);
        try {
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', 'الغرفة غير موجودة');
                return;
            }
            if (room.players.length >= 10) { // زيادة الحد الأقصى إلى 10 لاعبين
                socket.emit('error', 'الغرفة ممتلئة');
                return;
            }
            if (room.gameStarted) {
                socket.emit('error', 'اللعبة قد بدأت بالفعل');
                return;
            }
            
            const teams = ['teamA', 'teamB'];
            const teamCounts = { teamA: 0, teamB: 0 };
            room.players.forEach(p => teamCounts[p.team]++);
            const assignTeam = teamCounts.teamA <= teamCounts.teamB ? 'teamA' : 'teamB';
            
            room.players.push({
                id: socket.id,
                name: playerName,
                team: assignTeam,
                isReady: false,
                isCreator: false
            });
            socket.join(roomCode);
            socket.emit('roomJoined', { roomCode });
            io.to(roomCode).emit('playersUpdate', room.players);
            console.log(`✅ ${playerName} انضم إلى الغرفة ${roomCode} (${assignTeam})`);
        } finally {
            releaseLock(roomCode);
        }
    });

    socket.on('checkRoom', (roomCode, callback) => {
        const room = rooms.get(roomCode);
        const canJoin = room && room.players.length < 10 && !room.gameStarted;
        callback({ 
            exists: !!room, 
            playerCount: room ? room.players.length : 0,
            canJoin: canJoin
        });
    });

    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            
            if (room.players.length >= 2 && room.players.every(p => p.isReady) && !room.gameStarted) {
                console.log(`🎮 بدء اللعبة في ${roomCode} (${room.players.length} لاعب)`);
                room.gameStarted = true;
                startGame(roomCode);
            }
        }
    });

    socket.on('forceStartGame', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.isCreator && !room.gameStarted && room.players.length >= 2) {
            room.gameStarted = true;
            startGame(roomCode);
        }
    });

    function startGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.currentRound = 1;
        room.scores = { teamA: 0, teamB: 0 };
        
        io.to(roomCode).emit('gameStarted', {
            teamAName: room.teamAName,
            teamBName: room.teamBName,
            teamAColor: room.teamAColor,
            teamBColor: room.teamBColor
        });
        
        loadRound(roomCode, 1);
    }

    function loadRound(roomCode, round) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.currentRound = round;
        room.waitingForNext = false;
        
        let questions = [];
        let roundType = '';
        
        switch(round) {
            case 1:
                questions = getRandomQuestions('ironman', 5);
                roundType = 'ironman';
                break;
            case 2:
                questions = getRandomQuestions('football', 5);
                roundType = 'football';
                break;
            case 3:
                questions = getRandomQuestions('gaming', 5);
                roundType = 'gaming';
                break;
            case 4:
                questions = getRandomQuestions('series', 5);
                roundType = 'series';
                break;
            default:
                endGame(roomCode);
                return;
        }
        
        room.roundData = {
            type: roundType,
            questions: questions,
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            roundScores: { teamA: 0, teamB: 0 }
        };
        
        io.to(roomCode).emit('roundStart', {
            round: round,
            totalRounds: 4,
            scores: room.scores,
            teamAName: room.teamAName,
            teamBName: room.teamBName,
            teamAColor: room.teamAColor,
            teamBColor: room.teamBColor,
            roundType: roundType
        });
        
        sendQuestion(roomCode);
    }

    function sendQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.waitingForNext) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        const isIronMan = (room.roundData.type === 'ironman');
        
        io.to(roomCode).emit('showQuestion', {
            type: room.roundData.type,
            question: isIronMan ? null : q,
            emojis: isIronMan ? q.emojis : null,
            hint: isIronMan ? q.hint : null,
            current: room.roundData.currentIndex + 1,
            total: room.roundData.questions.length
        });
        
        room.roundData.answers = { teamA: null, teamB: null };
        room.players.forEach(p => { p.answered = false; });
    }

    socket.on('submitAnswer', ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (!room || room.waitingForNext) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.answered) return;
        
        const team = player.team;
        const currentQ = room.roundData.questions[room.roundData.currentIndex];
        const isCorrect = (answer.trim().toLowerCase() === currentQ.answer.toLowerCase());
        
        player.answered = true;
        room.roundData.answers[team] = isCorrect;
        
        if (isCorrect) {
            room.roundData.roundScores[team] += 1;
        }
        
        io.to(roomCode).emit('answerResult', {
            team: team,
            isCorrect: isCorrect,
            correctAnswer: currentQ.answer
        });
        
        if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
            room.waitingForNext = true;
            
            setTimeout(() => {
                room.roundData.currentIndex++;
                
                if (room.roundData.currentIndex >= room.roundData.questions.length) {
                    room.scores.teamA += room.roundData.roundScores.teamA;
                    room.scores.teamB += room.roundData.roundScores.teamB;
                    
                    io.to(roomCode).emit('roundEnd', {
                        round: room.currentRound,
                        roundScores: room.roundData.roundScores,
                        totalScores: room.scores,
                        teamAName: room.teamAName,
                        teamBName: room.teamBName,
                        teamAColor: room.teamAColor,
                        teamBColor: room.teamBColor
                    });
                    
                    setTimeout(() => {
                        if (room.currentRound < 4) {
                            loadRound(roomCode, room.currentRound + 1);
                        } else {
                            endGame(roomCode);
                        }
                    }, 4000);
                } else {
                    room.waitingForNext = false;
                    sendQuestion(roomCode);
                }
            }, 2000);
        }
    });

    function endGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        let winner = '';
        let winnerName = '';
        if (room.scores.teamA > room.scores.teamB) {
            winner = 'teamA';
            winnerName = room.teamAName;
        } else if (room.scores.teamB > room.scores.teamA) {
            winner = 'teamB';
            winnerName = room.teamBName;
        } else {
            winner = 'draw';
            winnerName = 'تعادل';
        }
        
        io.to(roomCode).emit('gameEnd', {
            finalScores: room.scores,
            winner: winner,
            winnerName: winnerName,
            teamAName: room.teamAName,
            teamBName: room.teamBName
        });
        
        setTimeout(() => rooms.delete(roomCode), 10000);
    }

    socket.on('disconnect', () => {
        console.log('🔴 غادر:', socket.id);
        for (const [code, room] of rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit('playersUpdate', room.players);
                if (room.players.length === 0) rooms.delete(code);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 السيربر يعمل على http://localhost:${PORT}`);
});
