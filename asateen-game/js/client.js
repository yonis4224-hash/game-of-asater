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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const avatars = ['👑', '⚡', '🎯', '🔥'];
    Object.values(room.players).forEach((player, idx) => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div class="player-avatar">${avatars[idx] || '🎮'}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status ready">جاهز للعب</div>
            </div>
            ${player.socketId === room.host ? '<span class="player-badge badge-host">المضيف</span>' : '<span class="player-badge badge-ready">جاهز</span>'}
        `;
        playersList.appendChild(item);
    });

    const progress = (Object.keys(room.players).length / 4) * 100;
    document.getElementById('progressFill').style.width = progress + '%';

    const startBtn = document.getElementById('startBtn');
    if (isHost) {
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
    startTimer(gameData.timer);
});

function loadQuestion(gameData) {
    const question = gameData.question;
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('roundNumber').textContent = gameData.round;

    const roundNames = {
        1: 'الجولة الأولى - خدعة المعرفة',
        2: 'الجولة الثانية - من هذا؟',
        3: 'الجولة الثالثة - خدعة الترفيه'
    };
    document.getElementById('roundTitle').textContent = roundNames[gameData.round] || `الجولة ${gameData.round}`;

    updateScoreBoard(gameData.players);
}

function updateScoreBoard(players) {
    const scoreBoard = document.getElementById('scoreBoard');
    scoreBoard.innerHTML = '';

    Object.values(players).forEach(player => {
        const item = document.createElement('div');
        item.className = 'score-item';
        item.innerHTML = `
            <div class="score-name">${player.name}</div>
            <div class="score-value">${player.score}</div>
        `;
        scoreBoard.appendChild(item);
    });
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
    showScreen('screen-game-options');
    loadOptionsScreen();
    startTimer(15);
}

function loadOptionsScreen() {
    if (!currentRoom || !currentRoom.game) return;

    const question = currentRoom.game.questions[currentRound]?.[currentQuestionIndex];
    if (!question) return;

    document.getElementById('questionText2').textContent = question.س;

    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';

    const letters = ['أ', 'ب', 'ج', 'د'];
    question.خيارات.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.onclick = function() { selectOption(this); };
        btn.innerHTML = `<span class="option-letter">${letters[index]}</span> ${option}`;
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
}

socket.on('optionResult', (result) => {
    const selected = document.querySelector('#optionsGrid .option-btn.selected');
    if (selected) {
        if (result.isCorrect) {
            selected.classList.add('correct');
        } else {
            selected.classList.add('wrong');
        }
    }

    if (result.trapBonus > 0) {
        setTimeout(() => {
            alert(`+${result.trapBonus} نقطة إضافية من الفخاخ!`);
        }, 500);
    }
});

socket.on('scoreUpdate', () => {
    if (currentRoom) {
        updateScoreBoard(currentRoom.players);
    }
});

socket.on('nextQuestion', () => {
    currentQuestionIndex++;

    if (!currentRoom || !currentRoom.game) return;

    const questions = currentRoom.game.questions[currentRound];
    if (currentQuestionIndex >= questions.length) {
        currentRound++;
        currentQuestionIndex = 0;

        if (currentRound > currentRoom.game.totalRounds) {
            showResults();
            return;
        }
    }

    const nextQuestion = currentRoom.game.questions[currentRound]?.[currentQuestionIndex];
    if (nextQuestion) {
        document.getElementById('questionText').textContent = nextQuestion.س;
        document.getElementById('roundNumber').textContent = currentRound;

        Object.values(currentRoom.players).forEach(p => {
            p.selectedOption = null;
        });

        showScreen('screen-game');
        startTimer(30);
    }
});

function showResults() {
    if (!currentRoom) return;

    const players = Object.values(currentRoom.players).sort((a, b) => b.score - a.score);

    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const rankClasses = ['gold', 'silver', 'bronze'];

    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `final-score-item ${index === 0 ? 'first' : ''}`;
        item.innerHTML = `
            <div class="rank ${rankClasses[index] || ''}">${index + 1}</div>
            <div class="player-avatar">🎮</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">${player.score.toLocaleString()} نقطة</div>
            </div>
            ${index === 0 ? '<i class="fas fa-crown" style="color: var(--gold); font-size: 1.5rem;"></i>' : ''}
        `;
        finalScores.appendChild(item);
    });

    document.getElementById('winnerName').textContent = players[0]?.name || 'لا أحد';
    document.getElementById('winnerScore').textContent = `الفائز بالمباراة بـ ${players[0]?.score.toLocaleString() || 0} نقطة!`;

    showScreen('screen-results');
}

function restartGame() {
    currentRound = 1;
    currentQuestionIndex = 0;
    showScreen('screen-home');
}

function startTimer(seconds) {
    timeLeft = seconds;
    updateTimerDisplay();

    if (timer) {
        clearInterval(timer);
    }

    timer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(timer);
            if (document.getElementById('screen-game').classList.contains('active')) {
                submitTrapAnswer();
            }
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.textContent = display;
        if (timeLeft <= 10) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
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
