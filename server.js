// Import necessary modules
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path'); // To serve static files

// Initialize Express app
const app = express();
// Create an HTTP server using the Express app
const server = http.createServer(app);
// Initialize Socket.IO server by passing the HTTP server instance
const io = new Server(server);

// Define the port the server will listen on
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
// This means all your HTML, CSS, client-side JS, and sound files should be in a folder named 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Define routes for your HTML pages
// When a client requests the root URL '/', send the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for the lobby page
app.get('/lobby.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});

// Route for the master control page
app.get('/master_control.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'master_control.html'));
});

// Route for the player game page
app.get('/player_game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player_game.html'));
});

// --- Socket.IO Server Logic ---
// Global objects to keep track of connected users and active rooms
const connectedUsers = {}; // Stores { socket.id: { id, username, room, role } }
const rooms = {};           // Stores { roomNumber: { player, playerName, playerReady, master, masterName, masterReady, gameStarted } }

// Helper function to handle room cleanup and partner notification
function handleRoomLeave(socketId) {
    const user = connectedUsers[socketId];
    if (!user || !user.room) {
        console.warn(`[handleRoomLeave] User ${socketId} not found or not in a room.`);
        return; // User not found or not in a room, nothing to clean up
    }

    const roomToLeave = user.room;
    const leavingRole = user.role;
    const leavingUsername = user.username;
    let partnerSocketId = null;

    // Clear the user's room and role info in connectedUsers immediately
    connectedUsers[socketId].room = null;
    connectedUsers[socketId].role = null;

    // Check if the room exists before attempting to modify it
    if (!rooms[roomToLeave]) {
        console.warn(`[handleRoomLeave] Attempted to clean up non-existent room: ${roomToLeave} for user ${leavingUsername}.`);
        return;
    }

    // Determine the leaving user's role and their partner's socket ID
    // Then clear the leaving user's info from the room
    if (rooms[roomToLeave].player === socketId) {
        partnerSocketId = rooms[roomToLeave].master;
        delete rooms[roomToLeave].player; // Remove player from room
        delete rooms[roomToLeave].playerName;
        rooms[roomToLeave].playerReady = false; // Reset ready status for this slot
        rooms[roomToLeave].gameStarted = false; // Game ends if one partner leaves
    } else if (rooms[roomToLeave].master === socketId) {
        partnerSocketId = rooms[roomToLeave].player;
        delete rooms[roomToLeave].master; // Remove master from room
        delete rooms[roomToLeave].masterName;
        rooms[roomToLeave].masterReady = false; // Reset ready status for this slot
        rooms[roomToLeave].gameStarted = false; // Game ends if one partner leaves
    } else {
        console.warn(`[handleRoomLeave] User ${leavingUsername} (${socketId}) claims to be in room ${roomToLeave} but their role (${leavingRole}) doesn't match a valid slot. Attempting fallback cleanup.`);
        // Fallback for inconsistent state: try to remove them from any slot they might be in
        if (rooms[roomToLeave].player === socketId) {
            delete rooms[roomToLeave].player;
            delete rooms[roomToLeave].playerName;
            rooms[roomToLeave].playerReady = false;
            rooms[roomToLeave].gameStarted = false;
        }
        if (rooms[roomToLeave].master === socketId) {
            delete rooms[roomToLeave].master;
            delete rooms[roomToLeave].masterName;
            rooms[roomToLeave].masterReady = false;
            rooms[roomToLeave].gameStarted = false;
        }
    }

    console.log(`[handleRoomLeave] ${leavingUsername} (${leavingRole}) กำลังออกจากห้อง ${roomToLeave}.`);

    // Notify partner if they exist and are still connected
    if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
        console.log(`[handleRoomLeave] แจ้งเตือนคู่ ${partnerSocketId} ในห้อง ${roomToLeave} ว่า ${leavingUsername} (${leavingRole}) ออกจากห้อง`);
        io.to(partnerSocketId).emit("partnerDisconnected", `${leavingRole} ของคุณ (${leavingUsername}) ออกจากห้องแล้ว!`);
        io.to(partnerSocketId).emit("redirect", "/lobby.html"); // Redirect partner back to lobby
    }

    // Clean up the room if it's now empty
    if (!rooms[roomToLeave].player && !rooms[roomToLeave].master) {
        delete rooms[roomToLeave];
        console.log(`[handleRoomLeave] ห้อง ${roomToLeave} ว่างเปล่าและถูกลบแล้ว.`);
    } else {
        // If the room is not empty, update its status for remaining player(s) and for the lobby view
        io.to(roomToLeave).emit("roomStatusUpdate", {
            room: roomToLeave,
            player: rooms[roomToLeave].playerName || null,
            master: rooms[roomToLeave].masterName || null,
            readyToStart: rooms[roomToLeave].player && rooms[roomToLeave].master && rooms[roomToLeave].playerReady && rooms[roomToLeave].masterReady,
            playerReady: rooms[roomToLeave].playerReady,
            masterReady: rooms[roomToLeave].masterReady
        });
    }

    // Always update the lobby view (for all connected clients) to reflect changes in room status
    // Use optional chaining for `rooms[roomToLeave]` as it might have been deleted
    io.emit("roomStatusUpdate", {
        room: roomToLeave,
        player: rooms[roomToLeave]?.playerName || null,
        master: rooms[roomToLeave]?.masterName || null,
        readyToStart: rooms[roomToLeave] ? (rooms[roomToLeave].player && rooms[roomToLeave].master && rooms[roomToLeave].playerReady && rooms[roomToLeave].masterReady) : false,
        playerReady: rooms[roomToLeave]?.playerReady || false,
        masterReady: rooms[roomToLeave]?.masterReady || false
    });
}


