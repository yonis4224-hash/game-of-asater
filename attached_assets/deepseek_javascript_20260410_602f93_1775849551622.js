socket.on('submitAnswer', ({ roomCode, answer }) => {
    console.log(`📝 [DEBUG] submitAnswer from ${socket.id} in room ${roomCode}: ${answer}`);
    const room = rooms.get(roomCode);
    if (!room || room.waitingForNext) {
        console.log(`⚠️ [DEBUG] Cannot submit: room=${!!room}, waiting=${room?.waitingForNext}`);
        return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answered) {
        console.log(`⚠️ [DEBUG] Player already answered or not found`);
        return;
    }
    
    const team = player.team;
    const currentQ = room.roundData.questions[room.roundData.currentIndex];
    const isCorrect = (answer.trim().toLowerCase() === currentQ.answer.toLowerCase());
    
    console.log(`📝 [DEBUG] Team ${team} answered, correct: ${isCorrect}`);
    
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
    
    // التحقق من إجابة الفريقين
    if (room.roundData.answers.teamA !== null && room.roundData.answers.teamB !== null) {
        console.log(`📝 [DEBUG] Both teams answered, moving to next question`);
        room.waitingForNext = true;
        
        setTimeout(() => {
            room.roundData.currentIndex++;
            
            if (room.roundData.currentIndex >= room.roundData.questions.length) {
                // نهاية الجولة
                console.log(`🏆 [DEBUG] Round ${room.currentRound} finished`);
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
                        console.log(`🔄 [DEBUG] Moving to round ${room.currentRound + 1}`);
                        loadRound(roomCode, room.currentRound + 1);
                    } else {
                        console.log(`🏁 [DEBUG] Game finished`);
                        endGame(roomCode);
                    }
                }, 4000);
            } else {
                console.log(`🔄 [DEBUG] Moving to next question ${room.roundData.currentIndex + 1}`);
                room.waitingForNext = false;
                sendQuestion(roomCode);
            }
        }, 2000);
    }
});