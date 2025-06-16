const connectedUsers = {}; // Stores { socket.id: { id, username, room, role } }
const rooms = {};           // Stores { roomNumber: { player, playerName, playerReady, master, masterName, masterReady, gameStarted } }Add commentMore actions

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
@@ -294,101 +376,35 @@
      }
  });

  // NEW Event: Client explicitly leaves a room (e.g., clicks "Back to Lobby")
  // Event: Client explicitly leaves a room (e.g., clicks "Back to Lobby")
  socket.on('leaveRoom', () => {
    const roomToLeave = socket.room; // Get the room the socket is currently in
    if (roomToLeave && rooms[roomToLeave]) {
      let leavingRole = null;
      let partnerSocketId = null;

      // Determine the leaving user's role and their partner's socket ID
      if (rooms[roomToLeave].player === socket.id) {
        leavingRole = "Player";
        partnerSocketId = rooms[roomToLeave].master;
        delete rooms[roomToLeave].player; // Remove player from room
        delete rooms[roomToLeave].playerName;
        rooms[roomToLeave].playerReady = false; // Reset player ready status
        rooms[roomToLeave].gameStarted = false; // Reset game started status for the room
      } else if (rooms[roomToLeave].master === socket.id) {
        leavingRole = "Master";
        partnerSocketId = rooms[roomToLeave].player;
        delete rooms[roomToLeave].master; // Remove master from room
        delete rooms[roomToLeave].masterName;
        rooms[roomToLeave].masterReady = false; // Reset master ready status
        rooms[roomToLeave].gameStarted = false; // Reset game started status for the room
      }

      console.log(`${socket.username} (${leavingRole}) กำลังออกจากห้อง ${roomToLeave}.`);

      // If a partner exists and is still connected, notify them and redirect to lobby
      if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) {
        io.to(partnerSocketId).emit("partnerDisconnected", `${leavingRole} ของคุณ (${socket.username}) ออกจากห้องแล้ว!`);
        io.to(partnerSocketId).emit("redirect", "/lobby.html"); // Redirect partner back to lobby
      }

      // Clear room and role information from the connectedUsers object and the socket itself
      if (connectedUsers[socket.id]) {
          connectedUsers[socket.id].room = null;
          connectedUsers[socket.id].role = null;
      }
      socket.leave(roomToLeave); // Make the socket leave the Socket.IO room
      socket.room = null; // Clear room data on socket
      socket.role = null; // Clear role data on socket

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
    const disconnectedUsername = connectedUsers[socket.id] ? connectedUsers[socket.id].username : 'Unknown User';
    const disconnectedRoom = connectedUsers[socket.id] ? connectedUsers[socket.id].room : null;

    // Trigger the 'leaveRoom' logic to handle partner notification and room cleanup
    // This centralizes the logic for both explicit leaves and unexpected disconnects
    if (disconnectedRoom && connectedUsers[socket.id]) {
        // Temporarily set socket.room and socket.role for the 'leaveRoom' handler
        // as these might have been cleared by previous client-side actions
        socket.room = disconnectedRoom;
        socket.role = connectedUsers[socket.id].role;
        socket.username = disconnectedUsername;
        socket.emit('leaveRoom'); // Call the leaveRoom logic
    }
    const disconnectedSocketId = socket.id; // Store ID before deletion

    // Handle room leave logic first using the helper function
    handleRoomLeave(disconnectedSocketId);

    // Finally, remove the user from the global connectedUsers list
    delete connectedUsers[socket.id];
    delete connectedUsers[disconnectedSocketId];
    // Update the total user count for all clients
    io.emit("userCount", Object.keys(connectedUsers).length);

    // The rest of the room cleanup and partner notification is now handled by 'leaveRoom'.
  });
});

// Start the HTTP server listening on the specified port
server.listen(PORT, () => {
  console.log(`🚀 เซิร์ฟเวอร์กำลังทำงานบนพอร์ต ${PORT}`);
});
