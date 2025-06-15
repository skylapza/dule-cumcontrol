const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

// โครงสร้างข้อมูลสำหรับเก็บสถานะของแต่ละห้อง
// rooms = {
//   'roomNumber': {
//     player: socket.id,
//     playerName: 'ชื่อ Player',
//     playerReady: false, // สถานะพร้อมของ Player
//     master: socket.id,
//     masterName: 'ชื่อ Master',
//     masterReady: false, // สถานะพร้อมของ Master
//     gameStarted: false, // สถานะว่าเกมได้เริ่มแล้วหรือไม่
//   }
// }
const rooms = {};
const connectedUsers = {}; // เพื่อเก็บจำนวนผู้ใช้ทั้งหมดที่เชื่อมต่อ

io.on("connection", (socket) => {
  console.log("👤 เชื่อมต่อ:", socket.id);
  connectedUsers[socket.id] = socket.id; // เพิ่มผู้ใช้เข้าในรายการเมื่อเชื่อมต่อ
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
          readyToStart: roomData.player && roomData.master && roomData.playerReady && roomData.masterReady, // เพิ่มเงื่อนไข ready
          playerReady: roomData.playerReady || false,
          masterReady: roomData.masterReady || false
        });
      }
    }
  });


  socket.on("joinRoom", ({ room, role, name }) => {
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
    // ต้องส่งให้ Lobby ด้วย เพื่อให้ทุกคนเห็นสถานะ
    io.emit("roomStatusUpdate", {
        room: room,
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
        playerReady: rooms[room].roomPlayerReady,
        masterReady: rooms[room].roomMasterReady
    });
  });

  // Event เมื่อผู้เล่นกดยืนยัน "พร้อม"
  socket.on("playerReady", ({ room, role }) => {
    if (!rooms[room] || !rooms[room][role] || rooms[room][role] !== socket.id) {
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
    // ต้องส่งให้ Lobby ด้วย
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

      // ส่งสัญญาณให้ Player ไปที่หน้า player_game.html
      io.to(rooms[room].player).emit("redirect", `/player_game.html?room=${room}`);
      // ส่งสัญญาณให้ Master ไปที่หน้า master_control.html
      io.to(rooms[room].master).emit("redirect", `/master_control.html?room=${room}`);

      // เมื่อเกมเริ่มแล้ว อาจจะล้างสถานะ ready เพื่อให้คนอื่นไม่สามารถเข้าร่วมได้อีก
      // หรืออาจจะต้องมี Logic ล้างห้องเมื่อเกมจบ
    }
  });


  // Chat Message
  socket.on("chatMessage", ({ room, text, user }) => {
    // ส่งข้อความกลับไปหาทุกคนในห้องนั้น รวมถึงตัวผู้ส่งด้วย
    io.to(room).emit("chatMessage", { user: user, text: text });
  });


  // WebRTC Signaling (สำหรับ Video/Audio Call)
  socket.on('signal', (data) => {
    // ส่งสัญญาณ WebRTC ไปยังคู่ที่อยู่ในห้องเดียวกัน
    if (socket.room && rooms[socket.room]) {
      const roomInfo = rooms[socket.room];
      const partnerSocketId = (socket.id === roomInfo.player) ? roomInfo.master : roomInfo.player;
      if (partnerSocketId) {
        console.log(`ส่งสัญญาณจาก ${socket.id} ไปยัง ${partnerSocketId} ในห้อง ${socket.room}`);
        io.to(partnerSocketId).emit('signal', data);
      }
    }
  });

  // Event เมื่อ Client ตัดการเชื่อมต่อ
  socket.on("disconnect", () => {
    console.log("❌ ตัดการเชื่อมต่อ:", socket.id);
    delete connectedUsers[socket.id]; // ลบผู้ใช้ออกจากรายการ
    io.emit("userCount", Object.keys(connectedUsers).length); // อัปเดตจำนวนผู้ใช้ทั้งหมด

    const room = socket.room;
    if (room && rooms[room]) {
      let partnerSocketId = null;
      let disconnectedRole = null;
      let partnerRole = null;

      if (socket.id === rooms[room].player) {
        partnerSocketId = rooms[room].master;
        disconnectedRole = "Player";
        partnerRole = "Master";
        delete rooms[room].player;
        delete rooms[room].playerName;
        rooms[room].playerReady = false; // รีเซ็ตสถานะพร้อม
      } else if (socket.id === rooms[room].master) {
        partnerSocketId = rooms[room].player;
        disconnectedRole = "Master";
        partnerRole = "Player";
        delete rooms[room].roomMaster;
        delete rooms[room].masterName;
        rooms[room].masterReady = false; // รีเซ็ตสถานะพร้อม
      }

      // ถ้ามีคู่ที่เหลืออยู่ ให้แจ้งเตือนคู่
      if (partnerSocketId) {
        console.log(`แจ้งเตือน ${partnerRole} (${partnerSocketId}) ในห้อง ${room} ว่า ${disconnectedRole} ออกจากห้อง`);
        io.to(partnerSocketId).emit("partnerDisconnected", `${disconnectedRole} ของคุณออกจากห้องแล้ว!`);
        // พาคู่ที่เหลือกลับไป Lobby
        io.to(partnerSocketId).emit("redirect", "/lobby.html");
      }

      // ถ้าห้องว่างเปล่า ให้ลบห้องนั้น
      if (!rooms[room].player && !rooms[room].master) {
        delete rooms[room];
        console.log(`Room ${room} ว่างเปล่าและถูกลบแล้ว.`);
      } else {
        // ถ้าห้องยังไม่ว่างเปล่า ให้ส่งสถานะห้องอัปเดตไปให้ทุกคน (รวมถึง Lobby)
        console.log(`อัปเดตสถานะ Room ${room} หลังจากการตัดการเชื่อมต่อ`);
        io.to(room).emit("roomStatusUpdate", {
          room: room,
          player: rooms[room].playerName || null,
          master: rooms[room].masterName || null,
          readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
          playerReady: rooms[room].playerReady,
          masterReady: rooms[room].masterReady
        });
      }
      // ส่งสถานะห้องอัปเดตไปยัง Lobby ด้วย (เพื่อให้เห็นว่าห้องนั้นว่างลง)
      io.emit("roomStatusUpdate", {
          room: room,
          player: rooms[room].playerName || null,
          master: rooms[room].masterName || null,
          readyToStart: rooms[room].player && rooms[room].master && rooms[room].playerReady && rooms[room].masterReady,
          playerReady: rooms[room].playerReady,
          masterReady: rooms[room].masterReady
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`🚀 Server กำลังทำงานที่พอร์ต ${PORT}`);
});
