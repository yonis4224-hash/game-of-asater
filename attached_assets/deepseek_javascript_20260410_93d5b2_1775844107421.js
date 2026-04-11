// داخل connectSocket() بعد الأحداث الموجودة

socket.on('showIronManQuestion', (data) => {
    showIronManScreen(data);
});

socket.on('ironManAnswered', (data) => {
    showToast(`فريق ${data.team === 'teamA' ? 'اللاعب 1' : 'اللاعب 2'} أجاب: ${data.isCorrect ? '✅ صحيح' : '❌ خطأ'}`);
    if (!data.isCorrect) {
        showToast(`الإجابة الصحيحة: ${data.correctAnswer}`);
    }
});

socket.on('showSports1v1Question', (data) => {
    showSports1v1Screen(data);
});

socket.on('showGamingQuestion', (data) => {
    showGamingScreen(data);
});

socket.on('showSeriesQuestion', (data) => {
    showSeriesScreen(data);
});

socket.on('teamAnswered1v1', (data) => {
    showToast(`اللاعب ${data.team === 'teamA' ? '1' : '2'} أجاب: ${data.isCorrect ? '✅ صحيح' : '❌ خطأ'}`);
});

socket.on('roundEnd1v1', (data) => {
    showRoundEnd1v1(data);
});

socket.on('roundEnd2v2', (data) => {
    showRoundEnd2v2(data);
});

socket.on('showQuestion2v2', (data) => {
    showQuestion2v2Screen(data);
});

socket.on('teamAnswered2v2', (data) => {
    showToast(`فريق ${data.team === 'teamA' ? 'النور' : 'الظلام'} أجاب!`);
});

socket.on('startDrawing2v2', (data) => {
    showDrawing2v2Screen(data);
});

socket.on('showGuesses2v2', (data) => {
    showGuesses2v2Screen(data);
});

socket.on('guessResult2v2', (data) => {
    if (data.team === myTeam) {
        showToast(data.isCorrect ? '✅ إجابتك صحيحة!' : `❌ خطأ! الكلمة الصحيحة: ${data.correctWord}`);
    }
});

socket.on('showWeirdQuestion2v2', (data) => {
    showWeirdQuestion2v2Screen(data);
});

socket.on('weirdTeamAnswered2v2', (data) => {
    showToast(`فريق ${data.team === 'teamA' ? 'النور' : 'الظلام'} أجاب بـ: ${data.answer}`);
});

socket.on('startSpyMaster2v2', (data) => {
    showSpyMaster2v2Screen(data);
});

socket.on('spyClueSubmitted2v2', (data) => {
    showToast(`تم إرسال تلميح فريق ${data.team === 'teamA' ? 'النور' : 'الظلام'}`);
});

socket.on('showSpyGuesses2v2', (data) => {
    showSpyGuesses2v2Screen(data);
});

socket.on('spyGuessResult2v2', (data) => {
    if (data.team === myTeam) {
        showToast(data.isCorrect ? '✅ إجابتك صحيحة!' : `❌ خطأ! الكلمة الصحيحة: ${data.correctWord}`);
    }
});