import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const CreateRoom: React.FC = () => {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement room creation logic with WebSocket
    navigate(`/room/${Date.now()}`); // Temporary implementation
  };

  const formVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  };

  const inputVariants = {
    focus: { scale: 1.02, transition: { duration: 0.2 } },
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-12"
      initial="hidden"
      animate="visible"
      variants={formVariants}
    >
      <motion.div className="max-w-md mx-auto" variants={formVariants}>
        <motion.h2
          className="text-3xl heading-primary mb-8 gradient-text text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Create a Room
        </motion.h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          <motion.div
            variants={formVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <label className="block text-sm heading-secondary mb-2 text-white/60">
              Username
            </label>
            <motion.input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="Enter your username"
              whileFocus="focus"
              variants={inputVariants}
            />
          </motion.div>

          <motion.div
            variants={formVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <label className="block text-sm heading-secondary mb-2 text-white/60">
              Room Name
            </label>
            <motion.input
              type="text"
              required
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="input-field"
              placeholder="Enter room name"
              whileFocus="focus"
              variants={inputVariants}
            />
          </motion.div>

          <motion.div
            variants={formVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.5 }}
          >
            <label className="block text-sm heading-secondary mb-2 text-white/60">
              Password (Optional)
            </label>
            <motion.input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Enter room password"
              whileFocus="focus"
              variants={inputVariants}
            />
          </motion.div>

          <motion.div
            className="flex gap-4 pt-4"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.6 }}
          >
            <motion.button
              type="button"
              onClick={() => navigate("/")}
              className="flex-1 p-3 rounded-lg border border-white/10 hover:border-accent-1/50 
                       transition-colors duration-300 heading-secondary text-white/60 hover:text-white"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              className="flex-1 neon-button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Create Room
            </motion.button>
          </motion.div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default CreateRoom;
