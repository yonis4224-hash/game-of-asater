const socket = io();

let currentRoom = null;
let currentQuestionIndex = 0;
let currentRound = 1;
let timer = null;
let timeLeft = 30;
let playerName = localStorage.getItem('playerName') || '';
let isHost = false;

document.addEventListener('DOMContentLoaded', () => {
    if (playerName) {
        document.getElementById('playerNameInput').value = playerName;
    }
    setupCanvas();
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }
    hideWaiting();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWaiting() {
    let overlay = document.getElementById('waitingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'waitingOverlay';
        overlay.className = 'waiting-overlay';
        overlay.innerHTML = `
            <div class="waiting-spinner"></div>
            <div class="waiting-text">في انتظار اللاعبين الآخرين...</div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideWaiting() {
    const overlay = document.getElementById('waitingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function selectMode(card) {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
}

function selectOption(btn) {
    const grid = btn.closest('.options-grid');
    if (grid) {
        grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    }
    btn.classList.add('selected');
}

function selectCodename(card) {
    card.classList.toggle('selected');
}

function copyCode() {
    if (currentRoom) {
        navigator.clipboard.writeText(currentRoom.code).then(() => {
            alert('تم نسخ الكود!');
        });
    }
}

function createRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) {
        alert('الرجاء إدخال اسمك!');
        return;
    }
    playerName = name;
    localStorage.setItem('playerName', name);
    isHost = true;
    socket.emit('createRoom', { playerName: name });
}

function joinRoom() {
    const name = document.getElementById('playerNameInput').value.trim();
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!name) {
        alert('الرجاء إدخال اسمك!');
        return;
    }
    if (!code) {
        alert('الرجاء إدخال كود الغرفة!');
        return;
    }
    playerName = name;
    localStorage.setItem('playerName', name);
    isHost = false;
    socket.emit('joinRoom', { code, playerName: name });
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

socket.on('error', ({ message }) => {
    alert(message);
});

function updateLobby(room) {
    document.getElementById('roomCode').textContent = room.code;
    document.getElementById('playerCount').textContent = Object.keys(room.players).length;

    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    const avatars = ['👑', '⚡', '🎯', '🔥', '💎', '🌟', '🎮', '🏆'];
    const teamNames = { A: 'الفريق أ', B: 'الفريق ب' };
    const teamColors = { A: 'var(--gold)', B: 'var(--purple-light)' };

    Object.values(room.players).forEach((player, idx) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div class="player-avatar">${avatars[idx] || '🎮'}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status ready">${teamNames[player.team] || player.team}</div>
            </div>
            <span class="player-badge" style="background: ${teamColors[player.team]}; color: white;">${teamNames[player.team]}</span>
            ${player.socketId === room.host ? '<span class="player-badge badge-host">المضيف</span>' : ''}
        `;
        playersList.appendChild(item);
    });

    const totalPlayers = Object.keys(room.players).length;
    const maxPlayers = 8;
    const progress = (totalPlayers / maxPlayers) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('playerCount').textContent = `${totalPlayers}/${maxPlayers}`;

    const startBtn = document.getElementById('startBtn');
    if (isHost && totalPlayers >= 2) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }
}

function startGame() {
    if (currentRoom) {
        socket.emit('startGame', { code: currentRoom.code });
    }
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

    updateScoreBoard(gameData.players, gameData.mode);
}

function updateScoreBoard(players, mode) {
    const scoreBoard = document.getElementById('scoreBoard');
    scoreBoard.innerHTML = '';

    if (mode === '1v1') {
        Object.values(players).forEach(player => {
            const item = document.createElement('div');
            item.className = 'score-item';
            item.innerHTML = `
                <div class="score-name">${player.name}</div>
                <div class="score-value">${player.score}</div>
            `;
            scoreBoard.appendChild(item);
        });
    } else {
        const teamScores = {};
        for (const player of Object.values(players)) {
            teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
        }
        const teamNames = { A: 'الفريق أ', B: 'الفريق ب' };
        for (const [team, score] of Object.entries(teamScores)) {
            const item = document.createElement('div');
            item.className = 'score-item';
            item.innerHTML = `
                <div class="score-name">${teamNames[team]}</div>
                <div class="score-value">${score}</div>
            `;
            scoreBoard.appendChild(item);
        }
    }
}

function submitTrapAnswer() {
    const answer = document.getElementById('answerInput').value.trim();
    if (!answer) {
        alert('الرجاء كتابة إجابة!');
        return;
    }

    socket.emit('submitTrapAnswer', {
        code: currentRoom.code,
        questionIndex: currentQuestionIndex,
        answer
    });

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
    if (question) {
        document.getElementById('questionText2').textContent = question.س;
    }

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
    if (!selected) {
        alert('الرجاء اختيار إجابة!');
        return;
    }

    const index = Array.from(document.querySelectorAll('#optionsGrid .option-btn')).indexOf(selected);

    socket.emit('submitOption', {
        code: currentRoom.code,
        questionIndex: currentQuestionIndex,
        optionIndex: index
    });

    showWaiting();
}

