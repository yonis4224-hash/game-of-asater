function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectMode(card) {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const modeTitle = card.querySelector('.mode-title').textContent;
    if (modeTitle.includes('الفردية')) {
        selectedMode = 'solo';
        document.getElementById('teamSizeSelector').style.display = 'none';
    } else {
        selectedMode = 'team';
        document.getElementById('teamSizeSelector').style.display = 'block';
    }
}

function setTeamSize(size) {
    teamSize = size;
    document.querySelectorAll('.team-size-btn').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    document.getElementById('playerCount').textContent = `1/${size * 2}`;
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
    if (selectedMode === 'solo') {
        startSoloGame();
    } else {
        startTeamGame();
    }
}

function startSoloGame() {
    currentRound = 1;
    currentQuestionInRound = 0;
    scores = {};
    players.forEach(p => { scores[p] = 0; });
    
    const allQuestions = [...questionsDB.culture, ...questionsDB.football, ...questionsDB.cinema, ...questionsDB.wrestling];
    roundQuestions = allQuestions.sort(() => 0.5 - Math.random()).slice(0, 15);
    
    showScreen('screen-game');
    loadSoloQuestion();
}

function loadSoloQuestion() {
    if (currentQuestionInRound >= roundQuestions.length) {
        showResults();
        return;
    }
    
    const question = roundQuestions[currentQuestionInRound];
    confirmedPlayers = {};
    trapAnswers = [];
    
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('answerInput').value = '';
    document.getElementById('roundNumber').textContent = `${currentQuestionInRound + 1}/15`;
    document.getElementById('roundTitle').textContent = 'سؤال فردي';
    
    showScreen('screen-game');
    updatePlayersStatus('game');
    updateScoreBoard();
    startTimer(10);
}

function startTeamGame() {
    currentRound = 1;
    currentQuestionInRound = 0;
    scores = {};
    teamScores = { teamA: 0, teamB: 0 };
    players.forEach(p => { scores[p] = 0; });
    
    assignTeams();
    showScreen('screen-game');
    loadTeamRound();
}

function assignTeams() {
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    const half = Math.floor(shuffled.length / 2);
    teams.teamA = shuffled.slice(0, half);
    teams.teamB = shuffled.slice(half);
}

function loadTeamRound() {
    if (currentRound > totalRounds) {
        showResults();
        return;
    }
    
    const roundNames = ['أسئلة عامة', 'الرسم', 'ارمي عشوائي', 'كود نيمز'];
    currentRoundName = roundNames[currentRound - 1];
    
    showRoundTransition(currentRoundName, () => {
        if (currentRound === 1) {
            const questions = [...questionsDB.culture].sort(() => 0.5 - Math.random()).slice(0, 5);
            roundQuestions = questions;
            currentQuestionInRound = 0;
            loadTeamQuestion();
        } else if (currentRound === 2) {
            loadDrawRound();
        } else if (currentRound === 3) {
            loadRandomRound();
        } else if (currentRound === 4) {
            loadCodenamesRound();
        }
    });
}

