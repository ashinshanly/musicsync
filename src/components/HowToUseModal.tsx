import React from "react";
import { motion } from "framer-motion";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const HowToUseModal = ({ isOpen, onClose }: Props) => {
  if (!isOpen) return null;

  return (
    <motion.div
      key="how-to-use-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: -50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-black-glass backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white-glass w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 text-center">
          🚀 Welcome to the MusicSync Universe! 🚀
        </h2>
        <p className="text-gray-300 text-center mb-8">
          You've just stepped into a new dimension of sound, where you can share
          and experience music with friends across the galaxy. Here's your guide
          to becoming a master of the MusicSync cosmos.
        </p>

        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold text-purple-400 mb-3 flex items-center">
              <span className="text-2xl mr-2">🌌</span> 1. Your Cosmic Passport
              (Creating & Joining a Room)
            </h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-6">
              <li>
                <span className="font-medium text-white">
                  To start a new party:
                </span>{" "}
                Just type in a name for your room and your call sign (username),
                and you're ready to launch!
              </li>
              <li>
                <span className="font-medium text-white">
                  To join a friend's session:
                </span>{" "}
                Get the Room ID from your friend, enter it, and you'll be
                instantly teleported to their listening party.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-purple-400 mb-3 flex items-center">
              <span className="text-2xl mr-2">🎧</span> 2. Become the DJ
              (Sharing Your Audio)
            </h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-6">
              <li>
                <span className="font-medium text-white">
                  Ready to share your tunes?
                </span>{" "}
                Hit the "Share Audio" button and choose your weapon:
                <ul className="list-circle list-inside ml-6 mt-1 space-y-1">
                  <li>
                    <span className="font-medium text-white">
                      System Audio:
                    </span>{" "}
                    Broadcast the sound from any application on your computer.
                    Perfect for sharing your favorite music streaming service or
                    a new track you've just created.
                  </li>
                  <li>
                    <span className="font-medium text-white">Microphone:</span>{" "}
                    Share your voice with the room. Great for live commentary,
                    singing along, or just hanging out.
                  </li>
                </ul>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-purple-400 mb-3 flex items-center">
              <span className="text-2xl mr-2">✨</span> 3. Feel the Vibe (The
              Audio Visualizer)
            </h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-6">
              <li>
                <span className="font-medium text-white">
                  Watch your music come to life!
                </span>{" "}
                The audio visualizer at the center of the room isn't just for
                looks—it's a real-time representation of the music's energy.
              </li>
              <li>
                <span className="font-medium text-white">
                  Vote on the track!
                </span>{" "}
                Let the DJ know what you think of their selection by using the
                upvote and downvote buttons.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-purple-400 mb-3 flex items-center">
              <span className="text-2xl mr-2">🤝</span> 4. The Golden Rule of
              the Galaxy
            </h3>
            <p className="text-gray-300 ml-6">
              <span className="font-medium text-white">
                Be excellent to each other!
              </span>{" "}
              Music is all about connection, so be respectful of your fellow
              travelers in the MusicSync universe.
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="mt-8 w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg"
        >
          Got It! Let's Sync!
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

export default HowToUseModal;
