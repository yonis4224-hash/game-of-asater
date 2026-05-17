function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
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
    const code = document.getElementById('roomCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('تم نسخ الكود إلى الحافظة!');
    });
}

function startGame() {
    currentRound = 1;
    scores = {};
    loadNextQuestion();
    showScreen('screen-game');
    startTimer(30);
}

function loadNextQuestion() {
    const questions = questionsDB.culture;
    if (currentQuestionIndex >= questions.length) {
        currentQuestionIndex = 0;
    }

    const question = questions[currentQuestionIndex];
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('roundNumber').textContent = currentRound;
    
    currentQuestionIndex++;
}

function submitAnswer() {
    const answer = document.getElementById('answerInput').value;
    if (!answer.trim()) {
        alert('الرجاء كتابة إجابة!');
        return;
    }

    loadOptionsScreen();
    showScreen('screen-game-options');
    startTimer(15);
}

function loadOptionsScreen() {
    const questions = questionsDB.culture;
    const question = questions[currentQuestionIndex - 1];
    
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
    const selected = document.querySelector('.option-btn.selected');
    if (!selected) {
        alert('الرجاء اختيار إجابة!');
        return;
    }

    if (timer) {
        clearInterval(timer);
    }

    showScreen('screen-results');
    displayResults();
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
                submitAnswer();
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

function displayResults() {
    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const players = [
        { name: 'أحمد', score: 3450, avatar: '👑' },
        { name: 'سارة', score: 2890, avatar: '⚡' },
        { name: 'خالد', score: 2340, avatar: '🎯' }
    ];

    players.sort((a, b) => b.score - a.score);

    const rankClasses = ['gold', 'silver', 'bronze'];
    const rankIcons = ['🥇', '🥈', '🥉'];

    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = `final-score-item ${index === 0 ? 'first' : ''}`;
        item.innerHTML = `
            <div class="rank ${rankClasses[index]}">${index + 1}</div>
            <div class="player-avatar">${player.avatar}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">${player.score.toLocaleString()} نقطة</div>
            </div>
            ${index === 0 ? '<i class="fas fa-crown" style="color: var(--gold); font-size: 1.5rem;"></i>' : ''}
        `;
        finalScores.appendChild(item);
    });

    document.getElementById('winnerName').textContent = players[0].name;
    document.getElementById('winnerScore').textContent = `الفائز بالمباراة بـ ${players[0].score.toLocaleString()} نقطة!`;
}

function restartGame() {
    currentRound = 1;
    currentQuestionIndex = 0;
    scores = {};
    showScreen('screen-home');
}

// Canvas Drawing
const canvas = document.getElementById('drawingCanvas');
if (canvas) {
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

// Visual Reveal
setTimeout(() => {
    const visual = document.getElementById('visualImage');
    if (visual) visual.classList.add('revealed');
}, 3000);

// Initialize
loadQuestions();
document.getElementById('roomCode').textContent = generateRoomCode();
