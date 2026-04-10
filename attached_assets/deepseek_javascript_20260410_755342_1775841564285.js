const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// تخزين الغرف واللاعبين
const rooms = new Map();

// الأسئلة
const sportsQuestions = [
    { q: "من فاز بكأس العالم 2018؟", options: ["ألمانيا", "فرنسا", "البرازيل", "الأرجنتين"], correct: 1 },
    { q: "من هو لاعب كرة القدم الحاصل على أكبر عدد من كرات الذهب؟", options: ["ميسي", "رونالدو", "نيمار", "مبابي"], correct: 0 },
    { q: "ما هي الرياضة التي تلعب بالريشة؟", options: ["التنس", "الريشة الطائرة", "اسكواش", "تنس الطاولة"], correct: 1 },
    { q: "من هو بطل الدوري الإسباني 2022-2023؟", options: ["ريال مدريد", "برشلونة", "أتلتيكو مدريد", "إشبيلية"], correct: 1 },
    { q: "كم عدد لاعبين كرة السلة في الملعب لكل فريق؟", options: ["5", "6", "7", "11"], correct: 0 },
    { q: "من فاز بجائزة الكرة الذهبية 2022؟", options: ["ميسي", "بنزيما", "ليفاندوفسكي", "دي بروين"], correct: 1 },
    { q: "ما هي الرياضة التي يلعبها روجر فيدرر؟", options: ["كرة القدم", "التنس", "الغولف", "السباحة"], correct: 1 },
    { q: "كم عدد أهداف ميسي في كأس العالم 2022؟", options: ["5", "6", "7", "8"], correct: 2 }
];

const weirdQuestions = [
    { q: "ما هو الشيء الذي كلما زاد نقص؟", correct: "العمر" },
    { q: "ما هو الشيء الذي يقرصك ولا تراه؟", correct: "الجوع" },
    { q: "ما هو الشيء الذي له أوراق لكنه ليس شجرة؟", correct: "الكتاب" },
    { q: "ما هو الشيء الذي ينام ولا يقوم إلا إذا أكل؟", correct: "النار" },
    { q: "ما هو الشيء الذي له عين ولا يرى؟", correct: "الإبرة" },
    { q: "ما هو الشيء الذي كلما أخذت منه كبر؟", correct: "الحفرة" }
];

const drawingWords = ["شمس", "قمر", "نجم", "بيت", "سيارة", "قطة", "كلب", "وردة", "بحر", "جبل"];

// إنشاء غرفة جديدة
function createRoom(roomCode, creatorId, creatorName, settings) {
    rooms.set(roomCode, {
        id: roomCode,
        creatorId: creatorId,
        players: [{
            id: creatorId,
            name: creatorName,
            team: null,
            isReady: false,
            isCreator: true
        }],
        currentRound: 1,
        teamAScore: 0,
        teamBScore: 0,
        gameMode: '2v2',
        roundData: null,
        waitingForAction: false,
        settings: settings || {
            pointsPerCorrect: 10,
            drawingPoints: 20,
            weirdPoints: 2,
            spyPoints: 30,
            timeLimit: 30
        }
    });
    return roomCode;
}

