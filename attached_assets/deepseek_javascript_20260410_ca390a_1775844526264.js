const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);
    
    socket.on('createRoom', ({ playerName }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms.set(roomCode, {
            players: [{ id: socket.id, name: playerName, isReady: false, isCreator: true }],
            gameMode: '2v2'
        });
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('playersUpdate', rooms.get(roomCode).players);
    });
    
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        if (!room) return socket.emit('error', 'الغرفة غير موجودة');
        if (room.players.length >= 4) return socket.emit('error', 'الغرفة ممتلئة');
        
        room.players.push({ id: socket.id, name: playerName, isReady: false, isCreator: false });
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode });
        io.to(roomCode).emit('playersUpdate', room.players);
    });
    
    socket.on('playerReady', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
            io.to(roomCode).emit('playersUpdate', room.players);
            
            const allReady = room.players.length >= 2 && room.players.every(p => p.isReady);
            if (allReady) {
                io.to(roomCode).emit('gameStarted');
            }
        }
    });
    
    socket.on('disconnect', () => {
        for (const [code, room] of rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(code).emit('playersUpdate', room.players);
                if (room.players.length === 0) rooms.delete(code);
                break;
            }
        }
    });
});

server.listen(3000, () => console.log('http://localhost:3000'));