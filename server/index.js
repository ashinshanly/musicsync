const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',  // Allow all origins temporarily for debugging
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 10000,
  pingInterval: 5000
});

// Store active rooms
const rooms = new Map();

// Add a basic route for testing
app.get('/', (req, res) => {
  res.send('MusicSync Server is running');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  console.log('Current transport:', socket.conn.transport.name);

  // Handle get-live-rooms request
  socket.on('get-live-rooms', () => {
    console.log('Received get-live-rooms request from:', socket.id);
    try {
      const liveRooms = Array.from(rooms.entries()).map(([roomId, room]) => ({
        id: roomId,
        name: `Room ${roomId}`,
        userCount: room.users.length,
        hasActiveStream: room.users.some(user => user.isSharing)
      }));
      console.log('Sending live rooms:', liveRooms);
      socket.emit('live-rooms', liveRooms);
    } catch (error) {
      console.error('Error handling get-live-rooms:', error);
      socket.emit('error', 'Failed to get live rooms');
    }
  });

  // Handle room joining
  socket.on('join-room', ({ roomId, username }) => {
    // Leave previous room if any
    const previousRoom = Array.from(rooms.values()).find(room => 
      room.users.some(user => user.id === socket.id)
    );
    if (previousRoom) {
      previousRoom.users = previousRoom.users.filter(user => user.id !== socket.id);
      if (previousRoom.users.length === 0) {
        const roomId = Array.from(rooms.entries())
          .find(([_, room]) => room === previousRoom)[0];
        rooms.delete(roomId);
        io.emit('room-closed', roomId);
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
      isSharing: false
    };
    room.users.push(user);
    
    // Notify room update
    updateRoomStatus(room);
    
    // Send current users to the new user
    socket.emit('user-joined', { users: room.users });
    socket.to(roomId).emit('user-joined', { users: room.users });
  });

  // Handle start sharing
  socket.on('start-sharing', () => {
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find(u => u.id === socket.id);
      if (user) {
        user.isSharing = true;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        socket.to(roomId).emit('user-started-sharing', {
          userId: socket.id,
          username: user.name
        });
      }
    }
  });

  // Handle stop sharing
  socket.on('stop-sharing', () => {
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find(u => u.id === socket.id);
      if (user) {
        user.isSharing = false;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        socket.to(roomId).emit('user-stopped-sharing', {
          userId: socket.id
        });
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find(u => u.id === socket.id);
      const wasSharing = user?.isSharing || false;
      room.users = room.users.filter(u => u.id !== socket.id);
      
      if (room.users.length === 0) {
        const roomId = findRoomId(room);
        rooms.delete(roomId);
        io.emit('room-closed', roomId);
      } else {
        updateRoomStatus(room);
        if (wasSharing) {
          const roomId = findRoomId(room);
          socket.to(roomId).emit('user-stopped-sharing', { userId: socket.id });
        }
        const roomId = findRoomId(room);
        socket.to(roomId).emit('user-left', {
          userId: socket.id,
          wasSharing,
          users: room.users
        });
      }
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ offer, to }) => {
    socket.to(to).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, to }) => {
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });
});

// Helper functions
function findUserRoom(userId) {
  return Array.from(rooms.values()).find(room => 
    room.users.some(user => user.id === userId)
  );
}

function findRoomId(targetRoom) {
  return Array.from(rooms.entries())
    .find(([_, room]) => room === targetRoom)[0];
}

function updateRoomStatus(room) {
  const roomId = findRoomId(room);
  if (roomId) {
    io.emit('room-updated', {
      id: roomId,
      name: `Room ${roomId}`,
      userCount: room.users.length,
      hasActiveStream: room.users.some(user => user.isSharing)
    });
  }
}

// Error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('CORS settings:', io.engine.opts.cors);
}); 