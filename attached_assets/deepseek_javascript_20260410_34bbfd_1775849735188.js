// تأكد من وجود هذه الأحداث داخل connect() في index.html

socket.on('gameStarted', (data) => {
    console.log('✅ gameStarted received', data);
    gameStarted = true;
    teamAName = data.teamAName;
    teamBName = data.teamBName;
    teamAColor = data.teamAColor;
    teamBColor = data.teamBColor;
    showGameScreen();
});

socket.on('roundStart', (data) => {
    console.log('✅ roundStart received', data);
    updateScoresBar(data.scores);
    document.getElementById('gameContent').innerHTML = `<div class="result-card">🎮 جولة ${data.round}/4 - ${data.roundType} تبدأ...</div>`;
});

socket.on('showQuestion', (data) => {
    console.log('✅ showQuestion received', data);
    showQuestion(data);
});