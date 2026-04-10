// ... (نفس الكود السابق حتى socket.on('playerReady'))

    // تجهيز اللاعب - تم إصلاحه
    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            io.to(roomCode).emit('systemMessage', `${player.name} جاهز!`);
            
            // حساب عدد اللاعبين الجاهزين
            const readyPlayers = room.players.filter(p => p.isReady).length;
            const totalPlayers = room.players.length;
            const minPlayers = room.gameMode === '2v2' ? 4 : 2;
            
            console.log(`غرفة ${roomCode}: ${readyPlayers}/${totalPlayers} جاهزين, نحتاج ${minPlayers} لاعبين`);
            
            // بدء اللعبة إذا كان العدد كافياً والجميع جاهز
            if (totalPlayers >= minPlayers && readyPlayers === totalPlayers) {
                io.to(roomCode).emit('systemMessage', '🎮 الجميع جاهز! بدء اللعبة...');
                setTimeout(() => startGame(roomCode), 2000);
            } else if (totalPlayers >= minPlayers && readyPlayers < totalPlayers) {
                io.to(roomCode).emit('systemMessage', `⏳ في انتظار ${minPlayers - readyPlayers} لاعبين آخرين...`);
            } else if (totalPlayers < minPlayers) {
                io.to(roomCode).emit('systemMessage', `⏳ نحتاج ${minPlayers - totalPlayers} لاعبين إضافيين للبدء`);
            }
        }
    });

    // بدء اللعبة فوراً (للمدير) - تم إصلاحه
    socket.on('forceStartGame', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room || room.creatorId !== socket.id) {
            socket.emit('error', 'ليس لديك صلاحية لبدء اللعبة');
            return;
        }
        
        const minPlayers = room.gameMode === '2v2' ? 2 : 2; // يمكن البدء بلاعبين فقط
        if (room.players.length >= minPlayers) {
            io.to(roomCode).emit('systemMessage', '🎮 المدير بدأ اللعبة!');
            startGame(roomCode);
        } else {
            socket.emit('error', `يحتاج اللعب إلى ${minPlayers} لاعبين على الأقل`);
        }
    });

    // دالة بدء اللعبة - تم إصلاحها
    async function startGame(roomCode) {
        const room = rooms.get(roomCode);
        if (!room) {
            console.log(`غرفة ${roomCode} غير موجودة`);
            return;
        }
        
        console.log(`بدء اللعبة في غرفة ${roomCode} - وضع ${room.gameMode}`);
        
        room.currentRound = 1;
        room.teamAScore = 0;
        room.teamBScore = 0;
        
        // توزيع الفرق تلقائياً إذا لم يتم اختيارها
        if (room.gameMode === '1v1') {
            if (room.players.length >= 2) {
                room.players[0].team = 'teamA';
                room.players[1].team = 'teamB';
            }
        } else {
            // 2v2 - توزيع متساوٍ
            const teamASlots = room.players.filter(p => p.team === 'teamA').length;
            const teamBSlots = room.players.filter(p => p.team === 'teamB').length;
            
            room.players.forEach(player => {
                if (!player.team) {
                    if (teamASlots <= teamBSlots) {
                        player.team = 'teamA';
                    } else {
                        player.team = 'teamB';
                    }
                }
            });
        }
        
        io.to(roomCode).emit('playersUpdate', room.players);
        io.to(roomCode).emit('gameStarted', { gameMode: room.gameMode });
        
        // تأخير صغير قبل تحميل الجولة الأولى
        setTimeout(() => {
            loadRound(roomCode, 1);
        }, 1000);
    }