const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const usedNames = new Set();

io.on("connection", (socket) => {
  console.log("Client connected");

  // ตรวจสอบชื่อซ้ำ
  socket.on("check-username", (name) => {
    const isAvailable = !usedNames.has(name);
    if (isAvailable) usedNames.add(name);
    socket.emit("username-status", isAvailable);
  });

  // ✅ ระบบแชท
  socket.on("chatMessage", ({ user, text }) => {
    io.emit("chatMessage", { user, text }); // broadcast
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
