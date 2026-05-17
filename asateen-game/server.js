const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, getRoom, startGame, submitTrapAnswer, submitOption, disconnectPlayer } = require('./js/game-logic');

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
        if (room) {
            submitTrapAnswer(code, socket.id, questionIndex, answer);
            const allSubmitted = Object.values(room.players).every(p => p.trapAnswer !== null);
            if (allSubmitted) {
                io.to(code).emit('allAnswersSubmitted');
            }
        }
    });

    socket.on('submitOption', ({ code, questionIndex, optionIndex }) => {
        const room = getRoom(code);
        if (room) {
            const result = submitOption(code, socket.id, questionIndex, optionIndex);
            if (result) {
                socket.emit('optionResult', result);
                io.to(code).emit('scoreUpdate', { scores: room.scores });
                const allSubmitted = Object.values(room.players).every(p => p.selectedOption !== null);
                if (allSubmitted) {
                    setTimeout(() => {
                        io.to(code).emit('nextQuestion');
                    }, 3000);
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
