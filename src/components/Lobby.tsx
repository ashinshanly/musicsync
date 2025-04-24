import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface Room {
  id: string;
  name: string;
  userCount: number;
}

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms] = useState<Room[]>([
    { id: '1', name: 'Chill Vibes', userCount: 5 },
    { id: '2', name: 'Rock Session', userCount: 3 },
    { id: '3', name: 'Jazz Club', userCount: 2 },
  ]);

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <motion.div 
      className="container mx-auto px-4 py-12"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div 
        className="text-center mb-16"
        variants={itemVariants}
      >
        <h1 className="text-4xl md:text-6xl heading-primary mb-6 gradient-text">
          Listen Together with MusicSync
        </h1>
        <p className="text-lg text-white/60 heading-secondary mb-8 max-w-2xl mx-auto">
          Join a room and share your favorite music with friends in real-time
        </p>
        <motion.button
          onClick={() => navigate('/create')}
          className="neon-button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Create Room
        </motion.button>
      </motion.div>

      <motion.div 
        className="max-w-3xl mx-auto"
        variants={itemVariants}
      >
        <div className="mb-8">
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
          />
        </div>

        <motion.div 
          className="grid gap-4"
          variants={containerVariants}
        >
          {filteredRooms.map((room, index) => (
            <motion.div
              key={room.id}
              className="room-card"
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: { delay: index * 0.1 } 
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl heading-secondary mb-1">{room.name}</h3>
                  <p className="text-sm text-white/40">{room.userCount} users listening</p>
                </div>
                <motion.button
                  onClick={() => navigate(`/room/${room.id}`)}
                  className="neon-button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Join
                </motion.button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Lobby; 