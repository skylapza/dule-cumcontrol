// 📦 server.js - Signaling server for WebRTC and 1-on-1 room matching
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ Serve static files (e.g. player_game.html, script.js)
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {}; // Store 1-on-1 room users

io.on('connection', (socket) => {
  console.log(`📡 User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId }) => {
    socket.join(roomId);
    console.log(`👤 ${socket.id} joined room ${roomId}`);

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);

    // ถ้ามี 2 คนแล้ว ส่งสัญญาณเริ่มจับคู่ให้ทั้งคู่
    if (rooms[roomId].length === 2) {
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
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
