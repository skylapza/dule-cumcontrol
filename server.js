const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const usedNames = new Set();
const roomStates = {}; // บันทึกสถานะห้อง

io.on("connection", (socket) => {
  console.log("Client connected");

  // ตรวจสอบชื่อซ้ำ
  socket.on("check-username", (name) => {
    const isAvailable = !usedNames.has(name);
    if (isAvailable) usedNames.add(name);
    socket.emit("username-status", isAvailable);
  });

  // เข้าห้องเกม
  socket.on("joinRoom", ({ room, role, name }) => {
    socket.username = name;
    socket.room = room;
    socket.role = role;
    socket.join(room);

    // บันทึกสถานะห้อง
    if (!roomStates[room]) {
      roomStates[room] = {};
    }
    roomStates[room][role] = socket.id;

    console.log(`${name} joined ${room} as ${role}`);

    // ส่งให้คู่ห้องรู้ว่าเชื่อมต่อแล้ว
    const otherRole = role === "player" ? "master" : "player";
    const otherId = roomStates[room][otherRole];

    if (otherId) {
      io.to(socket.id).emit("paired", { role, room });
      io.to(otherId).emit("paired", { role: otherRole, room });
    }

    // redirect ไปยังหน้าที่ต้องการ
    if (role === "player") {
      socket.emit("redirect", `/player_game.html`);
    } else if (role === "master") {
      socket.emit("redirect", `/master_control.html`);
    }
  });

  // ส่งสัญญาณ WebRTC
  socket.on("signal", (data) => {
    const room = socket.room;
    const role = socket.role;
    const otherRole = role === "player" ? "master" : "player";
    const otherId = roomStates[room]?.[otherRole];
    if (otherId) {
      io.to(otherId).emit("signal", data);
    }
  });

  // แชทในล็อบบี้
  socket.on("chatMessage", ({ user, text }) => {
    io.emit("chatMessage", { user, text });
  });

  // ออกจากระบบ
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.username}`);
    usedNames.delete(socket.username);

    const room = socket.room;
    const role = socket.role;
    if (roomStates[room]) {
      const otherRole = role === "player" ? "master" : "player";
      const otherId = roomStates[room][otherRole];
      delete roomStates[room][role];

      if (otherId) {
        io.to(otherId).emit("partnerDisconnected", `${role} ออกจากห้องแล้ว`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
