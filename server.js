// Import necessary modules
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/lobby.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});

app.get('/master_control.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'master_control.html'));
});

app.get('/player_game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player_game.html'));
});

const connectedUsers = {};
const rooms = {};

function handleRoomLeave(socketId) {
    const user = connectedUsers[socketId];
    if (!user || !user.room) return;

    const roomToLeave = user.room;
    const leavingRole = user.role;
    const leavingUsername = user.username;
    let partnerSocketId = null;

    connectedUsers[socketId].room = null;
    connectedUsers[socketId].role = null;

    if (!rooms[roomToLeave]) return;

    if (rooms[roomToLeave].player === socketId) {
        partnerSocketId = rooms[roomToLeave].master;
        delete rooms[roomToLeave].player;
        delete rooms[roomToLeave].playerName;
        rooms[roomToLeave].playerReady = false;
        rooms[roomToLeave].gameStarted = false;
    } else if (rooms[roomToLeave].master === socketId) {
        partnerSocketId = rooms[roomToLeave].player;
        delete rooms[roomToLeave].master;
        delete rooms[roomToLeave].masterName;
        rooms[roomToLeave].masterReady = false;
        rooms[roomToLeave].gameStarted = false;
    }

    if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
        io.to(partnerSocketId).emit("partnerDisconnected", `${leavingRole} ของคุณ (${leavingUsername}) ออกจากห้องแล้ว!`);
        io.to(partnerSocketId).emit("redirect", "/lobby.html");
    }

    if (!rooms[roomToLeave].player && !rooms[roomToLeave].master) {
        delete rooms[roomToLeave];
    } else {
        io.to(roomToLeave).emit("roomStatusUpdate", {
            room: roomToLeave,
            player: rooms[roomToLeave].playerName || null,
            master: rooms[roomToLeave].masterName || null,
            readyToStart: rooms[roomToLeave].player && rooms[roomToLeave].master && rooms[roomToLeave].playerReady && rooms[roomToLeave].masterReady,
            playerReady: rooms[roomToLeave].playerReady,
            masterReady: rooms[roomToLeave].masterReady
        });
    }

    io.emit("roomStatusUpdate", {
        room: roomToLeave,
        player: rooms[roomToLeave]?.playerName || null,
        master: rooms[roomToLeave]?.masterName || null,
        readyToStart: rooms[roomToLeave]?.player && rooms[roomToLeave]?.master && rooms[roomToLeave]?.playerReady && rooms[roomToLeave]?.masterReady,
        playerReady: rooms[roomToLeave]?.playerReady || false,
        masterReady: rooms[roomToLeave]?.masterReady || false
    });
}

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);
    connectedUsers[socket.id] = { id: socket.id, username: null, room: null, role: null };
    io.emit("userCount", Object.keys(connectedUsers).length);

    socket.on("joinRoom", ({ room, role, name }) => {
        if (!name) return socket.emit("roomError", "กรุณาใส่ชื่อผู้ใช้งานก่อนเข้าร่วมห้อง!");
        if (connectedUsers[socket.id].room) return socket.emit("roomError", "คุณได้เข้าร่วมห้องอื่นไปแล้ว!");

        if (!rooms[room]) {
            rooms[room] = {
                player: null,
                playerName: null,
                playerReady: false,
                master: null,
                masterName: null,
                masterReady: false,
                gameStarted: false
            };
        }

        if (role === "player") {
            if (rooms[room].player) return socket.emit("roomError", "ฝั่ง Player มีคนแล้วในห้องนี้!");
            rooms[room].player = socket.id;
            rooms[room].playerName = name;
        } else if (role === "master") {
            if (rooms[room].master) return socket.emit("roomError", "ฝั่ง Master มีคนแล้วในห้องนี้!");
            rooms[room].master = socket.id;
            rooms[room].masterName = name;
        } else {
            return socket.emit("roomError", "บทบาทไม่ถูกต้อง!");
        }

        socket.join(room);
        socket.room = room;
        socket.role = role;
        socket.username = name;

        connectedUsers[socket.id].room = room;
        connectedUsers[socket.id].role = role;
        connectedUsers[socket.id].username = name;

        io.to(room).emit("roomStatusUpdate", {
            room,
            player: rooms[room].playerName || null,
            master: rooms[room].masterName || null,
            readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
            playerReady: rooms[room].playerReady,
            masterReady: rooms[room].masterReady
        });

        io.emit("roomStatusUpdate", {
            room,
            player: rooms[room].playerName || null,
            master: rooms[room].masterName || null,
            readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
            playerReady: rooms[room].playerReady,
            masterReady: rooms[room].masterReady
        });
    });

    socket.on("playerReady", ({ room, role }) => {
        if (!rooms[room]) return;

        if (role === "player") rooms[room].playerReady = true;
        else if (role === "master") rooms[room].masterReady = true;

        io.to(room).emit("roomStatusUpdate", {
            room,
            player: rooms[room].playerName || null,
            master: rooms[room].masterName || null,
            readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
            playerReady: rooms[room].playerReady,
            masterReady: rooms[room].masterReady
        });

        io.emit("roomStatusUpdate", {
            room,
            player: rooms[room].playerName || null,
            master: rooms[room].masterName || null,
            readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
            playerReady: rooms[room].playerReady,
            masterReady: rooms[room].masterReady
        });

        if (rooms[room].playerReady && rooms[room].masterReady && rooms[room].player && rooms[room].master) {
            rooms[room].gameStarted = true;
            io.to(rooms[room].player).emit("redirect", `/player_game.html?room=${room}&role=player`);
            io.to(rooms[room].master).emit("redirect", `/master_control.html?room=${room}&role=master`);
            io.to(rooms[room].player).emit("startWebRTC", { room, role: "player" });
            io.to(rooms[room].master).emit("startWebRTC", { room, role: "master" });
        }
    });

    socket.on('signal', (data) => {
        if (socket.room && rooms[socket.room]) {
            const partnerSocketId = (socket.id === rooms[socket.room].player) ? rooms[socket.room].master : rooms[socket.room].player;
            if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
                io.to(partnerSocketId).emit('signal', data);
            }
        }
    });

    socket.on('masterCommand', ({ room, type, message, bpm }) => {
        if (rooms[room] && rooms[room].player) {
            io.to(rooms[room].player).emit('masterCommand', { type, message, bpm });
        }
    });

    socket.on('playerCommand', ({ room, type, message }) => {
        if (rooms[room] && rooms[room].master) {
            io.to(rooms[room].master).emit('playerCommand', { type, message });
        }
    });

    socket.on('playerArousalUpdate', (arousalLevel) => {
        if (socket.room && rooms[socket.room] && rooms[socket.room].master) {
            io.to(rooms[socket.room].master).emit('playerArousalUpdate', arousalLevel);
        }
    });

    socket.on('leaveRoom', () => {
        if (socket.room) {
            socket.leave(socket.room);
        }
        handleRoomLeave(socket.id);
        socket.room = null;
        socket.role = null;
    });

    socket.on("disconnect", () => {
        handleRoomLeave(socket.id);
        delete connectedUsers[socket.id];
        io.emit("userCount", Object.keys(connectedUsers).length);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
