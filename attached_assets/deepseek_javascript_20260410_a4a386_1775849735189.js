// استبدل دالة startGame بهذه النسخة
function startGame(roomCode) {
    console.log(`🔥 بدء اللعبة في غرفة ${roomCode}`);
    const room = rooms.get(roomCode);
    if (!room) {
        console.log(`❌ الغرفة غير موجودة`);
        return;
    }
    
    room.currentRound = 1;
    room.scores = { teamA: 0, teamB: 0 };
    
    // أرسل تأكيد بدء اللعبة للجميع
    io.to(roomCode).emit('gameStarted', {
        gameMode: room.gameMode,
        teamAName: room.teamAName,
        teamBName: room.teamBName,
        teamAColor: room.teamAColor,
        teamBColor: room.teamBColor
    });
    
    // ابدأ الجولة الأولى مباشرة
    loadRound(roomCode, 1);
}

// استبدل دالة loadRound بهذه النسخة
function loadRound(roomCode, round) {
    console.log(`🔄 تحميل الجولة ${round} في غرفة ${roomCode}`);
    const room = rooms.get(roomCode);
    if (!room) {
        console.log(`❌ الغرفة غير موجودة في loadRound`);
        return;
    }
    
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
    
    console.log(`📤 إرسال roundStart للجولة ${round}`);
    
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
    
    // أرسل السؤال الأول مباشرة
    sendQuestion(roomCode);
}

// استبدل دالة sendQuestion بهذه النسخة
function sendQuestion(roomCode) {
    console.log(`📤 إرسال السؤال في غرفة ${roomCode}`);
    const room = rooms.get(roomCode);
    if (!room) {
        console.log(`❌ الغرفة غير موجودة في sendQuestion`);
        return;
    }
    
    if (room.waitingForNext) {
        console.log(`⏳ في انتظار الانتقال للسؤال التالي`);
        return;
    }
    
    const q = room.roundData.questions[room.roundData.currentIndex];
    const isIronMan = (room.roundData.type === 'ironman');
    
    console.log(`📤 السؤال ${room.roundData.currentIndex + 1}/${room.roundData.questions.length}`);
    
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

// تأكد من وجود هذه الدالة
function getRandomQuestions(category, count = 5) {
    if (!questionsDB[category]) {
        console.log(`❌ التصنيف ${category} غير موجود`);
        return [];
    }
    const shuffled = [...questionsDB[category]];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}