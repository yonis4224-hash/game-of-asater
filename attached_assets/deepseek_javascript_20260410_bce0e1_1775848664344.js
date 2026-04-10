socket.on('playerReady', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        player.isReady = true;
        io.to(roomCode).emit('playersUpdate', room.players);
        console.log(`✅ ${player.name} جاهز في ${roomCode}`);
        
        // طباعة حالة اللاعبين للتصحيح
        console.log(`اللاعبين في الغرفة ${roomCode}:`, room.players.map(p => ({ name: p.name, isReady: p.isReady })));
        
        const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
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
        } else if (room.players.length >= 2 && !allReady) {
            console.log(`⏳ في انتظار لاعبين: ${room.players.filter(p => !p.isReady).map(p => p.name)}`);
        } else {
            console.log(`⏳ عدد اللاعبين غير كافٍ (${room.players.length}/2)`);
        }
    }
});