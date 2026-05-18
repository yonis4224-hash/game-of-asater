const socket = io();

let currentRoom = null;
let currentQuestionIndex = 0;
let currentRound = 1;
let timer = null;
let timeLeft = 30;
let playerName = localStorage.getItem('playerName') || '';
let isHost = false;
let selectedAvatar = parseInt(localStorage.getItem('selectedAvatar')) || 0;
let isSoloMode = false;

const avatarFiles = [
    'انمي.jpeg',
    'تنزيل (1).jpeg',
    'تنزيل (2).jpeg',
    'تنزيل (3).jpeg',
    'تنزيل (4).jpeg',
    'تنزيل (5).jpeg',
    'تنزيل (6).jpeg',
    'تنزيل (7).jpeg',
    'تنزيل (8).jpeg',
    'تنزيل (9).jpeg',
    'تنزيل (10).jpeg',
    'تنزيل (11).jpeg',
    'تنزيل (12).jpeg',
    'تنزيل (13).jpeg',
    'جيوكريس.jpeg',
    'Art by @gyo14keres on X.jpeg',
    'cute DP.jpeg',
    'Mesut Özil  #YaGunnersYa   _ #COYG  #Arsenal.jpeg',
    'non.jpeg',
    'trajes personaje.jpeg',
    'Viktor Gyokeres Celebration 🎉.jpeg',
    'viktor gyokeres.jpeg'
];

document.addEventListener('DOMContentLoaded', () => {
    if (playerName) document.getElementById('playerNameInput').value = playerName;
    initAvatarSelector();
    setupCanvas();
});

function initAvatarSelector() {
    const container = document.getElementById('avatarSelector');
    if (!container) return;
    container.innerHTML = '';
    avatarFiles.forEach((file, i) => {
        const div = document.createElement('div');
        div.className = 'avatar-option' + (selectedAvatar === i ? ' selected' : '');
        div.innerHTML = `<img src="avatars/${encodeURIComponent(file)}" alt="avatar ${i+1}">`;
        div.onclick = () => {
            selectedAvatar = i;
            localStorage.setItem('selectedAvatar', i);
            container.querySelectorAll('.avatar-option').forEach((el, j) => {
                el.classList.toggle('selected', j === i);
            });
        };
        container.appendChild(div);
    });
}

