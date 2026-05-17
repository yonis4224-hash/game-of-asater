const socket = io();

let currentRoom = null;
let currentQuestionIndex = 0;
let currentRound = 1;
let timer = null;
let timeLeft = 30;
let playerName = localStorage.getItem('playerName') || '';
let isHost = false;
let myAvatar = localStorage.getItem('myAvatar') || null;

const avatarParts = {
    faces: ['😊', '😎', '🤓', '😤', '🧐', '😏'],
    eyes: ['👁️', '👀', '🔵', '⭐', '💫', '🔥'],
    glasses: ['🕶️', '👓', '🥽', '❌'],
    hairs: ['💇', '🦱', '🦲', '🎩', '👒', '❌'],
    hats: ['🎩', '👑', '🧢', '⛑️', '❌'],
    colors: ['#F5A623', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#FFFFFF']
};

let avatarState = { face: 0, eyes: 0, glasses: 3, hair: 5, hat: 4, color: 0 };

document.addEventListener('DOMContentLoaded', () => {
    if (playerName) document.getElementById('playerNameInput').value = playerName;
    if (myAvatar) avatarState = JSON.parse(myAvatar);
    initAvatarCreator();
    renderAvatar();
    setupCanvas();
});

function initAvatarCreator() {
    const faceDiv = document.getElementById('faceOptions');
    avatarParts.faces.forEach((f, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.face === i ? ' selected' : '');
        btn.textContent = f;
        btn.onclick = () => { avatarState.face = i; updateAvatarBtns('face', i); renderAvatar(); saveAvatar(); };
        faceDiv.appendChild(btn);
    });

    const eyeDiv = document.getElementById('eyeOptions');
    avatarParts.eyes.forEach((e, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.eyes === i ? ' selected' : '');
        btn.textContent = e;
        btn.onclick = () => { avatarState.eyes = i; updateAvatarBtns('eyes', i); renderAvatar(); saveAvatar(); };
        eyeDiv.appendChild(btn);
    });

    const glassDiv = document.getElementById('glassesOptions');
    avatarParts.glasses.forEach((g, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.glasses === i ? ' selected' : '');
        btn.textContent = g;
        btn.onclick = () => { avatarState.glasses = i; updateAvatarBtns('glasses', i); renderAvatar(); saveAvatar(); };
        glassDiv.appendChild(btn);
    });

    const hairDiv = document.getElementById('hairOptions');
    avatarParts.hairs.forEach((h, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.hair === i ? ' selected' : '');
        btn.textContent = h;
        btn.onclick = () => { avatarState.hair = i; updateAvatarBtns('hair', i); renderAvatar(); saveAvatar(); };
        hairDiv.appendChild(btn);
    });

    const hatDiv = document.getElementById('hatOptions');
    avatarParts.hats.forEach((h, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.hat === i ? ' selected' : '');
        btn.textContent = h;
        btn.onclick = () => { avatarState.hat = i; updateAvatarBtns('hat', i); renderAvatar(); saveAvatar(); };
        hatDiv.appendChild(btn);
    });

    const colorDiv = document.getElementById('colorOptions');
    avatarParts.colors.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = 'avatar-opt-btn' + (avatarState.color === i ? ' selected' : '');
        btn.style.background = c;
        btn.onclick = () => { avatarState.color = i; updateAvatarBtns('color', i); renderAvatar(); saveAvatar(); };
        colorDiv.appendChild(btn);
    });
}

function updateAvatarBtns(type, index) {
    const map = { face: 'faceOptions', eyes: 'eyeOptions', glasses: 'glassesOptions', hair: 'hairOptions', hat: 'hatOptions', color: 'colorOptions' };
    document.querySelectorAll(`#${map[type]} .avatar-opt-btn`).forEach((b, i) => {
        b.classList.toggle('selected', i === index);
    });
}