function showRoundTransition(roundName, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'round-transition-overlay';
    overlay.innerHTML = `
        <div class="round-transition-content">
            <div class="round-transition-icon">⚡</div>
            <div class="round-transition-title">${roundName}</div>
            <div class="round-transition-subtitle">الجولة ${currentRound} من ${totalRounds}</div>
            <div class="round-transition-timer">5</div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    let count = 5;
    const timerEl = overlay.querySelector('.round-transition-timer');
    const interval = setInterval(() => {
        count--;
        timerEl.textContent = count;
        if (count <= 0) {
            clearInterval(interval);
            overlay.remove();
            callback();
        }
    }, 1000);
}

function loadTeamQuestion() {
    if (currentQuestionInRound >= roundQuestions.length) {
        currentRound++;
        currentQuestionInRound = 0;
        loadTeamRound();
        return;
    }
    
    const question = roundQuestions[currentQuestionInRound];
    confirmedPlayers = {};
    trapAnswers = [];
    
    document.getElementById('questionText').textContent = question.س;
    document.getElementById('answerInput').value = '';
    document.getElementById('roundNumber').textContent = currentRound;
    document.getElementById('roundTitle').textContent = currentRoundName;
    
    showScreen('screen-game');
    updatePlayersStatus('game');
    updateScoreBoard();
    startTimer(10);
}

function loadDrawRound() {
    showScreen('screen-draw');
    startTimer(30);
}

function submitDrawGuess() {
    const guess = document.getElementById('drawGuessInput').value.trim();
    const drawer = getCurrentPlayer();
    const guesser = getCurrentPlayer();
    
    if (timer) clearInterval(timer);
    
    if (guess && checkDrawGuess(guess)) {
        if (selectedMode === 'solo') {
            scores[guesser] = (scores[guesser] || 0) + 3;
        } else {
            const currentTeam = teams.teamA.includes(guesser) ? 'teamA' : 'teamB';
            teamScores[currentTeam] += 3;
            scores[guesser] = (scores[guesser] || 0) + 3;
            scores[drawer] = (scores[drawer] || 0) + 3;
        }
    }
    
    currentRound++;
    currentQuestionInRound = 0;
    loadTeamRound();
}

function checkDrawGuess(guess) {
    const drawWords = ['كرة ذهبية', 'كأس العالم', 'ملعب', 'حكم', 'لاعب'];
    return drawWords.some(w => guess.includes(w) || w.includes(guess));
}

function loadRandomRound() {
    const categories = ['football', 'wrestling', 'cinema'];
    const categoryNames = { football: 'كرة قدم', wrestling: 'مصارعة', cinema: 'سينما' };
    const chosen = categories[Math.floor(Math.random() * categories.length)];
    currentRoundName = categoryNames[chosen];
    
    const questions = [...questionsDB[chosen]].sort(() => 0.5 - Math.random()).slice(0, 5);
    roundQuestions = questions;
    currentQuestionInRound = 0;
    
    showRoundTransition(currentRoundName, () => {
        loadTeamQuestion();
    });
}

function loadCodenamesRound() {
    showScreen('screen-codenames');
    startTimer(60);
}

function submitCodenames() {
    if (timer) clearInterval(timer);
    
    const selectedCards = document.querySelectorAll('.codename-card.selected');
    const currentPlayer = getCurrentPlayer();
    const currentTeam = teams.teamA.includes(currentPlayer) ? 'teamA' : 'teamB';
    
    teamScores[currentTeam] += 3;
    scores[currentPlayer] = (scores[currentPlayer] || 0) + 3;
    
    currentRound++;
    currentQuestionInRound = 0;
    loadTeamRound();
}

function updatePlayersStatus(screen) {
    const barId = screen === 'game' ? 'playersConfirmBarGame' : 'playersConfirmBarOptions';
    const bar = document.getElementById(barId);
    if (!bar) return;
    
    bar.innerHTML = '';
    
    players.forEach(player => {
        const dot = document.createElement('div');
        dot.className = 'player-confirm-dot';
        if (confirmedPlayers[player]) {
            dot.classList.add('confirmed');
            dot.innerHTML = `<span class="player-confirm-avatar">👤</span><span class="player-confirm-check">✓</span>`;
        } else {
            dot.innerHTML = `<span class="player-confirm-avatar">👤</span>`;
        }
        dot.title = player;
        bar.appendChild(dot);
    });
}

function submitAnswer() {
    const answer = document.getElementById('answerInput').value.trim();
    
    const playerName = players[0] || 'اللاعب';
    confirmedPlayers[playerName] = true;
    updatePlayersStatus('game');
    
    const question = roundQuestions[currentQuestionInRound];
    if (!question) return;
    
    if (answer && !checkAnswer(answer, question)) {
        trapAnswers.push({ player: playerName, answer: answer });
    }
    
    if (answer && checkAnswer(answer, question)) {
        if (selectedMode === 'solo') {
            scores[playerName] = (scores[playerName] || 0) + 3;
        } else {
            const currentTeam = teams.teamA.includes(playerName) ? 'teamA' : 'teamB';
            teamScores[currentTeam] += 3;
            scores[playerName] = (scores[playerName] || 0) + 3;
        }
    }
    
    loadOptionsScreen();
    showScreen('screen-game-options');
    updatePlayersStatus('options');
    startTimer(10);
}

function processSoloAnswer(answer) {
    const question = roundQuestions[currentQuestionInRound];
    if (!question) return;
    
    const playerName = players[0] || 'اللاعب';
    
    if (question.خيارات) {
        const selectedBtn = document.querySelector('.option-btn.selected');
        if (selectedBtn) {
            const selectedText = selectedBtn.textContent.replace(/^[أ-د]\s*/, '').trim();
            const correctOption = question.خيارات[question.الجواب];
            
            if (selectedText === correctOption || selectedText.includes(correctOption) || correctOption.includes(selectedText)) {
                scores[playerName] = (scores[playerName] || 0) + 3;
            }
        }
    } else {
        const isCorrect = checkAnswer(answer, question);
        if (isCorrect) {
            scores[playerName] = (scores[playerName] || 0) + 3;
        }
    }
    
    currentQuestionInRound++;
    loadSoloQuestion();
}

function processTeamAnswer(answer) {
    const question = roundQuestions[currentQuestionInRound];
    if (!question) return;
    
    const currentPlayer = getCurrentPlayer();
    const currentTeam = teams.teamA.includes(currentPlayer) ? 'teamA' : 'teamB';
    
    if (question.خيارات) {
        const selectedBtn = document.querySelector('.option-btn.selected');
        if (selectedBtn) {
            const selectedText = selectedBtn.textContent.replace(/^[أ-د]\s*/, '').trim();
            const correctOption = question.خيارات[question.الجواب];
            
            if (selectedText === correctOption || selectedText.includes(correctOption) || correctOption.includes(selectedText)) {
                teamScores[currentTeam] += 3;
                scores[currentPlayer] = (scores[currentPlayer] || 0) + 3;
            }
        }
    } else {
        const isCorrect = checkAnswer(answer, question);
        if (isCorrect) {
            teamScores[currentTeam] += 3;
            scores[currentPlayer] = (scores[currentPlayer] || 0) + 3;
        }
    }
    
    currentQuestionInRound++;
    loadTeamQuestion();
}

function checkAnswer(answer, question) {
    if (!answer) return false;
    
    if (question.خيارات) {
        const correctOption = question.خيارات[question.الجواب];
        return answer === correctOption || answer.includes(correctOption) || correctOption.includes(answer);
    }
    
    if (question.جواب) {
        return answer === question.جواب || answer.includes(question.جواب) || question.جواب.includes(answer);
    }
    
    return false;
}

function getCurrentPlayer() {
    return players[0] || 'اللاعب';
}

function confirmOption() {
    if (timer) {
        clearInterval(timer);
    }
    
    const playerName = players[0] || 'اللاعب';
    confirmedPlayers[playerName] = true;
    updatePlayersStatus('options');
    
    const question = roundQuestions[currentQuestionInRound];
    if (!question) return;
    
    const selectedBtn = document.querySelector('.option-btn.selected');
    
    if (question.خيارات) {
        if (selectedBtn) {
            const selectedText = selectedBtn.textContent.replace(/^[أ-د]\s*/, '').trim();
            const correctOption = question.خيارات[question.الجواب];
            
            if (selectedText === correctOption || selectedText.includes(correctOption) || correctOption.includes(selectedText)) {
                if (selectedMode === 'solo') {
                    scores[playerName] = (scores[playerName] || 0) + 3;
                } else {
                    const currentTeam = teams.teamA.includes(playerName) ? 'teamA' : 'teamB';
                    teamScores[currentTeam] += 3;
                    scores[playerName] = (scores[playerName] || 0) + 3;
                }
            }
        }
    } else {
        if (selectedBtn) {
            const selectedText = selectedBtn.textContent.replace(/^[أ-د]\s*/, '').trim();
            const correctAnswer = question.جواب;
            
            if (selectedText === correctAnswer || selectedText.includes(correctAnswer) || correctAnswer.includes(selectedText)) {
                if (selectedMode === 'solo') {
                    scores[playerName] = (scores[playerName] || 0) + 3;
                } else {
                    const currentTeam = teams.teamA.includes(playerName) ? 'teamA' : 'teamB';
                    teamScores[currentTeam] += 3;
                    scores[playerName] = (scores[playerName] || 0) + 3;
                }
            } else {
                const trap = trapAnswers.find(t => t.answer === selectedText);
                if (trap) {
                    scores[trap.player] = (scores[trap.player] || 0) + 1;
                }
            }
        }
    }
    
    trapAnswers = [];
    
    if (selectedMode === 'solo') {
        currentQuestionInRound++;
        loadSoloQuestion();
    } else {
        currentQuestionInRound++;
        loadTeamQuestion();
    }
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
            autoSubmit();
        }
    }, 1000);
}

function autoSubmit() {
    if (document.getElementById('screen-game').classList.contains('active')) {
        submitAnswer();
    } else if (document.getElementById('screen-game-options').classList.contains('active')) {
        confirmOption();
    } else if (document.getElementById('screen-draw').classList.contains('active')) {
        submitDrawGuess();
    } else if (document.getElementById('screen-codenames').classList.contains('active')) {
        submitCodenames();
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    const timerEl = document.getElementById('timer') || document.getElementById('timer2');
    if (timerEl) {
        timerEl.textContent = display;
        if (timeLeft <= 5) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
    }
}

function updateScoreBoard() {
    const scoreBoard = document.getElementById('scoreBoard');
    if (!scoreBoard) return;
    
    scoreBoard.innerHTML = '';
    
    if (selectedMode === 'solo') {
        const sorted = [...players].sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
        sorted.forEach(player => {
            const item = document.createElement('div');
            item.className = 'score-item';
            item.innerHTML = `
                <div class="score-name">${player}</div>
                <div class="score-value">${scores[player] || 0}</div>
            `;
            scoreBoard.appendChild(item);
        });
    } else {
        const teamAItem = document.createElement('div');
        teamAItem.className = 'score-item';
        teamAItem.innerHTML = `
            <div class="score-name">الفريق أ</div>
            <div class="score-value">${teamScores.teamA}</div>
        `;
        scoreBoard.appendChild(teamAItem);
        
        const teamBItem = document.createElement('div');
        teamBItem.className = 'score-item';
        teamBItem.innerHTML = `
            <div class="score-name">الفريق ب</div>
            <div class="score-value">${teamScores.teamB}</div>
        `;
        scoreBoard.appendChild(teamBItem);
    }
}

function showResults() {
    showScreen('screen-results');
    displayResults();
}

function displayResults() {
    const finalScores = document.getElementById('finalScores');
    finalScores.innerHTML = '';

    const rankIcons = ['🥇', '🥈', '🥉'];

    if (selectedMode === 'solo') {
        const sorted = Object.entries(scores)
            .map(([name, score]) => ({ name, score, avatar: '👤' }))
            .sort((a, b) => b.score - a.score);

        sorted.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-score-item';
            if (index < 3) item.classList.add(['first', 'second', 'third'][index]);
            item.innerHTML = `
                <div class="rank ${['gold', 'silver', 'bronze'][index] || ''}">${rankIcons[index] || index + 1}</div>
                <div class="player-avatar">${player.avatar}</div>
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">${player.score} نقطة</div>
                </div>
            `;
            finalScores.appendChild(item);
        });

        document.getElementById('winnerName').textContent = sorted[0]?.name || '';
        document.getElementById('winnerScore').textContent = `الفائز بالمباراة بـ ${sorted[0]?.score || 0} نقطة!`;
    } else {
        const teamsRanked = [
            { name: 'الفريق أ', score: teamScores.teamA, players: teams.teamA, emoji: '⚔️' },
            { name: 'الفريق ب', score: teamScores.teamB, players: teams.teamB, emoji: '🛡️' }
        ].sort((a, b) => b.score - a.score);

        teamsRanked.forEach((team, teamIndex) => {
            const teamDiv = document.createElement('div');
            teamDiv.className = `team-result ${teamIndex === 0 ? 'team-winner' : 'team-runnerup'}`;
            
            const teamPlayers = team.players
                .map(p => ({ name: p, score: scores[p] || 0 }))
                .sort((a, b) => b.score - a.score);
            
            let playersHtml = teamPlayers.map((p, i) => `
                <div class="team-player-item">
                    <span class="team-player-rank">${i + 1}</span>
                    <span class="team-player-avatar">👤</span>
                    <span class="team-player-name">${p.name}</span>
                    <span class="team-player-score">${p.score} نقطة</span>
                </div>
            `).join('');
            
            teamDiv.innerHTML = `
                <div class="team-result-header">
                    <span class="team-result-emoji">${team.emoji}</span>
                    <span class="team-result-name">${team.name}</span>
                    <span class="team-result-score">${team.score} نقطة</span>
                    ${teamIndex === 0 ? '<span class="team-crown">👑</span>' : ''}
                </div>
                <div class="team-result-players">${playersHtml}</div>
            `;
            
            finalScores.appendChild(teamDiv);
        });
        
        document.getElementById('winnerName').textContent = teamsRanked[0]?.name || '';
        document.getElementById('winnerScore').textContent = `الفريق الفائز بـ ${teamsRanked[0]?.score || 0} نقطة!`;
    }
}

function loadOptionsScreen() {
    const question = roundQuestions[currentQuestionInRound];
    if (!question) return;
    
    document.getElementById('questionText2').textContent = question.س;
    
    const grid = document.getElementById('optionsGrid');
    grid.innerHTML = '';
    
    const letters = ['أ', 'ب', 'ج', 'د'];
    
    let options;
    if (question.خيارات) {
        options = [...question.خيارات];
    } else {
        const correctAnswer = question.جواب || 'الإجابة الصحيحة';
        const traps = trapAnswers.map(t => t.answer).filter((v, i, a) => a.indexOf(v) === i);
        options = [correctAnswer, ...traps].slice(0, 4);
    }
    
    options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.onclick = function() { selectOption(this); };
        btn.innerHTML = `<span class="option-letter">${letters[index]}</span> ${option}`;
        grid.appendChild(btn);
    });
}

function restartGame() {
    currentRound = 1;
    currentQuestionInRound = 0;
    scores = {};
    teamScores = { teamA: 0, teamB: 0 };
    confirmedPlayers = {};
    trapAnswers = [];
    showScreen('screen-home');
}

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

setTimeout(() => {
    const visual = document.getElementById('visualImage');
    if (visual) visual.classList.add('revealed');
}, 3000);

loadQuestions();
document.getElementById('roomCode').textContent = generateRoomCode();