function getAvatarHTML(avatarIndex) {
    const idx = typeof avatarIndex === 'number' ? avatarIndex : (parseInt(avatarIndex) || 0);
    const file = avatarFiles[idx] || avatarFiles[0];
    return `<div class="player-avatar"><img src="avatars/${encodeURIComponent(file)}" alt="avatar"></div>`;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
    hideWaiting();
    hideRoundTransition();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWaiting() {
    let overlay = document.getElementById('waitingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'waitingOverlay';
        overlay.className = 'waiting-overlay';
        overlay.innerHTML = `<div class="waiting-spinner"></div><div class="waiting-text">في انتظار اللاعبين الآخرين...</div>`;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideWaiting() {
    const overlay = document.getElementById('waitingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showRoundTransition(data) {
    let overlay = document.getElementById('roundTransitionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'roundTransitionOverlay';
        overlay.className = 'round-transition-overlay';
        overlay.innerHTML = `
            <div class="round-transition-content">
                <div class="round-transition-icon">⚡</div>
                <div class="round-transition-title" id="roundTransitionTitle">---</div>
                <div class="round-transition-subtitle" id="roundTransitionSubtitle">---</div>
                <div class="round-transition-loader"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    document.getElementById('roundTransitionTitle').textContent = data.roundTitle || '';
    document.getElementById('roundTransitionSubtitle').textContent = data.roundDisplayName || '';
    overlay.style.display = 'flex';
}

function hideRoundTransition() {
    const overlay = document.getElementById('roundTransitionOverlay');
    if (overlay) overlay.style.display = 'none';
}

function selectMode(card, mode) {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    currentRoom = currentRoom || {};
    currentRoom.mode = mode;
}

function selectOption(btn) {
    const grid = btn.closest('.options-grid');
    if (grid) grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function copyCode() {
    if (currentRoom) {
        navigator.clipboard.writeText(currentRoom.code).then(() => alert('تم نسخ الكود!'));
    }
}

function createRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) { alert('الرجاء إدخال اسمك!'); return; }
    playerName = name;
    localStorage.setItem('playerName', name);
    isHost = true;
    socket.emit('createRoom', { playerName: name, avatar: selectedAvatar });
}

function joinRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!name) { alert('الرجاء إدخال اسمك!'); return; }
    if (!code) { alert('الرجاء إدخال كود الغرفة!'); return; }
    playerName = name;
    localStorage.setItem('playerName', name);
    isHost = false;
    socket.emit('joinRoom', { code, playerName: name, avatar: selectedAvatar });
}

socket.on('roomCreated', (room) => {
    currentRoom = room;
    updateLobby(room);
    showScreen('screen-lobby');
});

socket.on('joinedRoom', (room) => {
    currentRoom = room;
    updateLobby(room);
    showScreen('screen-lobby');
});

socket.on('roomUpdate', (room) => {
    currentRoom = room;
    updateLobby(room);
});

socket.on('error', ({ message }) => alert(message));
socket.on('kicked', ({ message }) => { alert(message); showScreen('screen-home'); });

function updateLobby(room) {
    document.getElementById('roomCode').textContent = room.code;
    const totalPlayers = Object.keys(room.players).length;
    const isSolo = room.mode === '1v1' || room.mode === 'solo';
    document.getElementById('playerCount').textContent = isSolo ? `${totalPlayers}/2` : `${totalPlayers}/12`;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    const teamNames = room.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };
    const teamColors = { A: '#E74C3C', B: '#3498DB' };
    const teamBgColors = { A: 'rgba(231, 76, 60, 0.15)', B: 'rgba(52, 152, 219, 0.15)' };

    Object.values(room.players).forEach((player) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.style.borderLeft = `4px solid ${teamColors[player.team]}`;
        item.style.background = teamBgColors[player.team];

        const isMe = player.socketId === socket.id;

        item.innerHTML = `
            ${getAvatarHTML(player.avatar)}
            <div class="player-info">
                <div class="player-name">${player.name} ${isMe ? '(أنت)' : ''}</div>
                <div class="player-status ready">${teamNames[player.team]} ${player.isLeader ? '👑' : ''}</div>
            </div>
            ${isMe && !isSolo ? `
                <button class="team-switch-btn" onclick="switchTeam('${player.team === 'A' ? 'B' : 'A'}')"
                    style="background: ${teamColors[player.team === 'A' ? 'B' : 'A']}; color: white; border: none; padding: 6px 14px; border-radius: 10px; cursor: pointer; font-family: 'Tajawal'; font-size: 0.8rem; font-weight: 700;">
                    انتقال للفريق ${player.team === 'A' ? 'ب' : 'أ'}
                </button>
            ` : ''}
            ${isHost && !isMe ? `<button class="kick-btn" onclick="kickPlayer('${player.socketId}')"><i class="fas fa-times"></i></button>` : ''}
        `;
        playersList.appendChild(item);
    });

    const maxPlayers = isSolo ? 2 : 12;
    const progress = Math.min((totalPlayers / maxPlayers) * 100, 100);
    document.getElementById('progressFill').style.width = progress + '%';

    const startBtn = document.getElementById('startBtn');
    startBtn.style.display = (isHost && totalPlayers >= 2) ? 'block' : 'none';
}

function kickPlayer(targetSocketId) {
    if (currentRoom) socket.emit('kickPlayer', { code: currentRoom.code, targetSocketId });
}

function switchTeam(newTeam) {
    if (currentRoom) socket.emit('switchTeam', { code: currentRoom.code, newTeam });
}

function updateTeamNames() {
    if (currentRoom) {
        socket.emit('updateTeamNames', {
            code: currentRoom.code,
            teamAName: document.getElementById('teamAName').value,
            teamBName: document.getElementById('teamBName').value
        });
    }
}

document.addEventListener('input', (e) => {
    if (e.target.id === 'teamAName' || e.target.id === 'teamBName') {
        clearTimeout(window._teamNameTimeout);
        window._teamNameTimeout = setTimeout(updateTeamNames, 500);
    }
});

function startGame() {
    if (currentRoom) socket.emit('startGame', { code: currentRoom.code });
}

socket.on('gameStarted', (gameData) => {
    currentRound = gameData.round;
    currentQuestionIndex = gameData.questionIndex;
    isSoloMode = gameData.isSolo || false;
    loadQuestion(gameData);
    showScreen('screen-game');
    startTimer(gameData.timer, 'timer');
});

function loadQuestion(gameData) {
    const question = gameData.question;
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('roundNumber').textContent = gameData.isSolo ? `${gameData.round}/15` : gameData.round;

    if (gameData.isSolo) {
        document.getElementById('roundTitle').textContent = `سؤال ${gameData.round} من 15`;
    } else {
        document.getElementById('roundTitle').textContent = gameData.roundTitle || `الجولة ${gameData.round}`;
    }

    updateScoreBoard(gameData.players, gameData.mode, gameData.teamNames);
}

function updateScoreBoard(players, mode, teamNames) {
    const scoreBoard = document.getElementById('scoreBoard');
    if (!scoreBoard) return;
    scoreBoard.innerHTML = '';
    const tn = teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    if (mode === '1v1' || mode === 'solo') {
        Object.values(players).forEach(player => {
            const item = document.createElement('div');
            item.className = 'score-item';
            item.innerHTML = `<div class="score-name">${player.name}</div><div class="score-value">${player.score}</div>`;
            scoreBoard.appendChild(item);
        });
    } else {
        const teamScores = {};
        for (const player of Object.values(players)) {
            teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
        }
        for (const [team, score] of Object.entries(teamScores)) {
            const item = document.createElement('div');
            item.className = 'score-item';
            item.innerHTML = `<div class="score-name">${tn[team]}</div><div class="score-value">${score}</div>`;
            scoreBoard.appendChild(item);
        }
    }
}

function submitTrapAnswer() {
    const answer = document.getElementById('answerInput').value.trim();
    socket.emit('submitTrapAnswer', { code: currentRoom.code, questionIndex: currentQuestionIndex, answer });
    document.getElementById('answerInput').value = '';
    showWaiting();
}

socket.on('showOptions', (data) => {
    hideWaiting();
    renderOptions(data.options);
    renderConfirmedPlayers(data.confirmedPlayers || []);
    showScreen('screen-game-options');
    startTimer(10, 'timer2');
});

function renderOptions(options) {
    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    const letters = ['أ', 'ب', 'ج', 'د'];
    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.onclick = function() { selectOption(this); };
        btn.innerHTML = `<span class="option-letter">${letters[index]}</span> ${option.text}`;
        grid.appendChild(btn);
    });
}

function confirmOption() {
    const selected = document.querySelector('#optionsGrid .option-btn.selected');
    const index = selected ? Array.from(document.querySelectorAll('#optionsGrid .option-btn')).indexOf(selected) : 0;
    socket.emit('submitOption', { code: currentRoom.code, questionIndex: currentQuestionIndex, optionIndex: index });
    showWaiting();
}

function renderConfirmedPlayers(confirmedPlayers) {
    const container = document.getElementById('confirmedPlayersList');
    if (!container) return;
    container.innerHTML = '';

    confirmedPlayers.forEach(player => {
        const div = document.createElement('div');
        div.className = 'confirmed-player' + (player.confirmed ? ' confirmed' : '');
        const file = avatarFiles[player.avatar] || avatarFiles[0];
        div.innerHTML = `
            <img src="avatars/${encodeURIComponent(file)}" alt="${player.name}" class="confirmed-avatar">
            <span class="confirmed-name">${player.name}</span>
            ${player.confirmed ? '<i class="fas fa-check-circle confirmed-check"></i>' : ''}
        `;
        container.appendChild(div);
    });
}

socket.on('confirmedPlayersUpdate', (data) => {
    renderConfirmedPlayers(data.confirmedPlayers);
});

socket.on('questionResults', (data) => {
    hideWaiting();
    showQuestionResults(data);
});

function showQuestionResults(data) {
    const container = document.getElementById('questionResultsContent');
    container.innerHTML = '';
    const tn = data.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    if (data.correctPlayers.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon correct">✅</span> إجابات صحيحة (+3 نقاط)</h3><div class="results-list">`;
        for (const p of data.correctPlayers) {
            html += `<div class="result-player correct"><span class="result-name">${p.name}</span><span class="result-team">${tn[p.team]}</span><span class="result-answer" style="color: #2ECC71;">"${p.selectedAnswer}"</span><span class="result-score">+3</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    if (data.wrongPlayers.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon wrong">❌</span> إجابات خاطئة</h3><div class="results-list">`;
        for (const p of data.wrongPlayers) {
            const trapInfo = p.fromPlayer ? `من إجابة: <span class="trap-name">${p.fromPlayer}</span> 🎭` : '';
            html += `<div class="result-player wrong"><span class="result-name">${p.name}</span><span class="result-team">${tn[p.team]}</span><span class="result-answer">اختار: "${p.selectedAnswer}"</span>${trapInfo ? `<span class="result-trap">${trapInfo}</span>` : ''}</div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    const trapEntries = Object.entries(data.trapInfo);
    if (trapEntries.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon trap">🎭</span> الفخاخ الناجحة (+1 نقطة)</h3><div class="results-list">`;
        for (const [name, count] of trapEntries) {
            html += `<div class="result-player trap"><span class="result-name">${name}</span><span class="result-trap-count">تم اختيار إجابته ${count} مرة</span><span class="result-score">+${count}</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    if (!data.isSolo && data.mode !== '1v1' && data.teamScores) {
        let html = `<div class="results-section"><h3><span class="results-icon">📊</span> مجموع النقاط</h3><div class="results-list">`;
        for (const [team, score] of Object.entries(data.teamScores)) {
            html += `<div class="result-player team-score"><span class="result-name">${tn[team]}</span><span class="result-score">${score} نقطة</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    showScreen('screen-question-results');
}

socket.on('nextQuestion', (data) => {
    currentRound = data.round;
    currentQuestionIndex = data.questionIndex;
    loadQuestion(data);
    showScreen('screen-game');
    startTimer(data.timer, 'timer');
});

socket.on('showRoundTransition', (data) => {
    showRoundTransition(data);
});

socket.on('startDrawRound', (data) => {
    hideRoundTransition();
    hideWaiting();
    const myPlayer = data.players[socket.id];
    const isLeader = myPlayer && myPlayer.isLeader;

    document.getElementById('drawLeaderView').style.display = isLeader ? 'block' : 'none';
    document.getElementById('drawGuesserView').style.display = isLeader ? 'none' : 'block';
    document.getElementById('guessInputArea').style.display = isLeader ? 'none' : 'block';
    document.getElementById('drawEndBtn').style.display = isLeader ? 'block' : 'none';

    if (isLeader && data.drawWords) {
        document.getElementById('drawWord').textContent = data.drawWords[socket.id] || '???';
    }

    updateScoreBoard(data.players, currentRoom?.mode, data.teamNames);
    showScreen('screen-draw');
    startTimer(data.timer, 'drawTimer');
    clearCanvas();
});

socket.on('drawGuessResult', (result) => {
    if (result.isCorrect) alert('✅ تخمين صحيح! +3 نقاط');
});

socket.on('scoreUpdate', () => {
    if (currentRoom) updateScoreBoard(currentRoom.players, currentRoom.mode, currentRoom.teamNames);
});

socket.on('startCodenamesRound', (data) => {
    hideRoundTransition();
    hideWaiting();
    const myPlayer = data.players[socket.id];
    const isLeader = myPlayer && myPlayer.isLeader;

    renderCodenames(data.words, data.currentTeam, data.teamNames, data.teamWords, data.leaders, isLeader);
    updateScoreBoard(data.players, currentRoom?.mode, data.teamNames);
    showScreen('screen-codenames');
});

function renderCodenames(words, currentTeam, teamNames, teamWords, leaders, isLeader) {
    const grid = document.getElementById('codenamesGrid');
    grid.innerHTML = '';
    const tn = teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    const hintDiv = document.getElementById('codenamesHint');
    const colorNames = { A: '🔴 الأحمر', B: '🔵 الأزرق' };
    hintDiv.innerHTML = `دور <span style="color: ${currentTeam === 'A' ? '#E74C3C' : '#3498DB'}">${colorNames[currentTeam]}</span> - ${tn[currentTeam]}`;

    if (isLeader && teamWords) {
        const myTeam = Object.keys(teamWords).find(t => leaders && leaders[t] === socket.id);
        if (myTeam && teamWords[myTeam]) {
            const hintArea = document.getElementById('codenamesLeaderHint');
            if (hintArea) {
                hintArea.style.display = 'block';
                hintArea.innerHTML = `
                    <div style="font-size: 0.85rem; color: #B8A9C9; margin-bottom: 5px;">🔑 كلمات فريقك (${colorNames[myTeam]}):</div>
                    <div style="font-size: 0.95rem; font-weight: 700; color: ${myTeam === 'A' ? '#E74C3C' : '#3498DB'};">
                        ${teamWords[myTeam].join(' • ')}
                    </div>
                `;
            }
        }
    }

    words.forEach((word, index) => {
        const card = document.createElement('div');
        card.className = 'codename-card';
        card.textContent = word;
        card.onclick = () => {
            if (currentRoom) socket.emit('revealCodenameWord', { code: currentRoom.code, wordIndex: index });
        };
        grid.appendChild(card);
    });
}

socket.on('codenameRevealed', (result) => {
    const cards = document.querySelectorAll('.codename-card');
    Object.entries(result.revealed || {}).forEach(([index, type]) => {
        if (cards[index]) {
            cards[index].classList.add('revealed');
            if (type === 'A') cards[index].style.background = 'rgba(231, 76, 60, 0.6)';
            else if (type === 'B') cards[index].style.background = 'rgba(52, 152, 219, 0.6)';
            else if (type === 'neutral') cards[index].style.background = 'rgba(255, 255, 255, 0.1)';
            else if (type === 'assassin') cards[index].style.background = 'rgba(0, 0, 0, 0.8)';
        }
    });

    if (result.currentTeam) {
        const tn = result.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };
        const colorNames = { A: '🔴 الأحمر', B: '🔵 الأزرق' };
        document.getElementById('codenamesHint').innerHTML = `دور <span style="color: ${result.currentTeam === 'A' ? '#E74C3C' : '#3498DB'}">${colorNames[result.currentTeam]}</span> - ${tn[result.currentTeam]}`;
    }

    if (result.winner) {
        setTimeout(() => {
            alert(`🏆 ${result.teamNames[result.winner]} فاز بكود نيمز! (+3 نقطة لكل لاعب)`);
            const finishData = {
                winner: result.winner,
                teamScores: {},
                players: {},
                teamNames: result.teamNames,
                mode: currentRoom?.mode
            };
            socket.emit('requestFinishGame', { code: currentRoom.code });
        }, 500);
    }
});

socket.on('startOvertime', (data) => {
    hideWaiting();
    document.getElementById('overtimeQuestionText').textContent = data.question.س;
    const grid = document.getElementById('overtimeOptionsGrid');
    grid.innerHTML = '';
    const letters = ['أ', 'ب', 'ج', 'د'];
    data.question.خيارات.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.onclick = function() { selectOption(this); };
        btn.innerHTML = `<span class="option-letter">${letters[i]}</span> ${opt}`;
        grid.appendChild(btn);
    });
    updateScoreBoard(data.players, currentRoom?.mode, data.teamNames);
    showScreen('screen-overtime');
    startTimer(data.timer, 'overtimeTimer');
});

function submitOvertimeAnswer() {
    const selected = document.querySelector('#overtimeOptionsGrid .option-btn.selected');
    const index = selected ? Array.from(document.querySelectorAll('#overtimeOptionsGrid .option-btn')).indexOf(selected) : 0;
    socket.emit('submitOvertimeAnswer', { code: currentRoom.code, optionIndex: index });
}

socket.on('overtimeResult', (result) => {
    if (result.isCorrect) alert('✅ إجابة صحيحة! +3 نقاط');
    else alert('❌ إجابة خاطئة!');
});

socket.on('gameFinished', (data) => showFinalResults(data));

function showFinalResults(data) {
    const players = Object.values(data.players).sort((a, b) => b.score - a.score);
    const tn = data.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };
    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const mode = data.mode || 'team';

    if (mode === '1v1' || mode === 'solo') {
        const rankClasses = ['gold', 'silver', 'bronze'];
        const rankLabels = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
        players.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = `final-score-item ${index === 0 ? 'first' : ''}`;
            item.innerHTML = `
                <div class="rank-badge ${rankClasses[index] || 'default'}">${index + 1}</div>
                ${getAvatarHTML(player.avatar)}
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">${player.score.toLocaleString()} نقطة</div>
                </div>
                <div class="rank-label">${rankLabels[index] || (index + 1) + 'th'}</div>
                ${index === 0 ? '<i class="fas fa-crown crown-icon"></i>' : ''}
            `;
            finalScores.appendChild(item);
        });
    } else {
        const teamAPlayers = players.filter(p => p.team === 'A').sort((a, b) => b.score - a.score);
        const teamBPlayers = players.filter(p => p.team === 'B').sort((a, b) => b.score - a.score);

        const scoreA = teamAPlayers.reduce((sum, p) => sum + p.score, 0);
        const scoreB = teamBPlayers.reduce((sum, p) => sum + p.score, 0);

        const winnerTeam = scoreA >= scoreB ? 'A' : 'B';

        const teamHeader = document.createElement('div');
        teamHeader.className = `team-result-header team-${winnerTeam}-winner`;
        teamHeader.innerHTML = `
            <div class="team-result-name">🏆 ${tn[winnerTeam]}</div>
            <div class="team-result-score">${scoreA >= scoreB ? scoreA : scoreB} نقطة</div>
        `;
        finalScores.appendChild(teamHeader);

        const winnerPlayers = winnerTeam === 'A' ? teamAPlayers : teamBPlayers;
        winnerPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-score-item team-player winner-team-player';
            item.innerHTML = `
                <div class="player-rank">#${index + 1}</div>
                ${getAvatarHTML(player.avatar)}
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">${player.score.toLocaleString()} نقطة</div>
                </div>
            `;
            finalScores.appendChild(item);
        });

        const divider = document.createElement('div');
        divider.className = 'team-divider';
        divider.innerHTML = '<span>⚔️</span>';
        finalScores.appendChild(divider);

        const loserTeam = winnerTeam === 'A' ? 'B' : 'A';
        const loserPlayers = loserTeam === 'A' ? teamAPlayers : teamBPlayers;
        loserPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-score-item team-player loser-team-player';
            item.innerHTML = `
                <div class="player-rank">#${index + 1}</div>
                ${getAvatarHTML(player.avatar)}
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">${player.score.toLocaleString()} نقطة</div>
                </div>
            `;
            finalScores.appendChild(item);
        });
    }

    document.getElementById('winnerName').textContent = data.winner ? tn[data.winner] : 'تعادل';
    document.getElementById('winnerScore').textContent = `الفائز بـ ${players[0]?.score.toLocaleString() || 0} نقطة!`;
    showScreen('screen-results');
}

