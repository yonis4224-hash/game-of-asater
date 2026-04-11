    function showRoomScreen() {
        lobbyScreen.classList.add('hidden');
        roomScreen.classList.remove('hidden');
        gameScreen.classList.add('hidden');
        
        document.getElementById('roomCodeDisplay').innerText = currentRoom;
        
        if (isCreator) {
            document.getElementById('adminControls').classList.remove('hidden');
        } else {
            document.getElementById('adminControls').classList.add('hidden');
        }
        
        // إعادة تمكين زر الجاهزية
        const readyBtn = document.getElementById('readyBtn');
        readyBtn.disabled = false;
        readyBtn.innerText = '✓ أنا جاهز';
        
        // أحداث المدير
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            const settings = {
                pointsPerCorrect: parseInt(document.getElementById('pointsPerCorrect').value),
                drawingPoints: parseInt(document.getElementById('drawingPoints').value),
                weirdPoints: parseInt(document.getElementById('weirdPoints').value),
                spyPoints: parseInt(document.getElementById('spyPoints').value)
            };
            socket.emit('updateSettings', { roomCode: currentRoom, settings });
        });
        
        document.getElementById('forceStartBtn')?.addEventListener('click', () => {
            socket.emit('forceStartGame', { roomCode: currentRoom });
        });
        
        document.getElementById('gameModeSelect')?.addEventListener('change', (e) => {
            socket.emit('changeGameMode', { roomCode: currentRoom, mode: e.target.value });
        });
        
        document.getElementById('copyRoomBtn').onclick = () => {
            const url = `${window.location.origin}?room=${currentRoom}`;
            navigator.clipboard.writeText(url);
            showToast('تم نسخ رابط الغرفة');
        };
        
        // اختيار الفريق
        document.querySelectorAll('.team-btn').forEach(btn => {
            btn.onclick = () => {
                const team = btn.dataset.team;
                socket.emit('chooseTeam', { roomCode: currentRoom, team });
            };
        });
        
        // زر الجاهزية - تم إصلاحه
        document.getElementById('readyBtn').onclick = () => {
            const btn = document.getElementById('readyBtn');
            if (btn.disabled) return;
            
            btn.disabled = true;
            btn.innerText = '✓ تم التجهيز';
            socket.emit('playerReady', { roomCode: currentRoom });
        };
    }
    
    function updatePlayersList(players) {
        const container = document.getElementById('playersList');
        const gameStatus = document.getElementById('gameStatus');
        
        if (!players || players.length === 0) {
            container.innerHTML = '<div style="text-align: center;">لا يوجد لاعبون...</div>';
            return;
        }
        
        const minPlayers = window.currentGameMode === '2v2' ? 4 : 2;
        const readyCount = players.filter(p => p.isReady).length;
        const totalPlayers = players.length;
        
        if (totalPlayers >= minPlayers && readyCount === totalPlayers) {
            gameStatus.innerHTML = '🎮 جميع اللاعبين جاهزين! جاري بدء اللعبة... 🎮';
        } else if (totalPlayers >= minPlayers) {
            gameStatus.innerHTML = `⏳ في انتظار ${minPlayers - readyCount} لاعبين للجاهزية... ⏳`;
        } else {
            gameStatus.innerHTML = `⏳ بحاجة إلى ${minPlayers - totalPlayers} لاعبين إضافيين للبدء ⏳`;
        }
        
        container.innerHTML = players.map(player => `
            <div class="player-item">
                <div class="player-name">
                    ${player.isCreator ? '<span class="crown">👑</span>' : ''}
                    <span>${player.name}</span>
                    <span class="status-badge ${player.isReady ? 'status-ready' : 'status-waiting'}">
                        ${player.isReady ? '✓ جاهز' : '⏳ غير جاهز'}
                    </span>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="player-team ${player.team === 'teamA' ? 'team-a-badge' : player.team === 'teamB' ? 'team-b-badge' : 'team-none'}">
                        ${player.team === 'teamA' ? '🛡️ النور' : player.team === 'teamB' ? '🌑 الظلام' : '⚡ غير محدد'}
                    </span>
                    ${isCreator && player.id !== myPlayerId ? `
                        <button class="kick-btn" onclick="kickPlayer('${player.id}')">طرد</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
    
    // تحديث gameStarted
    socket.on('gameStarted', (data) => {
        console.log('بدء اللعبة!', data);
        showToast('🎮 تبدأ اللعبة الآن! 🎮');
        showGameScreen();
    });