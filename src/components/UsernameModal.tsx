import React, { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string) => void;
}

const UsernameModal = ({ isOpen, onClose, onSubmit }: Props) => {
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSubmit(username.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      key="username-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: -50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-black-glass backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white-glass w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 text-center">
          Enter Your Name
        </h2>
        <p className="text-gray-300 text-center mb-6">
          Please enter a display name to join the room.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="text"
            placeholder="Your display name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 bg-white-glass text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all backdrop-blur-sm border border-white-glass shadow-inner"
            required
            autoFocus
          />
          <motion.button
            whileHover={{
              scale: 1.03,
              boxShadow: "0 10px 25px -5px rgba(168, 85, 247, 0.3)",
            }}
            whileTap={{ scale: 0.97 }}
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg"
          >
            Join Room
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default UsernameModal;
