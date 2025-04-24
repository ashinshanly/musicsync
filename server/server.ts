import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ["https://ashinshanly.github.io"]
      : ["http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

interface User {
  id: string;
  name: string;
  isSharing: boolean;
}

interface Room {
  id: string;
  users: User[];
  createdAt: Date;
}

const rooms = new Map<string, Room>();

// Clean up inactive rooms every hour
setInterval(() => {
  const now = new Date();
  rooms.forEach((room, roomId) => {
    const hoursSinceCreation = (now.getTime() - room.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24 && room.users.length === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  });
}, 1000 * 60 * 60); // Run every hour

const handleSocketError = (socket: Socket, error: Error) => {
  console.error(`Socket ${socket.id} error:`, error);
  socket.emit('error', { message: 'An error occurred' });
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    try {
      if (!roomId || !username) {
        throw new Error('Room ID and username are required');
      }

      // Create room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { 
          id: roomId, 
          users: [],
          createdAt: new Date()
        });
        console.log(`Created new room: ${roomId}`);
      }

      const room = rooms.get(roomId)!;
      
      // Check if username is already taken in the room
      if (room.users.some(u => u.name === username)) {
        socket.emit('error', { 
          message: 'Username is already taken in this room' 
        });
        return;
      }

      const user: User = { 
        id: socket.id, 
        name: username, 
        isSharing: false 
      };
      
      room.users.push(user);
      socket.join(roomId);
      
      // Notify all users in the room
      io.to(roomId).emit('user-joined', { 
        users: room.users,
        joinedUser: user
      });
      
      console.log(`User ${username} joined room ${roomId}`);

      // Handle WebRTC signaling
      socket.on('offer', ({ offer, to }) => {
        try {
          if (!offer || !to) {
            throw new Error('Invalid offer data');
          }
          socket.to(to).emit('offer', { 
            offer, 
            from: socket.id 
          });
        } catch (error) {
          handleSocketError(socket, error as Error);
        }
      });

      socket.on('answer', ({ answer, to }) => {
        try {
          if (!answer || !to) {
            throw new Error('Invalid answer data');
          }
          socket.to(to).emit('answer', { 
            answer, 
            from: socket.id 
          });
        } catch (error) {
          handleSocketError(socket, error as Error);
        }
      });

      socket.on('ice-candidate', ({ candidate, to }) => {
        try {
          if (!candidate || !to) {
            throw new Error('Invalid ICE candidate data');
          }
          socket.to(to).emit('ice-candidate', { 
            candidate, 
            from: socket.id 
          });
        } catch (error) {
          handleSocketError(socket, error as Error);
        }
      });

      socket.on('start-sharing', () => {
        try {
          const user = room.users.find(u => u.id === socket.id);
          if (user) {
            user.isSharing = true;
            io.to(roomId).emit('user-started-sharing', { 
              userId: socket.id,
              username: user.name 
            });
            console.log(`User ${user.name} started sharing in room ${roomId}`);
          }
        } catch (error) {
          handleSocketError(socket, error as Error);
        }
      });

      socket.on('stop-sharing', () => {
        try {
          const user = room.users.find(u => u.id === socket.id);
          if (user) {
            user.isSharing = false;
            io.to(roomId).emit('user-stopped-sharing', { 
              userId: socket.id,
              username: user.name 
            });
            console.log(`User ${user.name} stopped sharing in room ${roomId}`);
          }
        } catch (error) {
          handleSocketError(socket, error as Error);
        }
      });
    } catch (error) {
      handleSocketError(socket, error as Error);
    }
  });

  socket.on('disconnect', () => {
    try {
      rooms.forEach((room, roomId) => {
        const userIndex = room.users.findIndex(u => u.id === socket.id);
        if (userIndex !== -1) {
          const user = room.users[userIndex];
          room.users.splice(userIndex, 1);
          
          if (room.users.length === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted - no users remaining`);
          } else {
            io.to(roomId).emit('user-left', { 
              userId: socket.id,
              username: user.name,
              wasSharing: user.isSharing,
              users: room.users 
            });
          }
          
          console.log(`User ${user.name} left room ${roomId}`);
        }
      });
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 