io.on('connection', (socket) => {
    console.log('لاعب جديد متصل:', socket.id);

    // إنشاء غرفة جديدة
    socket.on('createRoom', ({ playerName, settings }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        createRoom(roomCode, socket.id, playerName, settings);
        
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerId: socket.id, isCreator: true });
        io.to(roomCode).emit('playersUpdate', rooms.get(roomCode).players);
        io.to(roomCode).emit('roomSettings', rooms.get(roomCode).settings);
    });

    // الانضمام إلى غرفة
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('error', 'الغرفة غير موجودة');
            return;
        }
        
        if (room.players.length >= 4) {
            socket.emit('error', 'الغرفة ممتلئة');
            return;
        }
        
        room.players.push({
            id: socket.id,
            name: playerName,
            team: null,
            isReady: false,
            isCreator: false
        });
        
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerId: socket.id, isCreator: false });
        io.to(roomCode).emit('playersUpdate', room.players);
    });

    // التحقق من وجود غرفة (للتأكد قبل الانضمام)
    socket.on('checkRoom', (roomCode, callback) => {
        const room = rooms.get(roomCode);
        callback({ exists: !!room, playerCount: room ? room.players.length : 0 });
    });

    // تحديث إعدادات الغرفة (للمدير فقط)
    socket.on('updateSettings', ({ roomCode, settings }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) {
            socket.emit('error', 'ليس لديك صلاحية لتعديل الإعدادات');
            return;
        }
        
        room.settings = { ...room.settings, ...settings };
        io.to(roomCode).emit('roomSettings', room.settings);
        io.to(roomCode).emit('systemMessage', 'تم تحديث إعدادات الغرفة');
    });

    // طرد لاعب (للمدير فقط)
    socket.on('kickPlayer', ({ roomCode, playerId }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) {
            socket.emit('error', 'ليس لديك صلاحية لطرد اللاعبين');
            return;
        }
        
        const playerIndex = room.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1 && room.players[playerIndex].id !== room.creatorId) {
            const kickedPlayer = room.players[playerIndex];
            io.to(playerId).emit('kicked', 'تم طردك من الغرفة من قبل المدير');
            io.sockets.sockets.get(playerId)?.leave(roomCode);
            room.players.splice(playerIndex, 1);
            io.to(roomCode).emit('playersUpdate', room.players);
            io.to(roomCode).emit('systemMessage', `تم طرد ${kickedPlayer.name} من الغرفة`);
        }
    });

    // تبديل فريق اللاعب (للمدير فقط)
    socket.on('switchTeam', ({ roomCode, playerId, newTeam }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) {
            socket.emit('error', 'ليس لديك صلاحية لتغيير الفرق');
            return;
        }
        
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            player.team = newTeam;
            io.to(roomCode).emit('playersUpdate', room.players);
            io.to(roomCode).emit('systemMessage', `تم نقل ${player.name} إلى فريق ${newTeam === 'teamA' ? 'النور' : 'الظلام'}`);
        }
    });

    // تغيير وضع اللعبة (للمدير فقط)
    socket.on('changeGameMode', ({ roomCode, mode }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) return;
        
        room.gameMode = mode;
        io.to(roomCode).emit('gameModeChanged', mode);
        io.to(roomCode).emit('systemMessage', `تم تغيير وضع اللعبة إلى ${mode === '2v2' ? '2 ضد 2' : '1 ضد 1'}`);
    });

    // اختيار الفريق (لللاعب العادي)
    socket.on('chooseTeam', ({ roomCode, team }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.isCreator) {
            // التحقق من عدد اللاعبين في الفريق
            const teamCount = room.players.filter(p => p.team === team).length;
            const maxPerTeam = room.gameMode === '2v2' ? 2 : 1;
            
            if (teamCount >= maxPerTeam) {
                socket.emit('error', 'هذا الفريق ممتلئ');
                return;
            }
            player.team = team;
            io.to(roomCode).emit('playersUpdate', room.players);
        }
    });

    // تجهيز اللاعب
    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            
            // التحقق من أن جميع اللاعبين جاهزين (باستثناء المدير إذا كان لوحده)
            const playersNeeded = room.gameMode === '2v2' ? 4 : 2;
            const readyPlayers = room.players.filter(p => p.isReady).length;
            const allReady = room.players.length >= playersNeeded && room.players.every(p => p.isReady);
            
            if (allReady) {
                startGame(roomCode);
            }
        }
    });

    // بدء اللعبة (للمدير فقط - يمكنه البدء حتى لو ليس الجميع جاهز)
    socket.on('forceStartGame', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) return;
        
        if (room.players.length >= 2) {
            startGame(roomCode);
        } else {
            socket.emit('error', 'يجب وجود لاعبين على الأقل لبدء اللعبة');
        }
    });

    async function startGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.currentRound = 1;
        room.teamAScore = 0;
        room.teamBScore = 0;
        
        io.to(roomCode).emit('gameStarted', { room });
        loadRound(roomCode, 1);
    }

    // تحميل جولة
    async function loadRound(roomCode, round) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.currentRound = round;
        io.to(roomCode).emit('roundLoaded', { 
            round, 
            scores: { teamA: room.teamAScore, teamB: room.teamBScore },
            settings: room.settings
        });
        
        switch(round) {
            case 1:
                loadRound1(roomCode);
                break;
            case 2:
                loadRound2(roomCode);
                break;
            case 3:
                loadRound3(roomCode);
                break;
            case 4:
                loadRound4(roomCode);
                break;
            case 5:
                endGame(roomCode);
                break;
        }
    }

    // الجولة 1: أسئلة كروية
    function loadRound1(roomCode) {
        const room = rooms.get(roomCode);
        const shuffled = [...sportsQuestions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        room.roundData = {
            questions: shuffled.slice(0, 4),
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendQuestionToTeams(roomCode);
    }
    
    function sendQuestionToTeams(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 1) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        io.to(roomCode).emit('showQuestion', {
            round: 1,
            question: q,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.answers = { teamA: null, teamB: null };
    }
    
    socket.on('submitAnswer', ({ roomCode, team, answerIndex }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 1) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        const isCorrect = (answerIndex === q.correct);
        
        if (room.roundData.answers[team] === null) {
            room.roundData.answers[team] = isCorrect;
            if (isCorrect) {
                room.roundData.scores[team] += room.settings.pointsPerCorrect;
            }
            
            io.to(roomCode).emit('teamAnswered', { team, isCorrect });
            
            if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
                room.roundData.currentIndex++;
                
                if (room.roundData.currentIndex >= room.roundData.questions.length) {
                    room.teamAScore += room.roundData.scores.teamA;
                    room.teamBScore += room.roundData.scores.teamB;
                    io.to(roomCode).emit('roundEnd', {
                        round: 1,
                        scores: { teamA: room.roundData.scores.teamA, teamB: room.roundData.scores.teamB },
                        totalScores: { teamA: room.teamAScore, teamB: room.teamBScore }
                    });
                    setTimeout(() => loadRound(roomCode, 2), 3000);
                } else {
                    setTimeout(() => sendQuestionToTeams(roomCode), 2000);
                }
            }
        }
    });

    // الجولة 2: الرسم
    function loadRound2(roomCode) {
        const room = rooms.get(roomCode);
        const word = drawingWords[Math.floor(Math.random() * drawingWords.length)];
        
        room.roundData = {
            word: word,
            drawings: { teamA: null, teamB: null },
            guesses: { teamA: null, teamB: null },
            wordLength: word.length
        };
        
        io.to(roomCode).emit('startDrawing', {
            word: word,
            wordLength: word.length
        });
    }
    
    socket.on('submitDrawing', ({ roomCode, team, drawingData }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 2) return;
        
        room.roundData.drawings[team] = drawingData;
        io.to(roomCode).emit('drawingSubmitted', { team });
        
        if (room.roundData.drawings.teamA && room.roundData.drawings.teamB) {
            io.to(roomCode).emit('showGuesses', {
                drawingA: room.roundData.drawings.teamA,
                drawingB: room.roundData.drawings.teamB,
                wordLength: room.roundData.wordLength
            });
        }
    });
    
    socket.on('submitGuess', ({ roomCode, team, guess }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 2) return;
        
        const isCorrect = (guess === room.roundData.word);
        
        if (room.roundData.guesses[team] === null) {
            room.roundData.guesses[team] = isCorrect;
            
            if (isCorrect) {
                if (team === 'teamA') room.teamAScore += room.settings.drawingPoints;
                else room.teamBScore += room.settings.drawingPoints;
            }
            
            io.to(roomCode).emit('guessResult', { team, isCorrect, correctWord: room.roundData.word });
            
            if (room.roundData.guesses.teamA !== null && room.roundData.guesses.teamB !== null) {
                io.to(roomCode).emit('roundEnd', {
                    round: 2,
                    scores: { 
                        teamA: room.roundData.guesses.teamA ? room.settings.drawingPoints : 0, 
                        teamB: room.roundData.guesses.teamB ? room.settings.drawingPoints : 0 
                    },
                    totalScores: { teamA: room.teamAScore, teamB: room.teamBScore }
                });
                setTimeout(() => loadRound(roomCode, 3), 3000);
            }
        }
    });

    // الجولة 3: الأسئلة الغريبة
    function loadRound3(roomCode) {
        const room = rooms.get(roomCode);
        const shuffled = [...weirdQuestions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        room.roundData = {
            questions: shuffled.slice(0, 4),
            currentIndex: 0,
            answers: { teamA: null, teamB: null },
            scores: { teamA: 0, teamB: 0 }
        };
        
        sendWeirdQuestion(roomCode);
    }
    
    function sendWeirdQuestion(roomCode) {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 3) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        const fakeAnswers = ["الثلج", "النار", "الماء", "الهواء", "التراب", "الريح", "الضوء", "الظل"];
        let options = [q.correct, ...fakeAnswers.slice(0, 3)];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        
        room.roundData.currentOptions = options;
        
        io.to(roomCode).emit('showWeirdQuestion', {
            question: q,
            options: options,
            questionNumber: room.roundData.currentIndex + 1,
            totalQuestions: room.roundData.questions.length
        });
        
        room.roundData.answers = { teamA: null, teamB: null };
    }
    
    socket.on('submitWeirdAnswer', ({ roomCode, team, answer }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 3) return;
        
        const q = room.roundData.questions[room.roundData.currentIndex];
        const isCorrect = (answer === q.correct);
        
        if (room.roundData.answers[team] === null) {
            room.roundData.answers[team] = answer;
            
            if (isCorrect) {
                room.roundData.scores[team] += room.settings.weirdPoints;
            }
            
            io.to(roomCode).emit('weirdTeamAnswered', { team, answer });
            
            if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
                if (room.roundData.answers.teamA === room.roundData.answers.teamB && 
                    room.roundData.answers.teamA !== q.correct) {
                    room.roundData.scores.teamA -= 1;
                    room.roundData.scores.teamB -= 1;
                } else if (room.roundData.answers.teamA !== q.correct && 
                           room.roundData.answers.teamB === room.roundData.answers.teamA) {
                    room.roundData.scores.teamB += 1;
                } else if (room.roundData.answers.teamB !== q.correct && 
                           room.roundData.answers.teamA === room.roundData.answers.teamB) {
                    room.roundData.scores.teamA += 1;
                }
                
                room.roundData.currentIndex++;
                
                if (room.roundData.currentIndex >= room.roundData.questions.length) {
                    room.teamAScore += room.roundData.scores.teamA;
                    room.teamBScore += room.roundData.scores.teamB;
                    io.to(roomCode).emit('roundEnd', {
                        round: 3,
                        scores: room.roundData.scores,
                        totalScores: { teamA: room.teamAScore, teamB: room.teamBScore }
                    });
                    setTimeout(() => loadRound(roomCode, 4), 3000);
                } else {
                    setTimeout(() => sendWeirdQuestion(roomCode), 2000);
                }
            }
        }
    });

    // الجولة 4: كود نيمز
    function loadRound4(roomCode) {
        const room = rooms.get(roomCode);
        const wordsList = [
            { word: "شمس", clues: ["سماء", "نهار", "حرارة", "ضوء"] },
            { word: "بحر", clues: ["ماء", "ملح", "موج", "شاطئ"] },
            { word: "جبل", clues: ["صخر", "مرتفع", "طبيعة", "قمة"] },
            { word: "نجم", clues: ["سماء", "ليل", "مضيء", "فضاء"] },
            { word: "وردة", clues: ["زهرة", "أحمر", "جميلة", "رائحة"] }
        ];
        
        const selected = wordsList[Math.floor(Math.random() * wordsList.length)];
        
        room.roundData = {
            word: selected.word,
            clues: selected.clues,
            spyClues: { teamA: null, teamB: null },
            guesses: { teamA: null, teamB: null }
        };
        
        io.to(roomCode).emit('startSpyMaster', {
            word: selected.word,
            clues: selected.clues
        });
    }
    
    socket.on('submitSpyClue', ({ roomCode, team, clue }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 4) return;
        
        room.roundData.spyClues[team] = clue;
        io.to(roomCode).emit('spyClueSubmitted', { team });
        
        if (room.roundData.spyClues.teamA && room.roundData.spyClues.teamB) {
            io.to(roomCode).emit('showSpyGuesses', {
                clueA: room.roundData.spyClues.teamA,
                clueB: room.roundData.spyClues.teamB
            });
        }
    });
    
    socket.on('submitSpyGuess', ({ roomCode, team, guess }) => {
        const room = rooms.get(roomCode);
        if (!room || room.currentRound !== 4) return;
        
        const isCorrect = (guess === room.roundData.word);
        
        if (room.roundData.guesses[team] === null) {
            room.roundData.guesses[team] = isCorrect;
            
            if (isCorrect) {
                if (team === 'teamA') room.teamAScore += room.settings.spyPoints;
                else room.teamBScore += room.settings.spyPoints;
            }
            
            io.to(roomCode).emit('spyGuessResult', { team, isCorrect, correctWord: room.roundData.word });
            
            if (room.roundData.guesses.teamA !== null && room.roundData.guesses.teamB !== null) {
                io.to(roomCode).emit('roundEnd', {
                    round: 4,
                    scores: { 
                        teamA: room.roundData.guesses.teamA ? room.settings.spyPoints : 0, 
                        teamB: room.roundData.guesses.teamB ? room.settings.spyPoints : 0 
                    },
                    totalScores: { teamA: room.teamAScore, teamB: room.teamBScore }
                });
                setTimeout(() => loadRound(roomCode, 5), 3000);
            }
        }
    });

    // نهاية اللعبة
    function endGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        let winner = '';
        if (room.teamAScore > room.teamBScore) winner = 'فريق النور';
        else if (room.teamBScore > room.teamAScore) winner = 'فريق الظلام';
        else winner = 'تعادل';
        
        io.to(roomCode).emit('gameEnd', {
            finalScores: { teamA: room.teamAScore, teamB: room.teamBScore },
            winner: winner
        });
    }

    // مغادرة اللاعب
    socket.on('disconnect', () => {
        for (const [roomCode, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const leftPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                io.to(roomCode).emit('playersUpdate', room.players);
                io.to(roomCode).emit('systemMessage', `غادر ${leftPlayer.name} الغرفة`);
                
                if (room.players.length === 0) {
                    rooms.delete(roomCode);
                } else if (room.creatorId === socket.id && room.players.length > 0) {
                    // تعيين مدير جديد
                    room.creatorId = room.players[0].id;
                    room.players[0].isCreator = true;
                    io.to(roomCode).emit('newCreator', room.players[0].id);
                    io.to(roomCode).emit('systemMessage', `${room.players[0].name} هو المدير الجديد`);
                    io.to(roomCode).emit('playersUpdate', room.players);
                }
                break;
            }
        }
        console.log('لاعب غادر:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 السيربر يعمل على http://localhost:${PORT}`);
    console.log(`📱 افتح الرابط على هاتفك للعب`);
});