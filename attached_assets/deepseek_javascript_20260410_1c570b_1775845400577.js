const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const rooms = new Map();

// ========== أسئلة اللعبة ==========
// أسئلة نمط 1 ضد 1
const ironManQuestions = [
    { emojis: "⚽🐐🇦🇷", hint: "لاعب كرة قدم أسطوري", answer: "ميسي" },
    { emojis: "⚽🐐🇵🇹💪", hint: "لاعب كرة قدم برتغالي", answer: "رونالدو" },
    { emojis: "🎤🕺🧤", hint: "مغني ملك البوب", answer: "مايكل جاكسون" },
    { emojis: "🧠⚛️👨‍🦳", hint: "عالم فيزياء نظرية", answer: "أينشتاين" },
    { emojis: "🕊️🇮🇳🙏", hint: "زعيم هندي", answer: "غاندي" }
];

const sportsQuestions1v1 = [
    { q: "من فاز بكأس العالم 2022؟", options: ["فرنسا", "الأرجنتين", "المغرب", "كرواتيا"], correct: 1 },
    { q: "من هو أفضل لاعب في العالم 2023؟", options: ["ميسي", "هالاند", "مبابي", "دي بروين"], correct: 0 },
    { q: "ما هو النادي الذي يلقب بالريال؟", options: ["برشلونة", "ريال مدريد", "أتلتيكو مدريد", "إشبيلية"], correct: 1 }
];

const gamingQuestions = [
    { q: "في أي لعبة نجد شخصية ماريو؟", options: ["سونيك", "نينتندو", "بلاي ستيشن", "إكس بوكس"], correct: 1 },
    { q: "ما هي لعبة الباتل رويال الأشهر؟", options: ["ماينكرافت", "فورتنايت", "جتا", "كول أوف ديوتي"], correct: 1 },
    { q: "من هو مطور لعبة ماينكرافت؟", options: ["موجانغ", "إي إيه", "يوبيسوفت", "بيتسدا"], correct: 0 }
];

const seriesQuestions = [
    { q: "في أي مسلسل نجد شخصية والتر وايت؟", options: ["صراع العروش", "بريكينغ باد", "هاوس أوف كاردز", "العرش"], correct: 1 },
    { q: "من هو مبتكر مسلسل صراع العروش؟", options: ["جورج مارتن", "جون ستيوارت", "ديفيد تشيس", "فينس جيليغان"], correct: 0 },
    { q: "كم عدد مواسم مسلسل فريندز؟", options: ["8", "9", "10", "11"], correct: 2 }
];

