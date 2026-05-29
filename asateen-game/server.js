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
    autoConfirmTrapPlayers, autoConfirmOptionPlayers,
    createMafiaRoom, updateMafiaConfig, startMafiaGame,
    mafiaKill, doctorSave, policeCheck, resolveMafiaNight,
    nominatePlayer, mafiaVoteDay, resolveMafiaDay,
    getMafiaGameState, addMafiaChatMessage
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

function transitionToRound3(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    const randomCat = room.game.randomCategory || 'culture';
    const catNames = { culture: 'كرة قدم', cinema: 'سينما', wrestling: 'مصارعة' };
    const catName = catNames[randomCat] || 'كرة قدم';

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
}

function startMafiaNight(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    room.game.phase = 'night';
    room.game.nightResolved = false;

    io.to(code).emit('mafiaNightStart', { day: room.game.day });

    Object.entries(room.players).forEach(([id, player]) => {
        if (player.alive) {
            const state = getMafiaGameState(code, id);
            io.to(id).emit('mafiaState', state);
        }
    });

    addTimer(code, () => {
        const r = getRoom(code);
        if (r && r.game && r.game.phase === 'night') {
            Object.values(r.game.mafiaTeam).forEach(id => {
                if (r.game.mafiaChoices[id] === undefined) {
                    const aliveTargets = Object.values(r.players).filter(p => p.alive && p.team !== 'mafia');
                    if (aliveTargets.length > 0) {
                        r.game.mafiaChoices[id] = aliveTargets[0].socketId;
                    }
                }
            });
            if (r.game.doctorChoice === undefined) {
                r.game.doctorChoice = null;
            }
            startMafiaNightResolution(code);
        }
    }, 30000);
}

function checkMafiaNightReady(code) {
    const room = getRoom(code);
    if (!room || !room.game || room.game.phase !== 'night') return;
}

function startMafiaNightResolution(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    const result = resolveMafiaNight(code);
    if (!result) return;

    io.to(code).emit('mafiaNightResult', result);

    Object.entries(room.players).forEach(([id, player]) => {
        if (player.alive) {
            const state = getMafiaGameState(code, id);
            io.to(id).emit('mafiaState', state);
        }
    });

    if (result.win) {
        addTimer(code, () => {
            const allPlayers = room.players;
            io.to(code).emit('mafiaGameOver', { win: result.win, players: allPlayers });
        }, 5000);
        return;
    }

    addTimer(code, () => {
        startMafiaDay(code);
    }, 5000);
}

function startMafiaDay(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    room.game.phase = 'day';
    room.game.dayMessages = [];
    room.game.votes = {};
    room.game.nominated = [];

    io.to(code).emit('mafiaDayStart', { day: room.game.day });

    Object.entries(room.players).forEach(([id, player]) => {
        if (player.alive) {
            const state = getMafiaGameState(code, id);
            io.to(id).emit('mafiaState', state);
        }
    });

    addTimer(code, () => {
        startMafiaVoting(code);
    }, 60000);
}

function startMafiaVoting(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    room.game.phase = 'voting';
    room.game.votes = {};

    io.to(code).emit('mafiaVotingStart', { nominated: room.game.nominated, day: room.game.day });

    Object.entries(room.players).forEach(([id, player]) => {
        if (player.alive) {
            const state = getMafiaGameState(code, id);
            io.to(id).emit('mafiaState', state);
        }
    });

    addTimer(code, () => {
        resolveDayPhase(code);
    }, 30000);
}

