import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Logo from './Logo';
import LiveRooms from './LiveRooms';

const Home: React.FC = () => {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (username && roomId) {
      localStorage.setItem('username', username);
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gray-800 p-8 rounded-xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <Logo size={120} className="mb-6" />
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              MusicSync
            </h1>
            <p className="text-gray-400 mt-2 text-center">
              Share your music in real-time with friends
            </p>
          </div>

          <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                Create a Room
              </h2>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    required
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    required
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:opacity-90 transition-all"
                >
                  Create / Join Room
                </motion.button>
              </form>
            </div>

            <div className="lg:border-l lg:border-gray-700 lg:pl-8">
              <LiveRooms />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Home; 