function nextQuestion() {
    if (currentRoom) socket.emit('requestNextQuestion', { code: currentRoom.code });
}

function endDrawRound() {
    if (currentRoom) socket.emit('endDrawRound', { code: currentRoom.code });
}

function restartGame() {
    currentRound = 1;
    currentQuestionIndex = 0;
    showScreen('screen-home');
}

function startTimer(seconds, elementId) {
    timeLeft = seconds;
    updateTimerDisplay(elementId);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(elementId);
        if (timeLeft <= 0) {
            clearInterval(timer);
            const gameScreen = document.getElementById('screen-game');
            const optionsScreen = document.getElementById('screen-game-options');
            const drawScreen = document.getElementById('screen-draw');
            if (gameScreen && gameScreen.classList.contains('active')) {
                submitTrapAnswer();
            } else if (optionsScreen && optionsScreen.classList.contains('active')) {
                confirmOption();
            } else if (drawScreen && drawScreen.classList.contains('active')) {
                endDrawRound();
            }
        }
    }, 1000);
}

function updateTimerDisplay(elementId) {
    const timerEl = document.getElementById(elementId);
    if (!timerEl) return;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    timerEl.classList.toggle('warning', timeLeft <= 5);
}

let drawTool = 'brush';
let drawColor = '#F5A623';
let brushSize = 5;

