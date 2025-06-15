io.on("connection", (socket) => {
  console.log("👤 เชื่อมต่อ:", socket.id);
  connectedUsers[socket.id] = { id: socket.id, username: null, room: null, role: null }; // เก็บข้อมูลผู้ใช้
  io.emit("userCount", Object.keys(connectedUsers).length); // อัปเดตจำนวนผู้ใช้ทั้งหมด

  // เมื่อ Client ขอสถานะห้องทั้งหมด (เมื่อเข้า Lobby)
  socket.on('requestRoomStatus', () => {
    // ส่งสถานะของทุกห้องกลับไปให้ Client นี้
    for (const roomNum in rooms) {
      if (rooms.hasOwnProperty(roomNum)) {
        const roomData = rooms[roomNum];
        socket.emit("roomStatusUpdate", {
          room: parseInt(roomNum),
          player: roomData.playerName || null,
          master: roomData.masterName || null,
          readyToStart: roomData.player && roomData.master && roomData.playerReady && roomData.masterReady,
          playerReady: roomData.playerReady || false,
          masterReady: roomData.masterReady || false
        });
      }
    }
  });

  // Listener ใหม่: Client ขอตรวจสอบสถานะห้องที่เคยอยู่
  socket.on('checkMyRoomStatus', ({ room, role }) => {
      // ตรวจสอบว่า socket นี้ยังอยู่ในห้องนั้นจริงหรือไม่ตามที่ server รู้
      if (rooms[room] && 
          ((role === 'player' && rooms[room].player === socket.id) || 
           (role === 'master' && rooms[room].master === socket.id))) {
          // ถ้า Server ยืนยันว่าอยู่ในห้องนั้นจริง
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
          // ถ้า Server ไม่พบว่าอยู่ในห้องนั้นแล้ว
          socket.emit('myRoomStatusResponse', { inRoom: false });
      }
  });


  // Event สำหรับตรวจสอบชื่อผู้ใช้
  socket.on("checkUsername", (username) => {
    // ตรวจสอบว่าชื่อนี้มีผู้ใช้อื่นใช้อยู่แล้วหรือไม่
    const isUsernameTaken = Object.values(connectedUsers).some(user => user.username === username && user.id !== socket.id); // ตรวจสอบ ID ด้วย
    if (isUsernameTaken) {
      socket.emit("username-status", false); // ไม่ว่าง
    } else {
      connectedUsers[socket.id].username = username; // กำหนดชื่อผู้ใช้ให้กับ socket นี้
      socket.username = username; // เก็บไว้ใน socket object ด้วย
      socket.emit("username-status", true); // ว่าง
      console.log(`Username set for ${socket.id}: ${username}`);
    }
  });

  socket.on("joinRoom", ({ room, role, name }) => {
    // ตรวจสอบว่าผู้ใช้มี username แล้วหรือยัง
    if (!name) {
      return socket.emit("roomError", "กรุณาใส่ชื่อผู้ใช้งานก่อนเข้าร่วมห้อง!");
    }
    // ตรวจสอบว่าผู้ใช้นี้ได้เข้าร่วมห้องอื่นไปแล้วหรือไม่ (กันการกดซ้ำหรือกดหลายห้อง)
    if (connectedUsers[socket.id].room) {
        return socket.emit("roomError", "คุณได้เข้าร่วมห้องอื่นไปแล้ว!");
    }

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

    // ตรวจสอบว่าบทบาทนั้นมีคนจองแล้วหรือยัง
    if (role === "player") {
      if (rooms[room].player) {
        return socket.emit("roomError", "ฝั่ง Player มีคนแล้วในห้องนี้!");
      }
      rooms[room].player = socket.id;
      rooms[room].playerName = name;
      rooms[room].playerReady = false; // รีเซ็ตสถานะพร้อมเมื่อมีคนเข้าใหม่
    } else if (role === "master") {
      if (rooms[room].master) {
        return socket.emit("roomError", "ฝั่ง Master มีคนแล้วในห้องนี้!");
      }
      rooms[room].master = socket.id;
      rooms[room].masterName = name;
      rooms[room].masterReady = false; // รีเซ็ตสถานะพร้อมเมื่อมีคนเข้าใหม่
    } else {
        return socket.emit("roomError", "บทบาทไม่ถูกต้อง!");
    }

    socket.join(room); // ทำให้ socket เข้าร่วมห้อง
    socket.room = room; // เก็บข้อมูลห้องไว้ที่ socket object
    socket.role = role; // เก็บข้อมูลบทบาทไว้ที่ socket object
    socket.username = name; // เก็บชื่อผู้ใช้ไว้ที่ socket object

    connectedUsers[socket.id].room = room; // อัปเดตข้อมูลผู้ใช้
    connectedUsers[socket.id].role = role;
    connectedUsers[socket.id].username = name; // อาจจะซ้ำ แต่เพื่อให้แน่ใจว่า username ใน connectedUsers ถูกเซ็ต

    console.log(`${name} (${role}) เข้าร่วม Room ${room}`);

    // ส่งสถานะห้องล่าสุดไปให้ทุกคนในห้องนั้นและ Lobby
    io.to(room).emit("roomStatusUpdate", {
      room: room,
      player: rooms[room].playerName || null,
      master: rooms[room].masterName || null,
      readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
      playerReady: rooms[room].playerReady,
      masterReady: rooms[room].masterReady
    });
    // ส่งให้ Lobby ด้วย (io.emit ส่งให้ทุก socket ที่เชื่อมต่อ)
    io.emit("roomStatusUpdate", {
        room: room,
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
        playerReady: rooms[room].playerReady,
        masterReady: rooms[room].masterReady
    });
  });

  // Event เมื่อผู้เล่นกดยืนยัน "พร้อม"
  socket.on("playerReady", ({ room, role }) => {
    // ตรวจสอบว่าผู้ใช้ที่ส่งมานั้นอยู่ในห้องนั้นและบทบาทนั้นจริงหรือไม่
    if (!rooms[room] || (role === 'player' && rooms[room].player !== socket.id) || (role === 'master' && rooms[room].master !== socket.id)) {
      console.log(`Error: ${socket.id} (Role: ${role}) พยายามกดยืนยันในห้อง ${room} แต่ไม่ใช่คนในห้อง`);
      return socket.emit("roomError", "ไม่สามารถกดยืนยันได้!");
    }

    if (role === "player") {
      rooms[room].playerReady = true;
      console.log(`${socket.username} (Player) ใน Room ${room} พร้อมแล้ว.`);
    } else if (role === "master") {
      rooms[room].masterReady = true;
      console.log(`${socket.username} (Master) ใน Room ${room} พร้อมแล้ว.`);
    }

    // ส่งสถานะห้องอัปเดตไปให้ทุกคนในห้องนั้นและ Lobby
    io.to(room).emit("roomStatusUpdate", {
      room: room,
      player: rooms[room].playerName || null,
      master: rooms[room].masterName || null,
      readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
      playerReady: rooms[room].playerReady,
      masterReady: rooms[room].masterReady
    });
    // ส่งให้ Lobby ด้วย
    io.emit("roomStatusUpdate", {
        room: room,
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
        playerReady: rooms[room].playerReady,
        masterReady: rooms[room].masterReady
    });

    // ถ้าทั้ง Player และ Master พร้อมแล้ว ให้ส่งสัญญาณไปให้ทั้งคู่เปลี่ยนหน้า
    if (rooms[room].playerReady && rooms[room].masterReady && rooms[room].player && rooms[room].master) {
      console.log(`ทั้ง Player และ Master ใน Room ${room} พร้อมแล้ว! เริ่มเกม...`);
      rooms[room].gameStarted = true; // ตั้งค่าสถานะว่าเกมเริ่มแล้ว

      // ส่งสัญญาณให้ Player ไปที่หน้า player_game.html พร้อม Room และ Role
      io.to(rooms[room].player).emit("redirect", `/player_game.html?room=${room}&role=player`);
      // ส่งสัญญาณให้ Master ไปที่หน้า master_control.html พร้อม Room และ Role
      io.to(rooms[room].master).emit("redirect", `/master_control.html?room=${room}&role=master`);
    }
  });


  // Chat Message
  socket.on("chatMessage", ({ room, text, user }) => {
    // ถ้าไม่ได้อยู่ในห้อง หรือ room เป็น null, ให้ส่งข้อความออกไปทั้งหมด (เหมือนแชทรวม)
    if (!room) {
        io.emit("chatMessage", { user: user, text: text });
    } else {
        // ส่งข้อความกลับไปหาทุกคนในห้องนั้น รวมถึงตัวผู้ส่งด้วย
        io.to(room).emit("chatMessage", { user: user, text: text });
    }
  });


  // WebRTC Signaling (สำหรับ Video/Audio Call)
  socket.on('signal', (data) => {
    // ส่งสัญญาณ WebRTC ไปยังคู่ที่อยู่ในห้องเดียวกัน
    if (socket.room && rooms[socket.room]) {
      const roomInfo = rooms[socket.room];
      const partnerSocketId = (socket.id === roomInfo.player) ? roomInfo.master : roomInfo.player;
      
      if (partnerSocketId) {
        // ตรวจสอบว่าคู่ยังเชื่อมต่ออยู่หรือไม่
        if (io.sockets.sockets.get(partnerSocketId)) { // ใช้ io.sockets.sockets.get() ใน Socket.IO v3+
            console.log(`ส่งสัญญาณจาก ${socket.username} (${socket.role}) ไปยังคู่ในห้อง ${socket.room}`);
            io.to(partnerSocketId).emit('signal', data);
        } else {
            console.log(`Partner ${partnerSocketId} in room ${socket.room} is not connected. Cannot send signal.`);
            // ควรจะแจ้งผู้ส่งว่าคู่หลุด
            // socket.emit('partnerDisconnected', 'คู่ของคุณหลุดการเชื่อมต่อไปแล้ว!');
        }
      } else {
          console.log(`Cannot find partner for ${socket.id} in room ${socket.room}.`);
      }
    }
  });

  // Event เมื่อ Client ตัดการเชื่อมต่อ
  socket.on("disconnect", () => {
    console.log("❌ ตัดการเชื่อมต่อ:", socket.id);
    const disconnectedUsername = connectedUsers[socket.id] ? connectedUsers[socket.id].username : 'Unknown User';
    const disconnectedRoom = connectedUsers[socket.id] ? connectedUsers[socket.id].room : null;

    delete connectedUsers[socket.id]; // ลบผู้ใช้ออกจากรายการ
    io.emit("userCount", Object.keys(connectedUsers).length); // อัปเดตจำนวนผู้ใช้ทั้งหมด

    // ตรวจสอบว่าผู้ใช้ที่หลุดไปอยู่ในห้องเกมหรือไม่
    if (disconnectedRoom && rooms[disconnectedRoom]) {
      let partnerSocketId = null;
      let disconnectedRole = null;
      let partnerRole = null;

      if (socket.id === rooms[disconnectedRoom].player) {
        partnerSocketId = rooms[disconnectedRoom].master;
        disconnectedRole = "Player";
        partnerRole = "Master";
        delete rooms[disconnectedRoom].player;
        delete rooms[disconnectedRoom].playerName;
        rooms[disconnectedRoom].playerReady = false; // รีเซ็ตสถานะพร้อม
        rooms[disconnectedRoom].gameStarted = false; // รีเซ็ตสถานะเกมเริ่ม
      } else if (socket.id === rooms[disconnectedRoom].master) {
        partnerSocketId = rooms[disconnectedRoom].player;
        disconnectedRole = "Master";
        partnerRole = "Player";
        delete rooms[disconnectedRoom].master;
        delete rooms[disconnectedRoom].masterName;
        rooms[disconnectedRoom].masterReady = false; // รีเซ็ตสถานะพร้อม
        rooms[disconnectedRoom].gameStarted = false; // รีเซ็ตสถานะเกมเริ่ม
      }

      // ถ้ามีคู่ที่เหลืออยู่ ให้แจ้งเตือนคู่และพาคู่กลับ Lobby
      if (partnerSocketId && io.sockets.sockets.get(partnerSocketId)) { // ตรวจสอบว่าคู่ยังเชื่อมต่ออยู่จริง
        console.log(`แจ้งเตือน ${partnerRole} (${partnerSocketId}) ในห้อง ${disconnectedRoom} ว่า ${disconnectedRole} (${disconnectedUsername}) ออกจากห้อง`);
        io.to(partnerSocketId).emit("partnerDisconnected", `${disconnectedRole} ของคุณ (${disconnectedUsername}) ออกจากห้องแล้ว!`);
        io.to(partnerSocketId).emit("redirect", "/lobby.html");
      }

      // ถ้าห้องว่างเปล่า ให้ลบห้องนั้น
      if (!rooms[disconnectedRoom].player && !rooms[disconnectedRoom].master) {
        delete rooms[disconnectedRoom];
        console.log(`Room ${disconnectedRoom} ว่างเปล่าและถูกลบแล้ว.`);
      } else {
        // ถ้าห้องยังไม่ว่างเปล่า (เช่น มีผู้เล่นคนเดียวอยู่) ให้อัปเดตสถานะห้องนั้น
        console.log(`อัปเดตสถานะ Room ${disconnectedRoom} หลังจากการตัดการเชื่อมต่อ`);
        io.to(disconnectedRoom).emit("roomStatusUpdate", {
          room: disconnectedRoom,
          player: rooms[disconnectedRoom].playerName || null,
          master: rooms[disconnectedRoom].masterName || null,
          readyToStart: rooms[disconnectedRoom].player && rooms[disconnectedRoom].master && rooms[disconnectedRoom].playerReady && rooms[disconnectedRoom].masterReady,
          playerReady: rooms[disconnectedRoom].playerReady,
          masterReady: rooms[disconnectedRoom].masterReady
        });
      }
      // ส่งสถานะห้องอัปเดตไปยัง Lobby ด้วย (เพื่อให้เห็นว่าห้องนั้นว่างลง)
      io.emit("roomStatusUpdate", {
          room: disconnectedRoom,
          player: rooms[disconnectedRoom].playerName || null,
          master: rooms[disconnectedRoom].masterName || null,
          readyToStart: rooms[disconnectedRoom].player && rooms[disconnectedRoom].master && rooms[disconnectedRoom].playerReady && rooms[disconnectedRoom].masterReady,
          playerReady: rooms[disconnectedRoom].playerReady,
          masterReady: rooms[disconnectedRoom].masterReady
      });
    }
  });
});
