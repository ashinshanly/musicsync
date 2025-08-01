const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../build")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins temporarily for debugging
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 10000,
  pingInterval: 5000,
});

// Store active rooms
const rooms = new Map();

// Add a basic route for testing
app.get("/", (req, res) => {
  res.send("MusicSync Server is running");
});

// Add health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  console.log("Current transport:", socket.conn.transport.name);

  // Handle get-live-rooms request
  socket.on("get-live-rooms", () => {
    console.log("Received get-live-rooms request from:", socket.id);
    try {
      const liveRooms = Array.from(rooms.entries()).map(([roomId, room]) => ({
        id: roomId,
        name: `Room ${roomId}`,
        userCount: room.users.length,
        hasActiveStream: room.users.some((user) => user.isSharing),
      }));
      console.log("Sending live rooms:", liveRooms);
      socket.emit("live-rooms", liveRooms);
    } catch (error) {
      console.error("Error handling get-live-rooms:", error);
      socket.emit("error", "Failed to get live rooms");
    }
  });

  // Handle room joining
  socket.on("join-room", ({ roomId, username }) => {
    // Leave previous room if any
    const previousRoom = Array.from(rooms.values()).find((room) =>
      room.users.some((user) => user.id === socket.id),
    );
    if (previousRoom) {
      previousRoom.users = previousRoom.users.filter(
        (user) => user.id !== socket.id,
      );
      if (previousRoom.users.length === 0) {
        const roomId = Array.from(rooms.entries()).find(
          ([_, room]) => room === previousRoom,
        )[0];
        rooms.delete(roomId);
        io.emit("room-closed", roomId);
      } else {
        updateRoomStatus(previousRoom);
      }
    }

    // Join new room
    socket.join(roomId);
    let room = rooms.get(roomId);
    if (!room) {
      room = { users: [] };
      rooms.set(roomId, room);
    }

    const user = {
      id: socket.id,
      name: username,
      isSharing: false,
      upvotes: 0,
      downvotes: 0,
    };
    room.users.push(user);

    // Notify room update
    updateRoomStatus(room);

    // Send current users to the new user
    socket.emit("user-joined", { users: room.users });
    socket.to(roomId).emit("user-joined", { users: room.users });
    socket.to(roomId).emit("user-joined-chat", username);
  });

  // Handle start sharing
  socket.on("start-sharing", () => {
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u) => u.id === socket.id);
      if (user) {
        user.isSharing = true;
        // Reset votes when user starts sharing
        user.upvotes = 0;
        user.downvotes = 0;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        socket.to(roomId).emit("user-started-sharing", {
          userId: socket.id,
          username: user.name,
        });
      }
    }
  });

  // Handle stop sharing
  socket.on("stop-sharing", () => {
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u) => u.id === socket.id);
      if (user) {
        user.isSharing = false;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        socket.to(roomId).emit("user-stopped-sharing", {
          userId: socket.id,
        });
      }
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u) => u.id === socket.id);
      const wasSharing = user?.isSharing || false;
      room.users = room.users.filter((u) => u.id !== socket.id);

      // Clean up votes when a user leaves
      if (room.votes) {
        // Remove this user's votes
        delete room.votes[socket.id];

        // Update vote counts for all users since this user's votes are gone
        room.users.forEach((u) => {
          if (u.isSharing) {
            // Recount votes for sharing user
            let upvotes = 0;
            let downvotes = 0;
            Object.entries(room.votes || {}).forEach(([voterId, voteType]) => {
              if (voteType === "up") upvotes++;
              if (voteType === "down") downvotes++;
            });
            u.upvotes = upvotes;
            u.downvotes = downvotes;

            const roomId = findRoomId(room);
            io.to(roomId).emit("vote-update", {
              userId: u.id,
              upvotes: u.upvotes,
              downvotes: u.downvotes,
            });
          }
        });
      }

      if (room.users.length === 0) {
        const roomId = findRoomId(room);
        rooms.delete(roomId);
        io.emit("room-closed", roomId);
      } else {
        updateRoomStatus(room);
        if (wasSharing) {
          const roomId = findRoomId(room);
          socket.to(roomId).emit("user-stopped-sharing", { userId: socket.id });
        }
        const roomId = findRoomId(room);
        socket.to(roomId).emit("user-left", {
          userId: socket.id,
          wasSharing,
          users: room.users,
        });
        socket.to(roomId).emit("user-left-chat", user.name);
      }
    }
  });

  // Handle voting
  socket.on("vote", ({ roomId, targetUserId, voteType }) => {
    console.log("Vote received:", {
      roomId,
      targetUserId,
      voteType,
      from: socket.id,
    });
    const room = rooms.get(roomId);
    if (!room) return;

    // Find the target user in the room
    const targetUser = room.users.find((user) => user.id === targetUserId);
    if (!targetUser) return;

    // Initialize vote counts if not present
    targetUser.upvotes = targetUser.upvotes || 0;
    targetUser.downvotes = targetUser.downvotes || 0;

    // Track who voted for what
    room.votes = room.votes || {};
    const previousVote = room.votes[socket.id];

    // Handle vote changes
    if (previousVote === voteType) {
      // Double-voting - toggle off the vote
      if (voteType === "up") {
        targetUser.upvotes = Math.max(0, targetUser.upvotes - 1);
      } else {
        targetUser.downvotes = Math.max(0, targetUser.downvotes - 1);
      }
      // Remove the vote record
      delete room.votes[socket.id];
    } else {
      // Remove previous vote if it exists
      if (previousVote === "up") {
        targetUser.upvotes = Math.max(0, targetUser.upvotes - 1);
      } else if (previousVote === "down") {
        targetUser.downvotes = Math.max(0, targetUser.downvotes - 1);
      }

      // Add new vote
      if (voteType === "up") {
        targetUser.upvotes += 1;
      } else {
        targetUser.downvotes += 1;
      }

      // Save the vote
      room.votes[socket.id] = voteType;
    }

    console.log("New vote counts:", {
      upvotes: targetUser.upvotes,
      downvotes: targetUser.downvotes,
    });

    // Broadcast the updated vote counts to all users in the room
    io.to(roomId).emit("vote-update", {
      userId: targetUserId,
      upvotes: targetUser.upvotes,
      downvotes: targetUser.downvotes,
    });
  });

  // Handle WebRTC signaling
  socket.on("offer", ({ offer, to }) => {
    socket.to(to).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", ({ answer, to }) => {
    socket.to(to).emit("answer", { answer, from: socket.id });
  });

  socket.on("ice-candidate", ({ candidate, to }) => {
    socket.to(to).emit("ice-candidate", { candidate, from: socket.id });
  });

  socket.on("chat-message", ({ roomId, message }) => {
    console.log(
      `Server: Received chat message for room ${roomId} from ${message.username}: ${message.text}`,
    );
    io.to(roomId).emit("chat-message", message);
  });
});

// Helper functions
function findUserRoom(userId) {
  return Array.from(rooms.values()).find((room) =>
    room.users.some((user) => user.id === userId),
  );
}

function findRoomId(targetRoom) {
  return Array.from(rooms.entries()).find(
    ([_, room]) => room === targetRoom,
  )[0];
}

function updateRoomStatus(room) {
  const roomId = findRoomId(room);
  if (roomId) {
    io.emit("room-updated", {
      id: roomId,
      name: `Room ${roomId}`,
      userCount: room.users.length,
      hasActiveStream: room.users.some((user) => user.isSharing),
    });
  }
}

// Error handling for the server
server.on("error", (error) => {
  console.error("Server error:", error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log("CORS settings:", io.engine.opts.cors);
});
