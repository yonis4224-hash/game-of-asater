function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    const status = document.getElementById('gameStatus');
    const readyCount = players.filter(p => p.isReady).length;
    const totalPlayers = players.length;
    
    if (totalPlayers >= 2 && readyCount === totalPlayers && !window.gameStartedFlag) {
        status.innerHTML = '🎮 الجميع جاهز! سيبدأ قريباً... 🎮';
    } else if (totalPlayers >= 2) {
        status.innerHTML = `⏳ في انتظار ${totalPlayers - readyCount} لاعب للجاهزية...`;
    } else {
        status.innerHTML = `⏳ بحاجة إلى لاعب آخر (${totalPlayers}/2)`;
    }
    
    container.innerHTML = players.map(p => `
        <div class="player-item">
            <span>${p.isCreator ? '👑 ' : ''}${p.name}</span>
            <span class="status-badge ${p.isReady ? 'status-ready' : 'status-waiting'}">
                ${p.isReady ? 'جاهز' : 'غير جاهز'}
            </span>
        </div>
    `).join('');
}