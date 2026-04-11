function endGame(roomCode) {
    console.log(`🏁 [DEBUG] endGame for room ${roomCode}`);
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