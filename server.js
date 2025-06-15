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

  socket.on("check-username", (name) => {
    const isAvailable = !usedNames.has(name);
    if (isAvailable) usedNames.add(name);
    socket.emit("username-status", isAvailable);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
