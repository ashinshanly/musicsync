import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import UsernameModal from "./UsernameModal";

interface Room {
  id: string;
  name: string;
  userCount: number;
  hasActiveStream: boolean;
}

const SOCKET_URL =
  process.env.NODE_ENV === "production"
    ? "https://musicsync-server.onrender.com"
    : "http://localhost:3001";

const LiveRooms: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("Connecting...");
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null); // State to store selected room ID
  const [currentJoke, setCurrentJoke] = useState(0);

  const connectionJokes = [
    "Waking up the server... ☕",
    "Teaching electrons to dance... 💃",
    "Convincing the server to wake up... 😴",
    "Bribing the hamsters that power our servers... 🐹",
    "Calibrating the flux capacitor... ⚡",
    "Warming up the quantum entanglement... 🔬",
    "Downloading more RAM... 💾",
    "Untangling the internet cables... 🕸️",
    "Asking nicely... 🙏",
    "Summoning the cloud spirits... ☁️",
  ];

  useEffect(() => {
    console.log("Initializing socket connection to:", SOCKET_URL);

    try {
      socketRef.current = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 60000, // Increased to 60 seconds for Render wake-up
      });

      const socket = socketRef.current;

      socket.on("connect", () => {
        console.log("Successfully connected to server");
        setConnectionStatus("Connected");
        setError(null);
        console.log("Requesting live rooms...");
        socket.emit("get-live-rooms");
      });

      socket.on("connect_error", (err) => {
        console.error("Connection error:", err.message);
        setConnectionStatus(`Connection error: ${err.message}`);
        setError(`Failed to connect to server: ${err.message}`);
        setLoading(false);
      });

      socket.on("disconnect", (reason) => {
        console.log("Disconnected from server:", reason);
        setConnectionStatus(`Disconnected: ${reason}`);
        setError("Connection lost. Attempting to reconnect...");
      });

      socket.on("live-rooms", (liveRooms: Room[]) => {
        console.log("Received live rooms:", liveRooms);
        setRooms(liveRooms);
        setLoading(false);
        setError(null);
      });

      socket.on("error", (err) => {
        console.error("Socket error:", err);
        setError(`Socket error: ${err}`);
        setLoading(false);
      });

      // Rotate jokes every 3 seconds while connecting
      const jokeInterval = setInterval(() => {
        setCurrentJoke((prev) => (prev + 1) % connectionJokes.length);
      }, 3000);

      return () => {
        clearInterval(jokeInterval);
        if (socket) {
          console.log("Cleaning up socket connection");
          socket.disconnect();
        }
      };
    } catch (err) {
      console.error("Error initializing socket:", err);
      setError(`Failed to initialize connection: ${err}`);
      setLoading(false);
    }
  }, []);

  const handleJoinRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setIsModalOpen(true); // Open the modal instead of direct navigation
  };

  const handleUsernameSubmit = (username: string) => {
    if (selectedRoomId) {
      localStorage.setItem("username", username);
      navigate(`/room/${selectedRoomId}`);
    }
    setIsModalOpen(false);
    setSelectedRoomId(null);
  };

  const handleRetry = () => {
    console.log("Retrying connection...");
    setLoading(true);
    setError(null);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  };

  if (loading) {
    return (
      <div className="mt-8 text-center p-6 bg-black-glass backdrop-blur-xl rounded-xl border border-white-glass shadow-lg">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full rounded-full border-4 border-t-blue-500 border-r-transparent border-b-purple-500 border-l-transparent animate-spin"></div>
          <div
            className="absolute top-2 left-2 w-12 h-12 rounded-full border-4 border-t-transparent border-r-pink-500 border-b-transparent border-l-purple-500 animate-spin animate-pulse"
            style={{ animationDirection: "reverse" }}
          ></div>
        </div>
        <p className="text-gray-300 mt-4 font-medium">
          Connecting to server...
        </p>
        <div className="w-full max-w-xs mx-auto mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full"
            initial={{ width: "10%" }}
            animate={{ width: "90%" }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
        </div>
        <motion.p
          key={currentJoke}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="text-xs text-gray-400 mt-3 italic"
        >
          {connectionJokes[currentJoke]}
        </motion.p>
        <p className="text-xs text-gray-500 mt-1">
          (Server might be waking up from sleep... this can take up to a minute)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center p-6 bg-black-glass backdrop-blur-xl rounded-xl border border-red-500/20 shadow-lg">
        <div className="rounded-full bg-red-500/10 p-4 w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-red-400 mb-4 font-medium">{error}</p>
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 10px 25px -5px rgba(239, 68, 68, 0.3)",
          }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRetry}
          className="px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg flex items-center justify-center mx-auto"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Retry Connection
        </motion.button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 flex items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 mr-2 text-blue-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
        Live Rooms
      </h2>
      {rooms.length === 0 ? (
        <div className="bg-black-glass backdrop-blur-xl p-6 rounded-xl border border-white-glass shadow-lg text-center">
          <div className="rounded-full bg-blue-500/10 p-4 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-blue-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 17a3 3 0 1 1-2-2.83V5.5a.75.75 0 0 1 .57-.73l10-2.5a.75.75 0 0 1 .93.73v12.1a3 3 0 1 1-2-2.83V6.15L9 8v6.17A3 3 0 0 1 9 17z" />
            </svg>
          </div>
          <p className="text-gray-300 font-medium">No active rooms found</p>
          <p className="text-gray-400 text-sm mt-2">
            Create a new room to get started or try again later
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1">
          {rooms.map((room) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              whileHover={{
                y: -5,
                boxShadow: "0 10px 25px -5px rgba(138, 58, 185, 0.2)",
              }}
              className="bg-black-glass backdrop-blur-xl rounded-xl p-5 shadow-lg border border-white-glass transition-all duration-300 hover:border-purple-500/30"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold text-white flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-purple-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {room.name}
                </h3>
                {room.hasActiveStream && (
                  <span className="px-3 py-1 text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full flex items-center animate-pulse shadow-md shadow-purple-500/20">
                    <span className="w-2 h-2 bg-white rounded-full mr-1"></span>
                    Live Music
                  </span>
                )}
              </div>
              <div className="flex items-center text-gray-300 text-sm mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1 text-blue-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                <span>
                  {room.userCount} {room.userCount === 1 ? "user" : "users"}{" "}
                  connected
                </span>
              </div>
              <motion.button
                whileHover={{
                  scale: 1.03,
                  boxShadow: "0 10px 25px -5px rgba(168, 85, 247, 0.3)",
                }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleJoinRoom(room.id)}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-semibold transition-all duration-300 flex items-center justify-center group shadow-lg shadow-purple-900/20"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2 group-hover:animate-pulse"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Join Room
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}
      <UsernameModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleUsernameSubmit}
      />
    </div>
  );
};

export default LiveRooms;
