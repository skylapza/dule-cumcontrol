const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

io.on("connection", (socket) => {
  console.log("👤 เชื่อมต่อ:", socket.id);

  socket.on("joinRoom", ({ room, role, name }) => {
    if (!rooms[room]) rooms[room] = {};

    if (role === "player") {
      if (rooms[room].player) return socket.emit("roomError", "ฝั่ง Player มีคนแล้ว!");
      rooms[room].player = socket.id;
      rooms[room].playerName = name;
    } else if (role === "master") {
      if (rooms[room].master) return socket.emit("roomError", "ฝั่ง Master มีคนแล้ว!");
      rooms[room].master = socket.id;
      rooms[room].masterName = name;
    }

    socket.join(room);
    socket.room = room;
    socket.role = role;
    socket.username = name;

    io.to(room).emit("roomStatusUpdate", {
      player: rooms[room].playerName || null,
      master: rooms[room].masterName || null,
      readyToStart: rooms[room].player && rooms[room].master
    });
  });

  socket.on("disconnect", () => {
    const room = socket.room;
    if (room && rooms[room]) {
      if (socket.id === rooms[room].player) {
        delete rooms[room].player;
        delete rooms[room].playerName;
      } else if (socket.id === rooms[room].master) {
        delete rooms[room].master;
        delete rooms[room].masterName;
      }

      io.to(room).emit("roomStatusUpdate", {
        player: rooms[room].playerName || null,
        master: rooms[room].masterName || null,
        readyToStart: rooms[room].player && rooms[room].master
      });

      if (!rooms[room].player && !rooms[room].master) {
        delete rooms[room];
      }
    }
  });
});

http.listen(PORT, () => {
  console.log("🚀 Server พร้อมใช้งานที่พอร์ต", PORT);
});
