const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, getRoom, startGame, submitTrapAnswer, submitOption, disconnectPlayer, buildOptions, calculateQuestionResults, resetForNextQuestion } = require('./js/game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('createRoom', ({ playerName }) => {
        const room = createRoom(socket.id, playerName);
        socket.join(room.code);
        socket.emit('roomCreated', room);
        console.log(`Room created: ${room.code} by ${playerName}`);
    });

    socket.on('joinRoom', ({ code, playerName }) => {
        const result = joinRoom(code, socket.id, playerName);
        if (result.success) {
            socket.join(code);
            io.to(code).emit('roomUpdate', result.room);
            socket.emit('joinedRoom', result.room);
            console.log(`${playerName} joined room ${code}`);
        } else {
            socket.emit('error', { message: result.message });
        }
    });

    socket.on('startGame', ({ code }) => {
        const room = getRoom(code);
        if (room && room.host === socket.id) {
            const gameData = startGame(code);
            io.to(code).emit('gameStarted', gameData);
            console.log(`Game started in room ${code}`);
        }
    });

    socket.on('submitTrapAnswer', ({ code, questionIndex, answer }) => {
        const room = getRoom(code);
        if (!room) return;

        const result = submitTrapAnswer(code, socket.id, questionIndex, answer);
        if (result && result.allSubmitted) {
            const options = buildOptions(code, questionIndex);
            if (options) {
                io.to(code).emit('showOptions', { options: options.options });
            }
        }
    });

    socket.on('submitOption', ({ code, questionIndex, optionIndex }) => {
        const room = getRoom(code);
        if (!room) return;

        const result = submitOption(code, socket.id, questionIndex, optionIndex);
        if (result && result.allSubmitted) {
            const results = calculateQuestionResults(code, questionIndex);
            if (results) {
                io.to(code).emit('questionResults', results);
            }
        }
    });

    socket.on('requestNextQuestion', ({ code }) => {
        const room = getRoom(code);
        if (!room || room.status !== 'playing') return;

        const nextData = resetForNextQuestion(code);
        if (nextData.isFinished) {
            io.to(code).emit('gameFinished', { scores: room.scores, players: room.players, mode: room.mode });
        } else {
            io.to(code).emit('nextQuestion', nextData);
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
