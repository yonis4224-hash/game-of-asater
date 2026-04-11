const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// تحميل الأسئلة من ملف JSON (افتراضي مؤقت إذا لم يوجد)
let questions = {
    football: [],
    gaming: [],
    series: [],
    ironman: []
};
try {
    const data = fs.readFileSync('./questions.json', 'utf8');
    questions = JSON.parse(data);
    console.log('✅ تم تحميل الأسئلة');
} catch (e) {
    console.log('⚠️ ملف questions.json غير موجود، سيتم استخدام أسئلة افتراضية');
    questions = {
        football: [{ q: "من فاز بكأس العالم 2018؟", answer: "فرنسا" }],
        gaming: [{ q: "ما هي لعبة الباتل رويال الأشهر؟", answer: "فورتنايت" }],
        series: [{ q: "في أي مسلسل نجد والتر وايت؟", answer: "بريكينغ باد" }],
        ironman: [{ emojis: "⚽🐐🇦🇷", hint: "لاعب كرة قدم", answer: "ميسي" }]
    };
}

const rooms = new Map();

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function createRoom(roomCode, creatorId, creatorName, teamData, gameMode) {
    rooms.set(roomCode, {
        id: roomCode,
        creatorId: creatorId,
        players: [{
            id: creatorId,
            name: creatorName,
            team: 'teamA',
            isReady: false,
            isCreator: true,
            currentAnswer: null
        }],
        teamAName: teamData.teamAName || 'النور',
        teamBName: teamData.teamBName || 'الظلام',
        teamAColor: teamData.teamAColor || '#4CAF50',
        teamBColor: teamData.teamBColor || '#FF9800',
        gameMode: gameMode || '1v1',
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

    socket.on('createRoom', ({ playerName, teamAName, teamBName, teamAColor, teamBColor, gameMode }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        createRoom(roomCode, socket.id, playerName, { teamAName, teamBName, teamAColor, teamBColor }, gameMode);
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('playersUpdate', rooms.get(roomCode).players);
        console.log(`✅ غرفة جديدة: ${roomCode}`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', 'الغرفة غير موجودة');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('error', 'الغرفة ممتلئة');
            return;
        }
        room.players.push({
            id: socket.id,
            name: playerName,
            team: 'teamB',
            isReady: false,
            isCreator: false,
            currentAnswer: null
        });
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });
        io.to(roomCode).emit('playersUpdate', room.players);
        console.log(`✅ انضم ${playerName} إلى ${roomCode}`);
    });

    socket.on('checkRoom', (roomCode, callback) => {
        const room = rooms.get(roomCode);
        callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            console.log(`✅ ${player.name} جاهز في ${roomCode}`);
            
            const allReady = room.players.length === 2 && room.players.every(p => p.isReady);
            if (allReady && !room.gameStarted) {
                console.log(`🎮 جميع اللاعبين جاهزين في ${roomCode}، بدء اللعبة...`);
                room.gameStarted = true;
                io.to(roomCode).emit('gameStarted', { 
                    gameMode: room.gameMode,
                    teamAName: room.teamAName,
                    teamBName: room.teamBName,
                    teamAColor: room.teamAColor,
                    teamBColor: room.teamBColor
                });
                startGame(roomCode);
            } else {
                console.log(`⏳ انتظار الجاهزية: ${room.players.filter(p => !p.isReady).map(p => p.name)}`);
            }
        }
    });

    socket.on('forceStartGame', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.isCreator && !room.gameStarted && room.players.length === 2) {
            room.gameStarted = true;
            io.to(roomCode).emit('gameStarted', { 
                gameMode: room.gameMode,
                teamAName: room.teamAName,
                teamBName: room.teamBName,
                teamAColor: room.teamAColor,
                teamBColor: room.teamBColor
            });
            startGame(roomCode);
        } else {
            socket.emit('error', 'لا يمكن بدء اللعبة: تأكد من وجود لاعبين اثنين');
        }
    });

    function startGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        console.log(`🎮 بدء اللعبة في ${roomCode}`);
        room.currentRound = 1;
        room.scores = { teamA: 0, teamB: 0 };
        loadRound(roomCode, 1);
    }

    function loadRound(roomCode, round) {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.currentRound = round;
        room.waitingForNext = false;
        io.to(roomCode).emit('roundStart', {
            round: round,
            totalRounds: 4,
            scores: room.scores,
            teamAName: room.teamAName,
            teamBName: room.teamBName,
            teamAColor: room.teamAColor,
            teamBColor: room.teamBColor
        });
        
        if (room.gameMode === '1v1') {
            loadRound1v1(roomCode, round);
        } else {
            // نمط 2v2 ليس مطلوباً حالياً
            io.to(roomCode).emit('message', 'نمط 2 ضد 2 قيد التطوير');
        }
    }

    function loadRound1v1(roomCode, round) {
        const room = rooms.get(roomCode);
        if (!room) return;
        let questionsList = [];
        let type = '';
        switch(round) {
            case 1:
                questionsList = shuffleArray([...questions.ironman]);
                type = 'ironman';
                break;
            case 2:
                questionsList = shuffleArray([...questions.football]);
                type = 'football';
                break;
            case 3:
                questionsList = shuffleArray([...questions.gaming]);
                type = 'gaming';
                break;
            case 4:
                questionsList = shuffleArray([...questions.series]);
                type = 'series';
                break;
            default:
                endGame(roomCode);
                return;
        }
        room.roundData = {
            type: type,
            questions: questionsList.slice(0, 5),
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            roundScores: { teamA: 0, teamB: 0 }
        };
        sendQuestion1v1(roomCode);
    }

    function sendQuestion1v1(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.waitingForNext) return;
        const q = room.roundData.questions[room.roundData.currentIndex];
        const isIronMan = (room.roundData.type === 'ironman');
        io.to(roomCode).emit('showQuestion1v1', {
            type: room.roundData.type,
            question: isIronMan ? null : q,
            emojis: isIronMan ? q.emojis : null,
            hint: isIronMan ? q.hint : null,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        room.roundData.answers = { teamA: null, teamB: null };
        room.players.forEach(p => { p.currentAnswer = null; });
    }

    socket.on('submitAnswer1v1', ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (!room || room.gameMode !== '1v1' || room.waitingForNext) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.currentAnswer !== null) return;
        const team = player.team;
        const currentQ = room.roundData.questions[room.roundData.currentIndex];
        const correctAnswer = currentQ.answer;
        const isCorrect = (answer.trim().toLowerCase() === correctAnswer.toLowerCase());
        player.currentAnswer = isCorrect;
        room.roundData.answers[team] = isCorrect;
        if (isCorrect) {
            room.roundData.roundScores[team] += 1;
        }
        io.to(roomCode).emit('answerResult1v1', {
            team: team,
            isCorrect: isCorrect,
            correctAnswer: correctAnswer
        });
        if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
            room.waitingForNext = true;
            setTimeout(() => {
                room.roundData.currentIndex++;
                if (room.roundData.currentIndex >= room.roundData.questions.length) {
                    room.scores.teamA += room.roundData.roundScores.teamA;
                    room.scores.teamB += room.roundData.roundScores.teamB;
                    io.to(roomCode).emit('roundEnd1v1', {
                        round: room.currentRound,
                        roundScores: room.roundData.roundScores,
                        totalScores: room.scores,
                        teamAName: room.teamAName,
                        teamBName: room.teamBName
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
                    sendQuestion1v1(roomCode);
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
        console.log('🔴 لاعب غادر:', socket.id);
        for (const [code, room] of rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit('playersUpdate', room.players);
                if (room.players.length === 0) {
                    rooms.delete(code);
                    console.log(`🗑️ تم حذف غرفة ${code}`);
                } else if (room.creatorId === socket.id && room.players.length > 0) {
                    room.creatorId = room.players[0].id;
                    room.players[0].isCreator = true;
                    io.to(code).emit('playersUpdate', room.players);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 السيربر يعمل على http://localhost:${PORT}`);
});