function setDrawTool(tool) {
    drawTool = tool;
    document.querySelectorAll('.canvas-tools .tool-btn').forEach(b => b.classList.remove('active'));
    const btnMap = { brush: 'brushBtn', fineBrush: 'fineBrushBtn', eraser: 'eraserBtn' };
    if (btnMap[tool]) document.getElementById(btnMap[tool])?.classList.add('active');
}

function setBrushSize(size) { brushSize = parseInt(size); }
function setDrawColor(color) { drawColor = color; }

function clearCanvas() {
    const canvas = document.getElementById('drawingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setupCanvas() {
    const canvas = document.getElementById('drawingCanvas');
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let isDrawing = false;

    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        if (drawTool === 'eraser') {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = brushSize * 2;
        } else if (drawTool === 'fineBrush') {
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = Math.max(1, brushSize / 2);
        } else {
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = brushSize;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseleave', () => isDrawing = false);

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        isDrawing = true;
        ctx.beginPath();
        ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
        if (drawTool === 'eraser') {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = brushSize * 2;
        } else if (drawTool === 'fineBrush') {
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = Math.max(1, brushSize / 2);
        } else {
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = brushSize;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    });

    canvas.addEventListener('touchend', () => isDrawing = false);
}

function submitGuess() {
    const guess = document.getElementById('guessInput').value.trim();
    if (!guess) return;
    if (currentRoom) socket.emit('submitDrawGuess', { code: currentRoom.code, guess });
    document.getElementById('guessInput').value = '';
}

setTimeout(() => {
    const visual = document.getElementById('visualImage');
    if (visual) visual.classList.add('revealed');
}, 3000);
