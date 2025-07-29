import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../build')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
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
const rooms = new Map<string, any>();

// Add a basic route for testing
app.get('/', (req, res) => {
  res.send('MusicSync Server is running');
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
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
        hasActiveStream: room.users.some((user: any) => user.isSharing)
      }));
      console.log('Sending live rooms:', liveRooms);
      socket.emit('live-rooms', liveRooms);
    } catch (error) {
      console.error('Error handling get-live-rooms:', error);
      socket.emit('error', 'Failed to get live rooms');
    }
  });

  // Handle room joining
  socket.on('join-room', ({ roomId, username }: { roomId: string; username: string }) => {
    // Leave previous room if any
    const previousRoom = Array.from(rooms.values()).find(room => 
      room.users.some((user: any) => user.id === socket.id)
    );
    if (previousRoom) {
      previousRoom.users = previousRoom.users.filter((user: any) => user.id !== socket.id);
      if (previousRoom.users.length === 0) {
        const roomId = Array.from(rooms.entries())
          .find(([_, room]) => room === previousRoom)?.[0];
        if (roomId) {
          rooms.delete(roomId);
          io.emit('room-closed', roomId);
        }
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

    // If there's a user sharing in the room, notify the new user
    const sharingUser = room.users.find((u: any) => u.isSharing);
    if (sharingUser) {
      console.log(`Notifying new user ${socket.id} about sharing user ${sharingUser.id}`);
      socket.emit('user-started-sharing', {
        userId: sharingUser.id,
        username: sharingUser.name
      });
    }
  });

  // Handle start sharing
  socket.on('start-sharing', () => {
    console.log(`User ${socket.id} started sharing`); // Added logging
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u: any) => u.id === socket.id);
      if (user) {
        user.isSharing = true;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        if (roomId) {
          socket.to(roomId).emit('user-started-sharing', {
            userId: socket.id,
            username: user.name
          });
        }
      }
    }
  });

  // Handle stop sharing
  socket.on('stop-sharing', () => {
    console.log(`User ${socket.id} stopped sharing`); // Added logging
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u: any) => u.id === socket.id);
      if (user) {
        user.isSharing = false;
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        if (roomId) {
          // Notify all users in the room that sharing has stopped
          io.to(roomId).emit('user-stopped-sharing', {
            userId: socket.id,
            username: user.name
          });
          // Also emit a room-updated event to ensure all clients have the latest state
          io.to(roomId).emit('room-updated', {
            id: roomId,
            name: `Room ${roomId}`,
            userCount: room.users.length,
            hasActiveStream: false
          });
        }
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const room = findUserRoom(socket.id);
    if (room) {
      const user = room.users.find((u: any) => u.id === socket.id);
      const wasSharing = user?.isSharing || false;
      room.users = room.users.filter((u: any) => u.id !== socket.id);
      
      if (room.users.length === 0) {
        const roomId = findRoomId(room);
        if (roomId) {
          rooms.delete(roomId);
          io.emit('room-closed', roomId);
        }
      } else {
        updateRoomStatus(room);
        const roomId = findRoomId(room);
        if (roomId) {
          // The 'user-left' event now handles all cleanup on the client-side
          // if the user was sharing.
          socket.to(roomId).emit('user-left', {
            userId: socket.id,
            wasSharing,
            users: room.users
          });
        }
      }
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ offer, to }: { offer: any; to: string }) => {
    console.log(`Offer from ${socket.id} to ${to}`); // Added logging
    socket.to(to).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, to }: { answer: any; to: string }) => {
    console.log(`Answer from ${socket.id} to ${to}`); // Added logging
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }: { candidate: any; to: string }) => {
    console.log(`ICE candidate from ${socket.id} to ${to}`); // Added logging
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });
});

// Helper functions
function findUserRoom(userId: string) {
  return Array.from(rooms.values()).find(room => 
    room.users.some((user: any) => user.id === userId)
  );
}

function findRoomId(targetRoom: any) {
  return Array.from(rooms.entries())
    .find(([_, room]) => room === targetRoom)?.[0];
}

function updateRoomStatus(room: any) {
  const roomId = findRoomId(room);
  if (roomId) {
    io.emit('room-updated', {
      id: roomId,
      name: `Room ${roomId}`,
      userCount: room.users.length,
      hasActiveStream: room.users.some((user: any) => user.isSharing)
    });
  }
}

// Error handling for the server
httpServer.on('error', (error) => {
  console.error('Server error:', error);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('CORS settings:', io.engine.opts.cors);
}); 