// Event listener for new Socket.IO connections
io.on("connection", (socket) => {
  console.log("👤 ผู้ใช้เชื่อมต่อ:", socket.id);
  // Store initial user data
  connectedUsers[socket.id] = { id: socket.id, username: null, room: null, role: null };
  // Emit the updated total user count to all connected clients
  io.emit("userCount", Object.keys(connectedUsers).length);

  // Event: Client requests status of all rooms (typically on entering Lobby)
  socket.on('requestRoomStatus', () => {
    // Iterate through all existing rooms and send their status to the requesting client
    for (const roomNum in rooms) {
      if (rooms.hasOwnProperty(roomNum)) {
        const roomData = rooms[roomNum];
        socket.emit("roomStatusUpdate", {
          room: parseInt(roomNum), // Ensure room number is an integer
          player: roomData.playerName || null,
          master: roomData.masterName || null,
          // Determine if the room is ready to start (both roles filled and both ready)
          readyToStart: roomData.player && roomData.master && roomData.playerReady && roomData.masterReady,
          playerReady: roomData.playerReady || false,
          masterReady: roomData.masterReady || false
        });
      }
    }
  });

  // Event: Client requests to check status of a room they might have been in (e.g., after a refresh)
  socket.on('checkMyRoomStatus', ({ room, role }) => {
      // Verify if the current socket is indeed associated with the given room and role on the server
      if (rooms[room] &&
          ((role === 'player' && rooms[room].player === socket.id) ||
           (role === 'master' && rooms[room].master === socket.id))) {
          // If server confirms the user is in the room, send back confirmation and room data
          socket.emit('myRoomStatusResponse', {
              inRoom: true,
              room: room,
              role: role,
              roomData: {
                  player: rooms[room].playerName || null,
                  master: rooms[room].masterName || null,
                  playerReady: rooms[room].playerReady || false,
                  masterReady: rooms[room].masterReady || false
              }
          });
      } else {
          // If server does not find the user in that room, send back negative confirmation
          socket.emit('myRoomStatusResponse', { inRoom: false });
      }
  });

  // Event: Client requests to check if a username is available
  socket.on("checkUsername", (username) => {
    // Check if any other connected user (excluding the current socket) is using this username
    const isUsernameTaken = Object.values(connectedUsers).some(user => user.username === username && user.id !== socket.id);
    if (isUsernameTaken) {
      socket.emit("username-status", false); // Username is taken
    } else {
      // Assign the username to the current socket and connectedUsers object
      connectedUsers[socket.id].username = username;
      socket.username = username; // Also store directly on the socket object for convenience
      socket.emit("username-status", true); // Username is available
      console.log(`ชื่อผู้ใช้ตั้งค่าสำหรับ ${socket.id}: ${username}`);
    }
  });

  // Event: Client attempts to join a room
  socket.on("joinRoom", ({ room, role, name }) => {
    // Basic validation: ensure username is provided
    if (!name) {
      return socket.emit("roomError", "กรุณาใส่ชื่อผู้ใช้งานก่อนเข้าร่วมห้อง!");
    }
    // Prevent joining if already in another room
    if (connectedUsers[socket.id].room) {
        return socket.emit("roomError", "คุณได้เข้าร่วมห้องอื่นไปแล้ว!");
    }

    // Initialize room data if it doesn't exist
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

    // Assign socket to player or master role in the room
    if (role === "player") {
      if (rooms[room].player) {
        return socket.emit("roomError", "ฝั่ง Player มีคนแล้วในห้องนี้!");
      }
      rooms[room].player = socket.id;
      rooms[room].playerName = name;
      rooms[room].playerReady = false; // Reset ready status on new join
    } else if (role === "master") {
      if (rooms[room].master) {
        return socket.emit("roomError", "ฝั่ง Master มีคนแล้วในห้องนี้!");
      }
      rooms[room].master = socket.id;
      rooms[room].masterName = name;
      rooms[room].masterReady = false; // Reset ready status on new join
    } else {
        return socket.emit("roomError", "บทบาทไม่ถูกต้อง!"); // Invalid role provided
    }

    // Make the socket join the Socket.IO room (group)
    socket.join(room);
    // Store room and role on the socket object for easy access
    socket.room = room;
    socket.role = role;
    socket.username = name; // Ensure username is stored on socket as well

    // Update connectedUsers global object
    connectedUsers[socket.id].room = room;
    connectedUsers[socket.id].role = role;
    connectedUsers[socket.id].username = name;

    console.log(`${name} (${role}) เข้าร่วม Room ${room}`);

    // Emit updated room status to everyone in the joined room
    io.to(room).emit("roomStatusUpdate", {
      room: room,
      player: rooms[room].playerName || null,
      master: rooms[room].masterName || null,
      readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
      playerReady: rooms[room].playerReady,
      masterReady: rooms[room].masterReady
    });
    // Also emit to all clients (Lobby view)
    io.emit("roomStatusUpdate", {
        room: room,
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
        playerReady: rooms[room].playerReady,
        masterReady: rooms[room].masterReady
    });
  });

  // Event: User clicks "Ready" button
  socket.on("playerReady", ({ room, role }) => {
    // Validate if the user is indeed in the specified room and role
    if (!rooms[room] || (role === 'player' && rooms[room].player !== socket.id) || (role === 'master' && rooms[room].master !== socket.id)) {
      console.log(`ข้อผิดพลาด: ${socket.id} (บทบาท: ${role}) พยายามกดยืนยันในห้อง ${room} แต่ไม่ใช่คนในห้อง`);
      return socket.emit("roomError", "ไม่สามารถกดยืนยันได้!");
    }

    // Set ready status based on role
    if (role === "player") {
      rooms[room].playerReady = true;
      console.log(`${socket.username} (Player) ใน Room ${room} พร้อมแล้ว.`);
    } else if (role === "master") {
      rooms[room].masterReady = true;
      console.log(`${socket.username} (Master) ใน Room ${room} พร้อมแล้ว.`);
    }

    // Broadcast updated room status to all in the room and to the lobby
    io.to(room).emit("roomStatusUpdate", {
      room: room,
      player: rooms[room].playerName || null,
      master: rooms[room].masterName || null,
      readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
      playerReady: rooms[room].playerReady,
      masterReady: rooms[room].masterReady
    });
    io.emit("roomStatusUpdate", {
        room: room,
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
        playerReady: rooms[room].playerReady,
        masterReady: rooms[room].masterReady
    });

    // If both Player and Master are ready and present in the room, start the game
    if (rooms[room].playerReady && rooms[room].masterReady && rooms[room].player && rooms[room].master) {
      console.log(`ทั้ง Player และ Master ใน Room ${room} พร้อมแล้ว! เริ่มเกม...`);
      rooms[room].gameStarted = true; // Mark game as started

      // Redirect Player to player_game.html
      io.to(rooms[room].player).emit("redirect", `/player_game.html?room=${room}&role=player`);
      // Redirect Master to master_control.html
      io.to(rooms[room].master).emit("redirect", `/master_control.html?room=${room}&role=master`);

      // ✅ Start WebRTC for both sides
      io.to(rooms[room].player).emit("startWebRTC", { room, role: "player" });
      io.to(rooms[room].master).emit("startWebRTC", { room, role: "master" });

      // Emit 'paired' event to trigger WebRTC setup on client side
      io.to(rooms[room].player).emit('paired', { room, role: 'player' });
      io.to(rooms[room].master).emit('paired', { room, role: 'master' });
    }
  });

  // Event: Chat message received
  socket.on("chatMessage", ({ room, text, user }) => {
    // If room is null, it's a global chat message, send to all
    if (!room) {
        io.emit("chatMessage", { user: user, text: text });
    } else {
        // Otherwise, send only to clients in that specific room
        io.to(room).emit("chatMessage", { user: user, text: text });
    }
  });

  // Event: WebRTC Signaling data received (for video/audio calls)
  socket.on('signal', (data) => {
    // Forward the WebRTC signal to the partner in the same room
    if (socket.room && rooms[socket.room]) {
      const roomInfo = rooms[socket.room];
      // Determine partner's socket ID
      const partnerSocketId = (socket.id === roomInfo.player) ? roomInfo.master : roomInfo.player;

      if (partnerSocketId) {
        // Check if partner is still connected before sending
        if (io.sockets.sockets.get(partnerSocketId)) {
            console.log(`ส่งสัญญาณจาก ${socket.username} (${socket.role}) ไปยังคู่ในห้อง ${socket.room}`);
            io.to(partnerSocketId).emit('signal', data);
        } else {
            console.log(`คู่ (${partnerSocketId}) ในห้อง ${socket.room} ไม่ได้เชื่อมต่ออยู่ ไม่สามารถส่งสัญญาณได้.`);
        }
      } else {
          console.log(`ไม่พบคู่สำหรับ ${socket.id} ในห้อง ${socket.room}.`);
      }
    }
  });

  // Event: Master sends a game command to Player
  socket.on('masterCommand', ({ room, type, message, bpm }) => {
      // Ensure the room exists and there's a player to receive the command
      if (rooms[room] && rooms[room].player) {
          io.to(rooms[room].player).emit('masterCommand', { type, message, bpm });
          console.log(`Master (${socket.username}) ส่งคำสั่ง '${type}' ไปยัง Player ในห้อง ${room}`);
      }
  });

  // Event: Player sends a game command to Master
  socket.on('playerCommand', ({ room, type, message }) => {
      // Ensure the room exists and there's a master to receive the command
      if (rooms[room] && rooms[room].master) {
          io.to(rooms[room].master).emit('playerCommand', { type, message });
          console.log(`Player (${socket.username}) ส่งคำสั่ง '${type}' ไปยัง Master ในห้อง ${room}`);
      }
  });

  // Event: Player sends arousal level update to Master
  socket.on('playerArousalUpdate', (arousalLevel) => {
      // Ensure the user is in a room and there's a master to receive the update
      if (socket.room && rooms[socket.room] && rooms[socket.room].master) {
          io.to(rooms[socket.room].master).emit('playerArousalUpdate', arousalLevel);
          console.log(`Player (${socket.username}) ส่งการอัปเดตระดับความเงี่ยน: ${arousalLevel}`);
      }
  });

  // Event: Client explicitly leaves a room (e.g., clicks "Back to Lobby")
  socket.on('leaveRoom', () => {
    // Make the socket leave the Socket.IO room first
    if (socket.room) {
        console.log(`[leaveRoom] Socket ${socket.id} explicitly leaving Socket.IO room ${socket.room}.`);
        socket.leave(socket.room);
    }
    // Then call the centralized handler for room cleanup and notification
    handleRoomLeave(socket.id);
    // Clear local socket state (these are already cleared in handleRoomLeave's connectedUsers entry)
    socket.room = null; // Clear from socket object
    socket.role = null; // Clear from socket object
  });

  // Event: Socket disconnects from the server (e.g., closing browser, network issue)
  socket.on("disconnect", () => {
    console.log("❌ ผู้ใช้ตัดการเชื่อมต่อ:", socket.id);
    const disconnectedSocketId = socket.id;

    // Call the centralized handler for room cleanup and partner notification
    handleRoomLeave(disconnectedSocketId); // This will clear room/role in connectedUsers, and notify partner

    // Finally, remove the user from the global connectedUsers list
    // This must happen AFTER handleRoomLeave has processed the user's room info
    delete connectedUsers[disconnectedSocketId];
    // Update the total user count for all clients
    io.emit("userCount", Object.keys(connectedUsers).length);
  });
});

// Start the HTTP server listening on the specified port
server.listen(PORT, () => {
  console.log(`🚀 เซิร์ฟเวอร์กำลังทำงานบนพอร์ต ${PORT}`);
});