function resolveDayPhase(code) {
    const room = getRoom(code);
    if (!room || !room.game) return;
    clearTimers(code);

    const result = resolveMafiaDay(code);
    if (!result) return;

    io.to(code).emit('mafiaDayResult', result);

    Object.entries(room.players).forEach(([id, player]) => {
        if (player.alive) {
            const state = getMafiaGameState(code, id);
            io.to(id).emit('mafiaState', state);
        }
    });

    if (result.win) {
        addTimer(code, () => {
            const allPlayers = room.players;
            io.to(code).emit('mafiaGameOver', { win: result.win, players: allPlayers });
        }, 5000);
        return;
    }

    addTimer(code, () => {
        startMafiaNight(code);
    }, 5000);
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

                addTimer(code, () => {
                    const room = getRoom(code);
                    if (!room || !room.game) return;
                    room.game.drawPhase = 'guessing';
                    io.to(code).emit('startDrawGuessing', { timer: 10, players: room.players, teamNames: room.teamNames });

                    addTimer(code, () => {
                        transitionToRound3(code);
                    }, 10000);
                }, 20000);
            } else {
                handleNextPhase(code);
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
            let room;
            if (mode === 'mafia') {
                room = createMafiaRoom(socket.id, playerName);
            } else {
                room = createRoom(socket.id, playerName, mode);
            }
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

    socket.on('endDrawPhase', ({ code }) => {
        const room = getRoom(code);
        if (!room || !room.game) return;
        if (room.game.drawPhase !== 'drawing') return;

        clearTimers(code);
        room.game.drawPhase = 'guessing';
        io.to(code).emit('startDrawGuessing', { timer: 10, players: room.players, teamNames: room.teamNames });

        addTimer(code, () => {
            transitionToRound3(code);
        }, 10000);
    });

    socket.on('endDrawRound', ({ code }) => {
        transitionToRound3(code);
    });

    socket.on('updateMafiaConfig', ({ code, config }) => {
        const room = updateMafiaConfig(code, config);
        if (room) io.to(code).emit('roomUpdate', room);
    });

    socket.on('startMafiaGame', ({ code }) => {
        try {
            const room = getRoom(code);
            if (room && room.host === socket.id && room.mode === 'mafia') {
                clearTimers(code);
                const gameData = startMafiaGame(code);
                if (gameData) {
                    io.to(code).emit('mafiaGameStarted', gameData);

                    Object.entries(room.players).forEach(([id, player]) => {
                        const state = getMafiaGameState(code, id);
                        io.to(id).emit('mafiaState', state);
                    });

                    startMafiaNight(code);
                }
            }
        } catch (err) {
            console.error('startMafiaGame error:', err);
        }
    });

    socket.on('mafiaKill', ({ code, targetId }) => {
        const result = mafiaKill(code, socket.id, targetId);
        if (result) {
            if (!result.waiting) {
                startMafiaNightResolution(code);
            } else {
                const room = getRoom(code);
                if (room && room.game) {
                    room.game.mafiaTeam.forEach(id => {
                        io.to(id).emit('mafiaKillUpdate', { submittedCount: result.submittedCount, totalMafia: result.totalMafia });
                    });
                }
            }
        }
    });

    socket.on('doctorSave', ({ code, targetId }) => {
        const result = doctorSave(code, socket.id, targetId);
        if (result) {
            socket.emit('doctorSaveConfirm', result);
            checkMafiaNightReady(code);
        }
    });

    socket.on('policeCheck', ({ code, targetId }) => {
        const result = policeCheck(code, socket.id, targetId);
        if (result) {
            socket.emit('policeCheckResult', result);
            checkMafiaNightReady(code);
        }
    });

    socket.on('mafiaNominate', ({ code, targetId }) => {
        const result = nominatePlayer(code, socket.id, targetId);
        if (result) {
            io.to(code).emit('mafiaNominationUpdate', result);
        }
    });

    socket.on('mafiaVote', ({ code, targetId }) => {
        const result = mafiaVoteDay(code, socket.id, targetId);
        if (result) {
            io.to(code).emit('mafiaVoteUpdate', result);
            if (result.totalVotes >= result.neededVotes) {
                resolveDayPhase(code);
            }
        }
    });

    socket.on('mafiaChat', ({ code, message }) => {
        const msg = addMafiaChatMessage(code, socket.id, message);
        if (msg) io.to(code).emit('mafiaChatMessage', msg);
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
        const result = disconnectPlayer(socket.id);
        if (result && result.room) {
            io.to(result.code).emit('roomUpdate', result.room);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
