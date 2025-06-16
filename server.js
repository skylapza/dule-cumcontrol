// 📦 server.js - WebRTC signaling server with role support (master/player)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (public directory)
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // เก็บ socket.id และ role ของผู้ใช้ในแต่ละห้อง

io.on('connection', (socket) => {
  console.log(`📡 User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, role }) => {
    socket.join(roomId);
    console.log(`👤 ${socket.id} joined room ${roomId} as ${role}`);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, role });

    const hasMaster = rooms[roomId].some(u => u.role === 'master');
    const hasPlayer = rooms[roomId].some(u => u.role === 'player');

    if (hasMaster && hasPlayer) {
      io.to(roomId).emit('ready');
    }
  });

  socket.on('offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('offer', offer);
  });

  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', answer);
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
