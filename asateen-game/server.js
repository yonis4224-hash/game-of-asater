const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
    createRoom, joinRoom, kickPlayer, setLeader, updateTeamNames,
    getRoom, startGame, submitTrapAnswer, submitOption, disconnectPlayer,
    buildOptions, calculateQuestionResults, resetForNextQuestion,
    startDrawRound, submitDrawGuess, startCodenamesRound, revealCodenameWord,
    startOvertime, submitOvertimeAnswer, finishGame, rooms
} = require('./js/game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('createRoom', ({ playerName, avatar }) => {
        try {
            const room = createRoom(socket.id, playerName);
            if (avatar) room.players[socket.id].avatar = avatar;
            socket.join(room.code);
            socket.emit('roomCreated', room);
            console.log(`Room created: ${room.code} by ${playerName}`);
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
                const gameData = startGame(code);
                io.to(code).emit('gameStarted', gameData);
                console.log(`Game started in room ${code}`);
            }
        } catch (err) {
            console.error('startGame error:', err);
        }
    });

    socket.on('submitTrapAnswer', ({ code, questionIndex, answer }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitTrapAnswer(code, socket.id, questionIndex, answer);
        if (result && result.allSubmitted) {
            const teamOptions = buildOptions(code, questionIndex);
            if (teamOptions) {
                for (const [team, data] of Object.entries(teamOptions)) {
                    const teamPlayers = Object.values(room.players).filter(p => p.team === team);
                    for (const player of teamPlayers) {
                        io.to(player.socketId).emit('showOptions', { options: data.options });
                    }
                }
            }
        }
    });

    socket.on('submitOption', ({ code, questionIndex, optionIndex }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitOption(code, socket.id, questionIndex, optionIndex);
        if (result && result.allSubmitted) {
            const results = calculateQuestionResults(code, questionIndex);
            if (results) io.to(code).emit('questionResults', results);
        }
    });

    socket.on('requestNextQuestion', ({ code }) => {
        const room = getRoom(code);
        if (!room || room.status !== 'playing') return;
        const nextData = resetForNextQuestion(code);
        if (nextData.nextPhase === 'draw') {
            const drawData = startDrawRound(code);
            if (drawData) io.to(code).emit('startDrawRound', drawData);
        } else {
            io.to(code).emit('nextQuestion', nextData);
        }
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
        const codenamesData = startCodenamesRound(code);
        if (codenamesData) io.to(code).emit('startCodenamesRound', codenamesData);
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
                    if (finishData.winner) {
                        finishData.winningTeamScore = 500;
                        io.to(code).emit('gameFinished', finishData);
                    } else if (finishData.isTied) {
                        const overtimeData = startOvertime(code);
                        if (overtimeData) io.to(code).emit('startOvertime', overtimeData);
                    }
                }
            }
        }
    });

    socket.on('submitOvertimeAnswer', ({ code, optionIndex }) => {
        const room = getRoom(code);
        if (!room) return;
        const result = submitOvertimeAnswer(code, socket.id, optionIndex);
        if (result) {
            io.to(code).emit('overtimeResult', result);
            if (result.gameOver) {
                io.to(code).emit('gameFinished', {
                    winner: result.winner,
                    teamScores: result.teamScores,
                    players: room.players,
                    teamNames: result.teamNames,
                    mode: room.mode
                });
            } else if (result.needMore) {
                const overtimeData = startOvertime(code);
                if (overtimeData) io.to(code).emit('startOvertime', overtimeData);
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