io.on('connection', (socket) => {
    console.log('👤 لاعب متصل:', socket.id);

    // إنشاء غرفة
    socket.on('createRoom', ({ playerName, gameMode }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        rooms.set(roomCode, {
            id: roomCode,
            gameMode: gameMode || '1v1',
            players: [{
                id: socket.id,
                name: playerName,
                isCreator: true,
                isReady: false,
                team: 'teamA'
            }],
            gameStarted: false,
            currentRound: 1,
            currentQuestionIndex: 0,
            scores: { teamA: 0, teamB: 0 },
            roundData: null
        });
        
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, gameMode: gameMode || '1v1' });
        io.to(roomCode).emit('playersUpdate', rooms.get(roomCode).players);
        console.log(`✅ غرفة جديدة: ${roomCode}`);
    });

    // انضمام إلى غرفة
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
            isCreator: false,
            isReady: false,
            team: 'teamB'
        });
        
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });
        io.to(roomCode).emit('playersUpdate', room.players);
        console.log(`✅ لاعب انضم: ${playerName}`);
    });

    // التحقق من وجود غرفة
    socket.on('checkRoom', (roomCode, callback) => {
        const room = rooms.get(roomCode);
        callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    // لاعب جاهز
    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            
            const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
            if (allReady && !room.gameStarted) {
                console.log(`🎮 بدء اللعبة في غرفة ${roomCode}`);
                room.gameStarted = true;
                startGame(roomCode);
            }
        }
    });

    // بدء اللعبة يدوياً
    socket.on('forceStartGame', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player && player.isCreator && !room.gameStarted && room.players.length >= 2) {
            console.log(`🎮 المدير بدأ اللعبة في غرفة ${roomCode}`);
            room.gameStarted = true;
            startGame(roomCode);
        }
    });

    function startGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        console.log(`🔥 بدء اللعبة فعلياً في غرفة ${roomCode}`);
        
        room.currentRound = 1;
        room.currentQuestionIndex = 0;
        room.scores = { teamA: 0, teamB: 0 };
        
        // إرسال بدء اللعبة للجميع
        io.to(roomCode).emit('gameStarted', {
            gameMode: room.gameMode,
            players: room.players
        });
        
        // تحميل الجولة الأولى بعد ثانية
        setTimeout(() => {
            loadRound(roomCode, 1);
        }, 1000);
    }

    function loadRound(roomCode, round) {
        const room = rooms.get(roomCode);
        if (!room) {
            console.log(`❌ غرفة ${roomCode} غير موجودة`);
            return;
        }
        
        console.log(`🔄 تحميل الجولة ${round} في غرفة ${roomCode}`);
        room.currentRound = round;
        
        // إرسال معلومات الجولة
        io.to(roomCode).emit('roundLoaded', {
            round: round,
            scores: room.scores
        });
        
        // تحميل المحتوى حسب الجولة
        switch(round) {
            case 1:
                loadIronManRound(roomCode);
                break;
            case 2:
                loadSportsRound(roomCode);
                break;
            case 3:
                loadGamingRound(roomCode);
                break;
            case 4:
                loadSeriesRound(roomCode);
                break;
            case 5:
                endGame(roomCode);
                break;
        }
    }

    function loadIronManRound(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        console.log(`🎨 تحميل جولة الرجل الحديدي في غرفة ${roomCode}`);
        
        room.roundData = {
            type: 'ironman',
            questions: ironManQuestions,
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendIronManQuestion(roomCode);
    }

    function sendIronManQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 1) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        console.log(`📤 إرسال سؤال الرجل الحديدي ${room.roundData.currentIndex + 1}: ${q.emojis}`);
        
        io.to(roomCode).emit('showIronManQuestion', {
            emojis: q.emojis,
            hint: q.hint,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.currentAnswer = q.answer;
        room.roundData.answers = { teamA: null, teamB: null };
    }

    function loadSportsRound(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        console.log(`⚽ تحميل جولة الأسئلة الكروية في غرفة ${roomCode}`);
        
        room.roundData = {
            type: 'sports',
            questions: sportsQuestions1v1,
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendSportsQuestion(roomCode);
    }

    function sendSportsQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 2) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        console.log(`📤 إرسال سؤال كروي ${room.roundData.currentIndex + 1}: ${q.q}`);
        
        io.to(roomCode).emit('showSportsQuestion', {
            question: q,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.currentCorrect = q.correct;
        room.roundData.answers = { teamA: null, teamB: null };
    }

    function loadGamingRound(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        console.log(`🎮 تحميل جولة أسئلة الألعاب في غرفة ${roomCode}`);
        
        room.roundData = {
            type: 'gaming',
            questions: gamingQuestions,
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendGamingQuestion(roomCode);
    }

    function sendGamingQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 3) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        console.log(`📤 إرسال سؤال ألعاب ${room.roundData.currentIndex + 1}: ${q.q}`);
        
        io.to(roomCode).emit('showGamingQuestion', {
            question: q,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.currentCorrect = q.correct;
        room.roundData.answers = { teamA: null, teamB: null };
    }

    function loadSeriesRound(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        console.log(`📺 تحميل جولة أسئلة المسلسلات في غرفة ${roomCode}`);
        
        room.roundData = {
            type: 'series',
            questions: seriesQuestions,
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendSeriesQuestion(roomCode);
    }

    function sendSeriesQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 4) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        console.log(`📤 إرسال سؤال مسلسلات ${room.roundData.currentIndex + 1}: ${q.q}`);
        
        io.to(roomCode).emit('showSeriesQuestion', {
            question: q,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.currentCorrect = q.correct;
        room.roundData.answers = { teamA: null, teamB: null };
    }

    // إجابة الرجل الحديدي
    socket.on('submitIronManAnswer', ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 1) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const team = player.team;
        const isCorrect = answer.trim().toLowerCase() === room.roundData.currentAnswer.toLowerCase();
        
        if (room.roundData.answers[team] === null) {
            room.roundData.answers[team] = isCorrect;
            if (isCorrect) {
                room.roundData.scores[team] += 10;
            }
            
            io.to(roomCode).emit('answerResult', {
                team: team,
                isCorrect: isCorrect,
                correctAnswer: room.roundData.currentAnswer
            });
            
            // التحقق من إجابة الفريقين
            if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
                room.roundData.currentIndex++;
                
                if (room.roundData.currentIndex >= room.roundData.questions.length) {
                    // نهاية الجولة
                    room.scores.teamA += room.roundData.scores.teamA;
                    room.scores.teamB += room.roundData.scores.teamB;
                    
                    io.to(roomCode).emit('roundEnd', {
                        round: 1,
                        roundScores: room.roundData.scores,
                        totalScores: room.scores
                    });
                    
                    setTimeout(() => loadRound(roomCode, 2), 3000);
                } else {
                    setTimeout(() => sendIronManQuestion(roomCode), 2000);
                }
            }
        }
    });

    // إجابة الأسئلة العادية
    socket.on('submitNormalAnswer', ({ roomCode, answerIndex }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const team = player.team;
        const isCorrect = (answerIndex === room.roundData.currentCorrect);
        
        if (room.roundData.answers[team] === null) {
            room.roundData.answers[team] = isCorrect;
            if (isCorrect) {
                room.roundData.scores[team] += 10;
            }
            
            io.to(roomCode).emit('answerResult', {
                team: team,
                isCorrect: isCorrect
            });
            
            if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
                room.roundData.currentIndex++;
                
                const totalQuestions = room.roundData.questions.length;
                if (room.roundData.currentIndex >= totalQuestions) {
                    room.scores.teamA += room.roundData.scores.teamA;
                    room.scores.teamB += room.roundData.scores.teamB;
                    
                    let nextRound = room.currentRound + 1;
                    io.to(roomCode).emit('roundEnd', {
                        round: room.currentRound,
                        roundScores: room.roundData.scores,
                        totalScores: room.scores
                    });
                    
                    setTimeout(() => loadRound(roomCode, nextRound), 3000);
                } else {
                    // إرسال السؤال التالي حسب نوع الجولة
                    if (room.roundData.type === 'sports') {
                        setTimeout(() => sendSportsQuestion(roomCode), 2000);
                    } else if (room.roundData.type === 'gaming') {
                        setTimeout(() => sendGamingQuestion(roomCode), 2000);
                    } else if (room.roundData.type === 'series') {
                        setTimeout(() => sendSeriesQuestion(roomCode), 2000);
                    }
                }
            }
        }
    });

    function endGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        let winner = '';
        if (room.scores.teamA > room.scores.teamB) winner = 'اللاعب 1';
        else if (room.scores.teamB > room.scores.teamA) winner = 'اللاعب 2';
        else winner = 'تعادل';
        
        io.to(roomCode).emit('gameEnd', {
            finalScores: room.scores,
            winner: winner
        });
    }

    socket.on('disconnect', () => {
        console.log('👤 لاعب غادر:', socket.id);
        for (const [code, room] of rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit('playersUpdate', room.players);
                if (room.players.length === 0) {
                    rooms.delete(code);
                    console.log(`🗑️ تم حذف غرفة ${code}`);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 السيربر يعمل على http://localhost:${PORT}`);
    console.log(`📱 افتح الرابط على هاتفك للعب\n`);
});