socket.on('questionResults', (data) => {
    hideWaiting();
    showQuestionResults(data);
});

function showQuestionResults(data) {
    const container = document.getElementById('questionResultsContent');
    container.innerHTML = '';

    const teamNames = { A: 'الفريق أ', B: 'الفريق ب' };

    if (data.correctPlayers.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon correct">✅</span> إجابات صحيحة (+100 نقطة)</h3><div class="results-list">`;
        for (const p of data.correctPlayers) {
            html += `<div class="result-player correct"><span class="result-name">${p.name}</span><span class="result-team">${teamNames[p.team]}</span><span class="result-score">+100</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    if (data.wrongPlayers.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon wrong">❌</span> إجابات خاطئة</h3><div class="results-list">`;
        for (const p of data.wrongPlayers) {
            const trapInfo = p.fromPlayer ? `من إجابة: <span class="trap-name">${p.fromPlayer}</span> 🎭` : '';
            html += `<div class="result-player wrong"><span class="result-name">${p.name}</span><span class="result-team">${teamNames[p.team]}</span><span class="result-answer">اختار: "${p.selectedAnswer}"</span>${trapInfo ? `<span class="result-trap">${trapInfo}</span>` : ''}</div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    const trapEntries = Object.entries(data.trapInfo);
    if (trapEntries.length > 0) {
        let html = `<div class="results-section"><h3><span class="results-icon trap">🎭</span> الفخاخ الناجحة (+50 نقطة لكل فخ)</h3><div class="results-list">`;
        for (const [name, count] of trapEntries) {
            const bonus = count * 50;
            html += `<div class="result-player trap"><span class="result-name">${name}</span><span class="result-trap-count">تم اختيار إجابته ${count} مرة</span><span class="result-score">+${bonus}</span></div>`;
        }
        html += `</div></div>`;
        container.innerHTML += html;
    }

    if (data.mode !== '1v1' && data.teamScores) {
        let html = `<div class="results-section"><h3><span class="results-icon">📊</span> مجموع النقاط</h3><div class="results-list">`;
        for (const [team, score] of Object.entries(data.teamScores)) {
            html += `<div class="result-player team-score"><span class="result-name">${teamNames[team]}</span><span class="result-score">${score} نقطة</span></div>`;
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

socket.on('gameFinished', (data) => {
    showFinalResults(data);
});

function showFinalResults(data) {
    const players = Object.values(data.players).sort((a, b) => b.score - a.score);

    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const rankClasses = ['gold', 'silver', 'bronze'];
    const teamNames = { A: 'الفريق أ', B: 'الفريق ب' };

    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `final-score-item ${index === 0 ? 'first' : ''}`;
        item.innerHTML = `
            <div class="rank ${rankClasses[index] || ''}">${index + 1}</div>
            <div class="player-avatar">🎮</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">${teamNames[player.team]} - ${player.score.toLocaleString()} نقطة</div>
            </div>
            ${index === 0 ? '<i class="fas fa-crown" style="color: var(--gold); font-size: 1.5rem;"></i>' : ''}
        `;
        finalScores.appendChild(item);
    });

    document.getElementById('winnerName').textContent = players[0]?.name || 'لا أحد';
    document.getElementById('winnerScore').textContent = `الفائز بالمباراة بـ ${players[0]?.score.toLocaleString() || 0} نقطة!`;

    showScreen('screen-results');
}

function nextQuestion() {
    if (currentRoom) {
        socket.emit('requestNextQuestion', { code: currentRoom.code });
    }
}

function restartGame() {
    currentRound = 1;
    currentQuestionIndex = 0;
    showScreen('screen-home');
}

function startTimer(seconds, elementId) {
    timeLeft = seconds;
    updateTimerDisplay(elementId);

    if (timer) {
        clearInterval(timer);
    }

    timer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(elementId);

        if (timeLeft <= 0) {
            clearInterval(timer);
            const gameScreen = document.getElementById('screen-game');
            const optionsScreen = document.getElementById('screen-game-options');
            if (gameScreen && gameScreen.classList.contains('active')) {
                const answer = document.getElementById('answerInput').value.trim();
                if (answer) {
                    submitTrapAnswer();
                }
            }
        }
    }, 1000);
}

function updateTimerDisplay(elementId) {
    const timerEl = document.getElementById(elementId);
    if (!timerEl) return;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerEl.textContent = display;
    if (timeLeft <= 10) {
        timerEl.classList.add('warning');
    } else {
        timerEl.classList.remove('warning');
    }
}

function setupCanvas() {
    const canvas = document.getElementById('drawingCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = '#F5A623';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseleave', () => isDrawing = false);
}

setTimeout(() => {
    const visual = document.getElementById('visualImage');
    if (visual) visual.classList.add('revealed');
}, 3000);
