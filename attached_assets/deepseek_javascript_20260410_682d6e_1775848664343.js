const allReady = room.players.length === 2 && room.players.every(p => p.isReady);
if (allReady && !room.gameStarted) {
    room.gameStarted = true;
    io.to(roomCode).emit('gameStarted', {...});
    startGame(roomCode);
}