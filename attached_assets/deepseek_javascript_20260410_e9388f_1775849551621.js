socket.on('playerReady', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        player.isReady = true;
        io.to(roomCode).emit('playersUpdate', room.players);
        
        if (room.players.length === 2 && room.players.every(p => p.isReady) && !room.gameStarted) {
            room.gameStarted = true;
            io.to(roomCode).emit('gameStarted', { 
                gameMode: room.gameMode,
                teamAName: room.teamAName,
                teamBName: room.teamBName,
                teamAColor: room.teamAColor,
                teamBColor: room.teamBColor
            });
            startGame(roomCode);  // <--- تأكد أن هذا السطر موجود
        }
    }
});