import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

interface Room {
  id: string;
  name: string;
  userCount: number;
  hasActiveStream: boolean;
}

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://musicsync-server.onrender.com'
  : 'http://localhost:3001';

const LiveRooms: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to server');
      setError(null);
      socket.emit('get-live-rooms');
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to server. Please try again later.');
      setLoading(false);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setError('Connection lost. Attempting to reconnect...');
    });

    socket.on('live-rooms', (liveRooms: Room[]) => {
      console.log('Received live rooms:', liveRooms);
      setRooms(liveRooms);
      setLoading(false);
      setError(null);
    });

    socket.on('room-updated', (updatedRoom: Room) => {
      console.log('Room updated:', updatedRoom);
      setRooms(prevRooms => {
        const roomIndex = prevRooms.findIndex(room => room.id === updatedRoom.id);
        if (roomIndex === -1) {
          return [...prevRooms, updatedRoom];
        }
        const newRooms = [...prevRooms];
        newRooms[roomIndex] = updatedRoom;
        return newRooms;
      });
    });

    socket.on('room-closed', (roomId: string) => {
      console.log('Room closed:', roomId);
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
    });

    // Retry connection if it fails
    let retryCount = 0;
    const maxRetries = 3;
    const retryInterval = setInterval(() => {
      if (!socket.connected && retryCount < maxRetries) {
        console.log('Retrying connection...');
        socket.connect();
        retryCount++;
      } else if (retryCount >= maxRetries) {
        clearInterval(retryInterval);
        setError('Could not connect to server after multiple attempts. Please refresh the page.');
        setLoading(false);
      }
    }, 5000);

    return () => {
      clearInterval(retryInterval);
      socket.disconnect();
    };
  }, []);

  const handleJoinRoom = (roomId: string) => {
    const username = localStorage.getItem('username');
    if (!username) {
      setError('Please enter your name before joining a room');
      return;
    }
    navigate(`/room/${roomId}`);
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    socketRef.current?.connect();
  };

  if (loading) {
    return (
      <div className="mt-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
        <p className="text-gray-400 mt-2">Loading live rooms...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRetry}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
        >
          Retry Connection
        </motion.button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
        Live Rooms
      </h2>
      {rooms.length === 0 ? (
        <p className="text-center text-gray-400">No active rooms found</p>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-800 rounded-lg p-4 shadow-lg hover:shadow-xl transition-all"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-white">{room.name}</h3>
                {room.hasActiveStream && (
                  <span className="px-2 py-1 text-xs bg-purple-500 text-white rounded-full">
                    Live Music
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm mb-4">
                {room.userCount} {room.userCount === 1 ? 'user' : 'users'} connected
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleJoinRoom(room.id)}
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:opacity-90 transition-all"
              >
                Join Room
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveRooms; 