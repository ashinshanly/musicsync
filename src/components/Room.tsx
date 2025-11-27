/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import Logo from "./Logo";
import Visualizer from "./Visualizer";
import Chat from "./Chat";

interface User {
  id: string;
  name: string;
  isSharing: boolean;
  upvotes?: number;
  downvotes?: number;
}

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

const SOCKET_URL =
  process.env.NODE_ENV === "production"
    ? "https://musicsync-server.onrender.com"
    : "http://localhost:3001";

// Expanded ICE servers list for better connectivity
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function generateUsername(): string {
  const adjectives = ["Swift", "Mellow", "Brisk", "Cosmic", "Lunar", "Solar", "Neon", "Cyber"];
  const nouns = ["Beat", "Wave", "Rhythm", "Echo", "Pulse", "Vibe", "Synth", "Bass"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [shareType, setShareType] = useState<"microphone" | "system">("microphone");
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [sharingUser, setSharingUser] = useState<User | null>(null);
  const [hasVoted, setHasVoted] = useState<"up" | "down" | null>(null);
  const [messages, setMessages] = useState<{ id: string; username: string; text: string; timestamp: string }[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected" | "failed">("connecting");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const isSharingRef = useRef(isSharing);
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  const socketRef = useRef<Socket>();
  const localStreamRef = useRef<MediaStream>();
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const handleSendMessage = (message: string) => {
    if (socketRef.current && message.trim()) {
      const username = localStorage.getItem("username") || "Anonymous";
      socketRef.current.emit("chat-message", {
        roomId,
        message: {
          id: `${socketRef.current.id}-${Date.now()}`,
          username,
          text: message,
          timestamp: new Date().toLocaleTimeString(),
        },
      });
    }
  };

  const handleVote = (voteType: "up" | "down") => {
    if (!sharingUser || !socketRef.current) return;
    if (hasVoted === voteType) return;
    if (isSharing) return;

    socketRef.current.emit("vote", {
      roomId,
      targetUserId: sharingUser.id,
      voteType,
    });

    // Optimistic update
    setUsers((prevUsers) => {
      return prevUsers.map((user) => {
        if (user.id === sharingUser.id) {
          const currentUpvotes = user.upvotes || 0;
          const currentDownvotes = user.downvotes || 0;

          if (voteType === "up") {
            const newDownvotes = hasVoted === "down" ? Math.max(0, currentDownvotes - 1) : currentDownvotes;
            return { ...user, upvotes: currentUpvotes + 1, downvotes: newDownvotes };
          } else {
            const newUpvotes = hasVoted === "up" ? Math.max(0, currentUpvotes - 1) : currentUpvotes;
            return { ...user, downvotes: currentDownvotes + 1, upvotes: newUpvotes };
          }
        }
        return user;
      });
    });

    setSharingUser((prev) => {
      if (prev && prev.id === sharingUser.id) {
        const currentUpvotes = prev.upvotes || 0;
        const currentDownvotes = prev.downvotes || 0;

        if (voteType === "up") {
          const newDownvotes = hasVoted === "down" ? Math.max(0, currentDownvotes - 1) : currentDownvotes;
          return { ...prev, upvotes: currentUpvotes + 1, downvotes: newDownvotes };
        } else {
          const newUpvotes = hasVoted === "up" ? Math.max(0, currentUpvotes - 1) : currentUpvotes;
          return { ...prev, downvotes: currentDownvotes + 1, upvotes: newUpvotes };
        }
      }
      return prev;
    });

    setHasVoted(voteType);
    toast.success(voteType === "up" ? "Upvoted!" : "Downvoted");
  };

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      timeout: 60000,
      reconnectionAttempts: 5,
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    let username = localStorage.getItem("username");
    if (!username) {
      username = generateUsername();
      localStorage.setItem("username", username);
    }

    socket.on("connect", () => {
      console.log("Socket connected");
      setConnectionStatus("connected");
      socket.emit("join-room", { roomId, username });
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setConnectionStatus("failed");
      toast.error("Connection failed. Retrying...");
    });

    socket.on("user-joined", async ({ users: roomUsers }) => {
      setUsers(roomUsers);
      const currentlySharing = roomUsers.find((user: User) => user.isSharing);
      setSharingUser(currentlySharing || null);

      // If WE are sharing, we must initiate connections to the new users
      if (isSharingRef.current && socket.id) {
        roomUsers.forEach(async (user: User) => {
          if (user.id !== socket.id) {
            // Check if we already have a stable connection
            const existingPeer = peersRef.current.get(user.id);
            if (!existingPeer || existingPeer.connection.connectionState !== "connected") {
              try {
                console.log("Sharer: Initiating offer to new user:", user.id);
                const pc = createPeerConnection(user.id);
                const offer = await pc.connection.createOffer();
                await pc.connection.setLocalDescription(offer);
                socket.emit("offer", { offer, to: user.id });
              } catch (err) {
                console.error("Error initiating offer to new user:", err);
              }
            }
          }
        });
      }
    });

    socket.on("user-left", ({ userId, wasSharing, users: roomUsers }) => {
      setUsers(roomUsers);
      if (wasSharing) {
        setSharingUser(null);
        setRemoteStream(null);
        cleanupPeer(userId);
      }
    });

    socket.on("vote-update", ({ userId, upvotes, downvotes }) => {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, upvotes, downvotes } : u));
      setSharingUser((prev) => prev && prev.id === userId ? { ...prev, upvotes, downvotes } : prev);
    });

    socket.on("user-started-sharing", ({ userId, username }) => {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isSharing: true } : u));
      setSharingUser({ id: userId, name: username, isSharing: true });
    });

    socket.on("user-stopped-sharing", ({ userId }) => {
      setUsers((prev) => prev.map((u) => ({ ...u, isSharing: false })));
      setSharingUser(null);
      setHasVoted(null);
      setRemoteStream(null);
      cleanupPeer(userId);
    });

    socket.on("offer", async ({ offer, from }) => {
      let pc = peersRef.current.get(from);
      if (pc) pc.connection.close();

      pc = createPeerConnection(from);

      if (!isSharingRef.current) {
        // Listener receiving offer
        pc.connection.ontrack = (event) => handleTrack(event, from);
      }

      await pc.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.connection.createAnswer();
      await pc.connection.setLocalDescription(answer);
      socketRef.current?.emit("answer", { answer, to: from });
    });

    socket.on("answer", async ({ answer, from }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        await pc.connection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) {
        try {
          await pc.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding ICE candidate:", e);
        }
      }
    });

    socket.on("chat-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      audioElementsRef.current.forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      audioElementsRef.current.clear();
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const cleanupPeer = (userId: string) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(userId);
    }
    const audioElement = audioElementsRef.current.get(userId);
    if (audioElement) {
      audioElement.srcObject = null;
      audioElement.remove();
      audioElementsRef.current.delete(userId);
    }
  };

  const createPeerConnection = (userId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
      if (pc.connectionState === "connected") {
        toast.success(`Connected to ${userId}`);
      }
      if (pc.connectionState === "failed") {
        console.warn(`Connection failed with ${userId}, restarting ICE`);
        pc.restartIce();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("ice-candidate", {
          candidate: event.candidate,
          to: userId,
        });
      }
    };

    const peerConnection = { connection: pc };
    peersRef.current.set(userId, peerConnection);
    return peerConnection;
  };

  const handleTrack = (event: RTCTrackEvent, userId: string) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    setRemoteStream(stream);

    let audioElement = audioElementsRef.current.get(userId);
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      audioElement.controls = false;
      (audioElement as any).playsInline = true;
      document.body.appendChild(audioElement);
      audioElementsRef.current.set(userId, audioElement);
    }

    audioElement.srcObject = stream;
    audioElement.play().catch((e) => {
      console.error("Autoplay failed:", e);
      toast.error("Click anywhere to enable audio");
      document.addEventListener("click", () => audioElement?.play(), { once: true });
    });
  };

  const startSharing = async () => {
    if (sharingUser) {
      toast.error("Someone is already sharing.");
      return;
    }

    try {
      let stream: MediaStream;
      if (shareType === "microphone") {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } else {
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error("System audio sharing not supported.");
        }
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: { width: 1, height: 1 }, // Dummy video
        });
        // Stop video track immediately as we only want audio
        stream.getVideoTracks().forEach(t => t.stop());
      }

      if (stream.getAudioTracks().length === 0) {
        throw new Error("No audio track captured.");
      }

      localStreamRef.current = stream;
      setIsSharing(true);

      // Update local user state immediately
      setUsers(prev => prev.map(u => u.id === socketRef.current?.id ? { ...u, isSharing: true } : u));
      const me = users.find(u => u.id === socketRef.current?.id);
      if (me) setSharingUser({ ...me, isSharing: true });

      socketRef.current?.emit("start-sharing");

      // Initiate connections to all other users
      users.forEach(async (user) => {
        if (user.id !== socketRef.current?.id) {
          try {
            console.log("Initiating offer to:", user.id);
            const pc = createPeerConnection(user.id);
            const offer = await pc.connection.createOffer();
            await pc.connection.setLocalDescription(offer);
            socketRef.current?.emit("offer", { offer, to: user.id });
          } catch (err) {
            console.error(`Failed to offer to ${user.id}`, err);
          }
        }
      });

      stream.getAudioTracks()[0].onended = stopSharing;
    } catch (error: any) {
      console.error("Error starting share:", error);
      toast.error(error.message || "Failed to start sharing");
      setIsSharing(false);
    }
  };

  const stopSharing = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach((peer) => peer.connection.close());
    peersRef.current.clear();
    setIsSharing(false);
    setSharingUser(null);
    socketRef.current?.emit("stop-sharing");
  };

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
    };
    setIsMobile(checkMobile());
    if (checkMobile()) setShareType("microphone");
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success("Link copied!"))
      .catch(() => toast.error("Failed to copy link"));
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-4 md:p-8 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Toaster position="top-right" />

      <div className="max-w-7xl mx-auto w-full flex flex-col flex-grow h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <Logo size={40} />
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              Room: {roomId}
            </h1>
            <button
              onClick={copyLink}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              title="Copy Link"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-red-500/80 hover:bg-red-600 rounded-lg transition-colors text-sm font-medium"
          >
            Leave
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow min-h-0">
          {/* Main Content Area */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Visualizer Card */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-1 shadow-2xl border border-white/10 flex-grow relative overflow-hidden flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 to-blue-900/20 z-0" />

              <div className="relative z-10 flex-grow flex items-center justify-center min-h-[300px]">
                {(isSharing && localStreamRef.current) || (remoteStream) ? (
                  <Visualizer
                    stream={isSharing ? localStreamRef.current! : remoteStream!}
                    isSharing={isSharing}
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="mb-4 text-6xl animate-pulse">🎵</div>
                    <p>Waiting for audio stream...</p>
                  </div>
                )}

                {/* Voting Controls Overlay */}
                {sharingUser && !isSharing && (
                  <div className="absolute top-4 right-4 flex items-center space-x-2 bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10">
                    <button
                      onClick={() => handleVote("up")}
                      className={`p-2 rounded-full transition-colors ${hasVoted === "up" ? "text-green-400 bg-green-400/20" : "text-gray-400 hover:text-green-400"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                      </svg>
                      <span className="text-xs font-bold block text-center">{sharingUser.upvotes || 0}</span>
                    </button>
                    <div className="w-px h-8 bg-white/20" />
                    <button
                      onClick={() => handleVote("down")}
                      className={`p-2 rounded-full transition-colors ${hasVoted === "down" ? "text-red-400 bg-red-400/20" : "text-gray-400 hover:text-red-400"}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                      </svg>
                      <span className="text-xs font-bold block text-center">{sharingUser.downvotes || 0}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Controls Bar */}
              <div className="p-4 bg-black/40 backdrop-blur-md border-t border-white/5 flex flex-wrap justify-center gap-4 z-10">
                {!sharingUser ? (
                  <>
                    <div className="flex bg-white/5 rounded-lg p-1">
                      <button
                        onClick={() => setShareType("microphone")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${shareType === "microphone" ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
                      >
                        Microphone
                      </button>
                      <button
                        onClick={() => setShareType("system")}
                        disabled={isMobile}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${shareType === "system" ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"} ${isMobile ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        System Audio
                      </button>
                    </div>
                    <button
                      onClick={startSharing}
                      className="px-8 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg font-bold shadow-lg shadow-purple-500/20 transition-all transform hover:scale-105"
                    >
                      Start Sharing
                    </button>
                  </>
                ) : isSharing ? (
                  <button
                    onClick={stopSharing}
                    className="px-8 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-bold shadow-lg shadow-red-500/20 transition-all transform hover:scale-105"
                  >
                    Stop Sharing
                  </button>
                ) : (
                  <div className="text-purple-300 font-medium flex items-center gap-2">
                    <span className="animate-pulse">●</span>
                    {sharingUser.name} is sharing audio
                  </div>
                )}
              </div>
            </div>

            {/* Users List */}
            <div className="bg-black/40 backdrop-blur-xl rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Connected Users ({users.length})</h3>
              <div className="flex flex-wrap gap-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={`px-4 py-2 rounded-full text-sm font-medium border ${user.isSharing
                      ? "bg-purple-500/20 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                      : "bg-white/5 border-white/10 text-gray-400"
                      }`}
                  >
                    {user.name} {user.id === socketRef.current?.id && "(You)"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Sidebar */}
          <div className="lg:col-span-4 h-full min-h-[500px]">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 h-full overflow-hidden">
              <Chat
                messages={messages}
                onSendMessage={handleSendMessage}
                currentUser={localStorage.getItem("username") || "Anonymous"}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Room;
