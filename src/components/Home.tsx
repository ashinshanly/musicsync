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
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 p-4 md:p-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500/10 rounded-full filter blur-3xl"></div>
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-pink-500/10 rounded-full filter blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full filter blur-3xl"></div>
      </div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-black-glass backdrop-blur-xl p-8 md:p-10 rounded-2xl shadow-2xl border border-white-glass"
        >
          <div className="flex flex-col items-center mb-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
            >
              <Logo size={140} className="mb-6 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
            </motion.div>
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600"
            >
              MusicSync
            </motion.h1>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <p className="text-gray-300 mt-3 text-center text-lg">
                Share your music in real-time with friends
              </p>
              <div className="flex items-center justify-center mt-2 space-x-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                <span className="text-gray-400 text-sm">Seamless audio sharing</span>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-pink-500"></span>
                <span className="text-gray-400 text-sm">Real-time visualization</span>
              </div>
            </motion.div>
          </div>

          <div className="grid gap-10 grid-cols-1 lg:grid-cols-2">
            <motion.div
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-black-glass backdrop-blur-xl p-6 rounded-xl border border-white-glass shadow-lg"
            >
              <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create or Join a Room
              </h2>
              <form onSubmit={handleJoinRoom} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm text-gray-300 ml-1 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    Your Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your display name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700/70 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all backdrop-blur-sm border border-gray-600/30 focus:border-purple-500/50 shadow-inner"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-300 ml-1 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Room ID
                  </label>
                  <input
                    type="text"
                    placeholder="Enter room ID or create a new one"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700/70 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all backdrop-blur-sm border border-gray-600/30 focus:border-purple-500/50 shadow-inner"
                    required
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: "0 10px 25px -5px rgba(168, 85, 247, 0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  className="w-full py-3 mt-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center group shadow-lg shadow-purple-900/30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 group-hover:animate-pulse" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Create / Join Room
                </motion.button>
                <p className="text-xs text-gray-400 text-center mt-4">
                  Use the same Room ID to join an existing room or create a new one
                </p>
              </form>
            </motion.div>

            <motion.div 
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="lg:border-l lg:border-gray-700/50 lg:pl-10"
            >
              <LiveRooms />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Home; 