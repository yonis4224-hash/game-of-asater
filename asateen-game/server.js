const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
    createRoom, joinRoom, switchTeam, kickPlayer, setLeader, updateTeamNames,
    getRoom, startGame, submitTrapAnswer, submitOption, disconnectPlayer,
    buildOptions, calculateQuestionResults, resetForNextQuestion,
    startDrawRound, submitDrawGuess, startCodenamesRound, revealCodenameWord,
    finishGame, rooms,
    autoConfirmTrapPlayers, autoConfirmOptionPlayers
} = require('./js/game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

const roomTimers = {};

function clearTimers(code) {
    if (roomTimers[code]) {
        roomTimers[code].forEach(t => clearTimeout(t));
        roomTimers[code] = [];
    }
}

function addTimer(code, fn, ms) {
    if (!roomTimers[code]) roomTimers[code] = [];
    const t = setTimeout(fn, ms);
    roomTimers[code].push(t);
    return t;
}

function startQuestionFlow(code, questionIndex) {
    const room = getRoom(code);
    if (!room || room.status !== 'playing') return;

    addTimer(code, () => {
        autoConfirmTrapPlayers(code);
        const teamOptionsData = buildOptions(code, questionIndex);
        if (teamOptionsData) {
            const { teamOptions, confirmedPlayers } = teamOptionsData;
            for (const [team, data] of Object.entries(teamOptions)) {
                const teamPlayers = Object.values(room.players).filter(p => p.team === team);
                for (const player of teamPlayers) {
                    io.to(player.socketId).emit('showOptions', { options: data.options, confirmedPlayers });
                }
            }

            addTimer(code, () => {
                autoConfirmOptionPlayers(code);
                const results = calculateQuestionResults(code, questionIndex);
                if (results) io.to(code).emit('questionResults', results);
            }, 10000);
        }
    }, 10000);
}

function handleNextPhase(code) {
    const room = getRoom(code);
    if (!room || room.status !== 'playing') return;
    clearTimers(code);

    const nextData = resetForNextQuestion(code);
    if (!nextData) return;

    if (nextData.isFinished) {
        io.to(code).emit('gameFinished', nextData.finishData);
        return;
    }

    if (nextData.nextPhase === 'draw') {
        io.to(code).emit('showRoundTransition', {
            round: 2,
            roundTitle: 'الجولة الثانية - الرسم',
            roundDisplayName: 'الرسم'
        });

        addTimer(code, () => {
            const drawData = startDrawRound(code);
            if (drawData) {
                io.to(code).emit('startDrawRound', drawData);
            } else {
                const finishData = finishGame(code);
                io.to(code).emit('gameFinished', finishData);
            }
        }, 5000);
        return;
    }

    if (nextData.nextPhase === 'codenames') {
        io.to(code).emit('showRoundTransition', {
            round: 4,
            roundTitle: 'الجولة الرابعة - كود نيمز',
            roundDisplayName: 'كود نيمز'
        });

        addTimer(code, () => {
            const codenamesData = startCodenamesRound(code);
            if (codenamesData) io.to(code).emit('startCodenamesRound', codenamesData);
        }, 5000);
        return;
    }

    if (nextData.showRoundTransition) {
        io.to(code).emit('showRoundTransition', {
            round: nextData.round,
            roundTitle: nextData.roundTitle,
            roundDisplayName: nextData.roundDisplayName
        });

        addTimer(code, () => {
            io.to(code).emit('nextQuestion', nextData);
            startQuestionFlow(code, nextData.questionIndex);
        }, 5000);
        return;
    }

    io.to(code).emit('nextQuestion', nextData);
    startQuestionFlow(code, nextData.questionIndex);
}

app.use(express.static(path.join(__dirname)));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('createRoom', ({ playerName, avatar, mode }) => {
        try {
            const room = createRoom(socket.id, playerName, mode);
            if (avatar !== undefined && avatar !== null) room.players[socket.id].avatar = avatar;
            socket.join(room.code);
            socket.emit('roomCreated', room);
            console.log(`Room created: ${room.code} by ${playerName} (mode: ${room.mode})`);
        } catch (err) {
            console.error('createRoom error:', err);
            socket.emit('error', { message: 'حدث خطأ أثناء إنشاء الغرفة' });
        }
    });

    socket.on('joinRoom', ({ code, playerName, avatar }) => {
        try {
            const result = joinRoom(code, socket.id, playerName, avatar);
            if (result.success) {
                socket.join(code);
                io.to(code).emit('roomUpdate', result.room);
                socket.emit('joinedRoom', result.room);
                console.log(`${playerName} joined room ${code}`);
            } else {
                socket.emit('error', { message: result.message });
            }
        } catch (err) {
            console.error('joinRoom error:', err);
            socket.emit('error', { message: 'حدث خطأ أثناء الانضمام' });
        }
    });

    socket.on('switchTeam', ({ code, newTeam }) => {
        const room = switchTeam(code, socket.id, newTeam);
        if (room) io.to(code).emit('roomUpdate', room);
    });

    socket.on('kickPlayer', ({ code, targetSocketId }) => {
        const result = kickPlayer(code, socket.id, targetSocketId);
        if (result.success) {
            io.to(code).emit('roomUpdate', result.room);
            io.to(targetSocketId).emit('kicked', { message: 'تم طردك من الغرفة' });
        } else {
            socket.emit('error', { message: result.message });
        }
    });

    socket.on('setLeader', ({ code, targetSocketId }) => {
        const room = setLeader(code, socket.id, targetSocketId);
        if (room) io.to(code).emit('roomUpdate', room);
    });

    socket.on('updateTeamNames', ({ code, teamAName, teamBName }) => {
        const room = updateTeamNames(code, teamAName, teamBName);
        if (room) io.to(code).emit('roomUpdate', room);
    });

    socket.on('startGame', ({ code }) => {
        try {
            const room = getRoom(code);
            if (room && room.host === socket.id) {
                clearTimers(code);
                const gameData = startGame(code);
                gameData.mode = room.mode;
                io.to(code).emit('gameStarted', gameData);
                console.log(`Game started in room ${code}`);
                startQuestionFlow(code, gameData.questionIndex);
            }
        } catch (err) {
            console.error('startGame error:', err);
        }
    });

    socket.on('submitTrapAnswer', ({ code, questionIndex, answer }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitTrapAnswer(code, socket.id, questionIndex, answer);
        if (result) {
            io.to(code).emit('trapSubmitted', { socketId: socket.id });
            if (result.allSubmitted) {
                const teamOptionsData = buildOptions(code, questionIndex);
                if (teamOptionsData) {
                    const { teamOptions, confirmedPlayers } = teamOptionsData;
                    for (const [team, data] of Object.entries(teamOptions)) {
                        const teamPlayers = Object.values(room.players).filter(p => p.team === team);
                        for (const player of teamPlayers) {
                            io.to(player.socketId).emit('showOptions', { options: data.options, confirmedPlayers });
                        }
                    }

                    addTimer(code, () => {
                        autoConfirmOptionPlayers(code);
                        const results = calculateQuestionResults(code, questionIndex);
                        if (results) io.to(code).emit('questionResults', results);
                    }, 10000);
                }
            }
        }
    });

    socket.on('submitOption', ({ code, questionIndex, optionIndex }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitOption(code, socket.id, questionIndex, optionIndex);
        if (result) {
            io.to(code).emit('confirmedPlayersUpdate', { confirmedPlayers: result.confirmedPlayers });
            if (result.allSubmitted) {
                const results = calculateQuestionResults(code, questionIndex);
                if (results) io.to(code).emit('questionResults', results);
            }
        }
    });

    socket.on('requestNextQuestion', ({ code }) => {
        handleNextPhase(code);
    });

    socket.on('submitDrawGuess', ({ code, guess }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitDrawGuess(code, socket.id, guess);
        if (result) {
            socket.emit('drawGuessResult', result);
            if (result.isCorrect) io.to(code).emit('scoreUpdate', { scores: room.scores });
        }
    });

    socket.on('endDrawRound', ({ code }) => {
        const room = getRoom(code);
        if (!room) return;
        clearTimers(code);

        const randomCat = room.game.randomCategory;
        const catName = { culture: 'كرة قدم', cinema: 'سينما', wrestling: 'مصارعة' }[randomCat] || 'عشوائي';

        io.to(code).emit('showRoundTransition', {
            round: 3,
            roundTitle: `الجولة الثالثة - ${catName}`,
            roundDisplayName: catName
        });

        addTimer(code, () => {
            room.game.currentRound = 3;
            room.game.currentQuestionIndex = 0;

            for (const player of Object.values(room.players)) {
                player.trapAnswer = null;
                player.selectedOption = null;
                player.hasConfirmed = false;
            }
            room.game.teamOptions = null;

            const nextData = {
                round: 3,
                questionIndex: 0,
                question: room.game.questions[3][0],
                timer: 10,
                players: room.players,
                mode: room.mode,
                teamNames: room.teamNames,
                isSolo: false,
                totalQuestions: 5,
                roundTitle: `الجولة الثالثة - ${catName}`,
                isFinished: false
            };
            io.to(code).emit('nextQuestion', nextData);
            startQuestionFlow(code, 0);
        }, 5000);
    });

    socket.on('revealCodenameWord', ({ code, wordIndex }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = revealCodenameWord(code, socket.id, wordIndex);
        if (result) {
            io.to(code).emit('codenameRevealed', result);
            if (result.winner) {
                const finishData = finishGame(code);
                if (finishData) {
                    io.to(code).emit('gameFinished', finishData);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        disconnectPlayer(socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