function renderAvatar() {
    const preview = document.getElementById('avatarPreview');
    if (!preview) return;
    const face = avatarParts.faces[avatarState.face];
    const eyes = avatarParts.eyes[avatarState.eyes];
    const glass = avatarParts.glasses[avatarState.glasses];
    const hair = avatarParts.hairs[avatarState.hair];
    const hat = avatarParts.hats[avatarState.hat];
    const color = avatarParts.colors[avatarState.color];

    preview.innerHTML = `
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="55" fill="${color}" opacity="0.3"/>
            <circle cx="60" cy="65" r="35" fill="${color}" opacity="0.8"/>
            <text x="60" y="55" text-anchor="middle" font-size="20">${eyes}</text>
            <text x="60" y="75" text-anchor="middle" font-size="16">${face}</text>
            ${glass !== '❌' ? `<text x="60" y="52" text-anchor="middle" font-size="18">${glass}</text>` : ''}
            ${hair !== '❌' ? `<text x="60" y="35" text-anchor="middle" font-size="18">${hair}</text>` : ''}
            ${hat !== '❌' ? `<text x="60" y="25" text-anchor="middle" font-size="20">${hat}</text>` : ''}
        </svg>
    `;
}

function saveAvatar() {
    myAvatar = JSON.stringify(avatarState);
    localStorage.setItem('myAvatar', myAvatar);
}

function getAvatarSVG(avatar) {
    if (!avatar) return `<div class="player-avatar">🎮</div>`;
    const s = typeof avatar === 'string' ? JSON.parse(avatar) : avatar;
    const face = avatarParts.faces[s.face] || '😊';
    const eyes = avatarParts.eyes[s.eyes] || '👁️';
    const glass = avatarParts.glasses[s.glasses] || '';
    const hair = avatarParts.hairs[s.hair] || '';
    const hat = avatarParts.hats[s.hat] || '';
    const color = avatarParts.colors[s.color] || '#F5A623';

    return `<div class="player-avatar">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="65" r="35" fill="${color}" opacity="0.8"/>
            <text x="60" y="55" text-anchor="middle" font-size="20">${eyes}</text>
            <text x="60" y="75" text-anchor="middle" font-size="16">${face}</text>
            ${glass && glass !== '❌' ? `<text x="60" y="52" text-anchor="middle" font-size="18">${glass}</text>` : ''}
            ${hair && hair !== '❌' ? `<text x="60" y="35" text-anchor="middle" font-size="18">${hair}</text>` : ''}
            ${hat && hat !== '❌' ? `<text x="60" y="25" text-anchor="middle" font-size="20">${hat}</text>` : ''}
        </svg>
    </div>`;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
    hideWaiting();
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
    socket.emit('createRoom', { playerName: name, avatar: myAvatar });
}

function joinRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!name) { alert('الرجاء إدخال اسمك!'); return; }
    if (!code) { alert('الرجاء إدخال كود الغرفة!'); return; }
    playerName = name;
    localStorage.setItem('playerName', name);
    isHost = false;
    socket.emit('joinRoom', { code, playerName: name, avatar: myAvatar });
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
    document.getElementById('playerCount').textContent = `${totalPlayers}/12`;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    const teamNames = room.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };
    const teamColors = { A: 'var(--gold)', B: 'var(--purple-light)' };

    Object.values(room.players).forEach((player) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            ${getAvatarSVG(player.avatar)}
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status ready">${teamNames[player.team]}</div>
            </div>
            <span class="player-badge" style="background: ${teamColors[player.team]}; color: white;">${teamNames[player.team]}</span>
            ${player.isLeader ? '<span class="player-badge badge-leader">القائد</span>' : ''}
            ${player.socketId === room.host ? '<span class="player-badge badge-host">المضيف</span>' : ''}
            ${isHost && player.socketId !== room.host ? `<button class="kick-btn" onclick="kickPlayer('${player.socketId}')"><i class="fas fa-times"></i></button>` : ''}
        `;
        playersList.appendChild(item);
    });

    const progress = Math.min((totalPlayers / 12) * 100, 100);
    document.getElementById('progressFill').style.width = progress + '%';

    const startBtn = document.getElementById('startBtn');
    startBtn.style.display = (isHost && totalPlayers >= 2) ? 'block' : 'none';
}

function kickPlayer(targetSocketId) {
    if (currentRoom) socket.emit('kickPlayer', { code: currentRoom.code, targetSocketId });
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
    loadQuestion(gameData);
    showScreen('screen-game');
    startTimer(gameData.timer, 'timer');
});

function loadQuestion(gameData) {
    const question = gameData.question;
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('roundNumber').textContent = gameData.round;

    const roundNames = {
        1: 'الجولة الأولى - ثقافة عامة',
        2: 'الجولة الثانية - سينما وأنمي',
        3: 'الجولة الثالثة - تاريخ وجغرافيا',
        4: 'الجولة الرابعة - مصارعة'
    };
    document.getElementById('roundTitle').textContent = roundNames[gameData.round] || `الجولة ${gameData.round}`;

    updateScoreBoard(gameData.players, gameData.mode, gameData.teamNames);
}

function updateScoreBoard(players, mode, teamNames) {
    const scoreBoard = document.getElementById('scoreBoard');
    if (!scoreBoard) return;
    scoreBoard.innerHTML = '';
    const tn = teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    if (mode === '1v1') {
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
    if (!answer) { alert('الرجاء كتابة إجابة!'); return; }
    socket.emit('submitTrapAnswer', { code: currentRoom.code, questionIndex: currentQuestionIndex, answer });
    document.getElementById('answerInput').value = '';
    showWaiting();
}

socket.on('showOptions', (data) => {
    hideWaiting();
    renderOptions(data.options);
    showScreen('screen-game-options');
    startTimer(15, 'timer2');
});

function renderOptions(options) {
    const question = currentRoom?.game?.questions?.[currentRound]?.[currentQuestionIndex];
    if (question) document.getElementById('questionText2').textContent = question.س;

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    const letters = ['أ', 'ب', 'ج', 'د'];
    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn' + (option.isTrap ? ' trap-option' : '');
        btn.onclick = function() { selectOption(this); };
        btn.innerHTML = `<span class="option-letter">${letters[index]}</span> ${option.text}`;
        grid.appendChild(btn);
    });
}

function confirmOption() {
    const selected = document.querySelector('#optionsGrid .option-btn.selected');
    if (!selected) { alert('الرجاء اختيار إجابة!'); return; }
    const index = Array.from(document.querySelectorAll('#optionsGrid .option-btn')).indexOf(selected);
    socket.emit('submitOption', { code: currentRoom.code, questionIndex: currentQuestionIndex, optionIndex: index });
    showWaiting();
}

socket.on('questionResults', (data) => {
    hideWaiting();
    showQuestionResults(data);
});

function showQuestionResults(data) {
    const container = document.getElementById('questionResultsContent');
    container.innerHTML = '';
    const tn = data.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    if (data.correctPlayers.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon correct">✅</span> إجابات صحيحة (+100 نقطة)</h3><div class="results-list">`;
        for (const p of data.correctPlayers) {
            html += `<div class="result-player correct"><span class="result-name">${p.name}</span><span class="result-team">${tn[p.team]}</span><span class="result-answer" style="color: #2ECC71;">"${p.selectedAnswer}"</span><span class="result-score">+100</span></div>`;
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
        let html = `<div class="results-section"><h3><span class="results-icon trap">🎭</span> الفخاخ الناجحة (+50 نقطة)</h3><div class="results-list">`;
        for (const [name, count] of trapEntries) {
            html += `<div class="result-player trap"><span class="result-name">${name}</span><span class="result-trap-count">تم اختيار إجابته ${count} مرة</span><span class="result-score">+${count * 50}</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    if (data.mode !== '1v1' && data.teamScores) {
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

socket.on('startDrawRound', (data) => {
    hideWaiting();
    const myPlayer = data.players[socket.id];
    const isLeader = myPlayer && myPlayer.isLeader;

    document.getElementById('drawLeaderView').style.display = isLeader ? 'block' : 'none';
    document.getElementById('drawGuesserView').style.display = isLeader ? 'none' : 'block';
    document.getElementById('guessInputArea').style.display = isLeader ? 'none' : 'block';

    if (isLeader && data.drawWords) {
        document.getElementById('drawWord').textContent = data.drawWords[socket.id] || '???';
    }

    updateScoreBoard(data.players, currentRoom?.mode, data.teamNames);
    showScreen('screen-draw');
    startTimer(data.timer, 'drawTimer');
    clearCanvas();
});

socket.on('drawGuessResult', (result) => {
    if (result.isCorrect) {
        alert('✅ تخمين صحيح! +100 نقطة');
    }
});

socket.on('scoreUpdate', () => {
    if (currentRoom) updateScoreBoard(currentRoom.players, currentRoom.mode, currentRoom.teamNames);
});

socket.on('startCodenamesRound', (data) => {
    hideWaiting();
    renderCodenames(data.words, data.currentTeam, data.teamNames);
    updateScoreBoard(data.players, currentRoom?.mode, data.teamNames);
    showScreen('screen-codenames');
    startTimer(data.timer, 'codenamesTimer');
});

function renderCodenames(words, currentTeam, teamNames) {
    const grid = document.getElementById('codenamesGrid');
    grid.innerHTML = '';
    const tn = teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    document.getElementById('codenamesHint').textContent = `دور ${tn[currentTeam]}`;

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
    const revealed = Object.entries(result.revealed || {});

    revealed.forEach(([index, type]) => {
        if (cards[index]) {
            cards[index].classList.add('revealed');
            if (type === 'A') cards[index].style.background = 'rgba(245, 166, 35, 0.5)';
            else if (type === 'B') cards[index].style.background = 'rgba(155, 89, 182, 0.5)';
            else if (type === 'neutral') cards[index].style.background = 'rgba(255, 255, 255, 0.1)';
            else if (type === 'assassin') cards[index].style.background = 'rgba(231, 76, 60, 0.7)';
        }
    });

    if (result.currentTeam) {
        const tn = result.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };
        document.getElementById('codenamesHint').textContent = `دور ${tn[result.currentTeam]}`;
    }

    if (result.winner) {
        setTimeout(() => {
            alert(`🏆 ${result.teamNames[result.winner]} فاز بكود نيمز! (+500 نقطة)`);
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
    if (!selected) { alert('الرجاء اختيار إجابة!'); return; }
    const index = Array.from(document.querySelectorAll('#overtimeOptionsGrid .option-btn')).indexOf(selected);
    socket.emit('submitOvertimeAnswer', { code: currentRoom.code, optionIndex: index });
}

socket.on('overtimeResult', (result) => {
    if (result.isCorrect) {
        alert('✅ إجابة صحيحة! +200 نقطة');
    } else {
        alert('❌ إجابة خاطئة!');
    }
});

socket.on('gameFinished', (data) => {
    showFinalResults(data);
});

function showFinalResults(data) {
    const players = Object.values(data.players).sort((a, b) => b.score - a.score);
    const tn = data.teamNames || { A: 'الفريق أ', B: 'الفريق ب' };

    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const rankClasses = ['gold', 'silver', 'bronze'];
    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `final-score-item ${index === 0 ? 'first' : ''}`;
        item.innerHTML = `
            ${getAvatarSVG(player.avatar)}
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">${tn[player.team]} - ${player.score.toLocaleString()} نقطة</div>
            </div>
            <div class="rank ${rankClasses[index] || ''}">${index + 1}</div>
            ${index === 0 ? '<i class="fas fa-crown" style="color: var(--gold); font-size: 1.5rem;"></i>' : ''}
        `;
        finalScores.appendChild(item);
    });

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
            if (gameScreen && gameScreen.classList.contains('active')) {
                const answer = document.getElementById('answerInput').value.trim();
                if (answer) submitTrapAnswer();
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
    timerEl.classList.toggle('warning', timeLeft <= 10);
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
