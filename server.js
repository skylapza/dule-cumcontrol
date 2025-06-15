const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ให้ static ไฟล์ใน public
app.use(express.static("public"));

const usedNames = new Set();

io.on("connection", (socket) => {
  console.log("Client connected");

  // ตรวจสอบชื่อซ้ำ และจำชื่อไว้ใน socket
  socket.on("check-username", (name) => {
    const isAvailable = !usedNames.has(name);
    if (isAvailable) {
      usedNames.add(name);
      socket.username = name;
    }
    socket.emit("username-status", isAvailable);
  });

  // รับข้อความแชท และส่งต่อให้ทุกคน
  socket.on("chatMessage", ({ user, text }) => {
    io.emit("chatMessage", { user, text });
  });

  // เมื่อผู้ใช้ disconnect -> ลบชื่อออกจาก usedNames
  socket.on("disconnect", () => {
    if (socket.username) {
      usedNames.delete(socket.username);
      console.log(`User ${socket.username} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
