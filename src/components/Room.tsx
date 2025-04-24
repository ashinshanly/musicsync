import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';

interface User {
  id: string;
  name: string;
  isSharing: boolean;
}

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-server-url.com' // Replace with your deployed server URL
  : 'http://localhost:3001';

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket>();
  const localStreamRef = useRef<MediaStream>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(SOCKET_URL);
    const username = localStorage.getItem('username') || 'Anonymous';
    
    socketRef.current.emit('join-room', { roomId, username });

    socketRef.current.on('user-joined', ({ users: roomUsers }) => {
      setUsers(roomUsers);
    });

    socketRef.current.on('user-left', ({ userId, wasSharing, users: roomUsers }) => {
      setUsers(roomUsers);
      if (wasSharing) {
        stopVisualization();
      }
    });

    socketRef.current.on('offer', async ({ offer, from }) => {
      try {
        const pc = createPeerConnection(from);
        await pc.connection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.connection.createAnswer();
        await pc.connection.setLocalDescription(answer);
        socketRef.current?.emit('answer', { answer, to: from });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socketRef.current.on('answer', async ({ answer, from }) => {
      try {
        const pc = peersRef.current.get(from);
        if (pc) {
          await pc.connection.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
      try {
        const pc = peersRef.current.get(from);
        if (pc) {
          await pc.connection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
      }
    });

    return () => {
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peersRef.current.forEach(peer => {
        peer.connection.close();
      });
      socketRef.current?.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [roomId]);

  const createPeerConnection = (userId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          candidate: event.candidate,
          to: userId
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.stream = stream;
        setupAudioVisualization(stream);
      }
    };

    const peerConnection = { connection: pc };
    peersRef.current.set(userId, peerConnection);
    return peerConnection;
  };

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
      localStreamRef.current = stream;
      
      // Add tracks to all peer connections
      users.forEach(user => {
        if (user.id !== socketRef.current?.id) {
          const pc = createPeerConnection(user.id);
          stream.getTracks().forEach(track => {
            pc.connection.addTrack(track, stream);
          });
        }
      });

      // Create and send offers to all peers
      const offers = await Promise.all(
        users
          .filter(user => user.id !== socketRef.current?.id)
          .map(async user => {
            const pc = peersRef.current.get(user.id);
            if (pc) {
              const offer = await pc.connection.createOffer();
              await pc.connection.setLocalDescription(offer);
              return { offer, to: user.id };
            }
          })
      );

      offers.forEach(offer => {
        if (offer) {
          socketRef.current?.emit('offer', offer);
        }
      });

      setIsSharing(true);
      socketRef.current?.emit('start-sharing');
      setupAudioVisualization(stream);

      stream.getAudioTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to access audio. Please check your permissions.');
      }
      setIsSharing(false);
    }
  };

  const stopSharing = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peersRef.current.forEach(peer => {
      peer.connection.close();
    });
    peersRef.current.clear();
    setIsSharing(false);
    socketRef.current?.emit('stop-sharing');
    stopVisualization();
  };

  const setupAudioVisualization = (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      startVisualization();
    } catch (err) {
      console.error('Error setting up visualization:', err);
    }
  };

  const startVisualization = () => {
    if (!analyserRef.current) return;

    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current || !canvasCtx) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = '#0A0A0F';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i];
        const hue = ((i / bufferLength) * 360) + ((Date.now() / 50) % 360);
        const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 50%, 0.2)`);
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  };

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Room: {roomId}
          </h1>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg shadow-lg transition-colors"
            onClick={() => navigate('/')}
          >
            Leave Room
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Audio Controls */}
          <div className="lg:col-span-2 bg-gray-800 rounded-xl p-6 shadow-xl">
            <div className="flex flex-col items-center space-y-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-6 py-3 rounded-lg shadow-lg text-lg font-semibold transition-colors ${
                  isSharing
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-purple-500 hover:bg-purple-600'
                }`}
                onClick={isSharing ? stopSharing : startSharing}
              >
                {isSharing ? 'Stop Sharing' : 'Share Audio'}
              </motion.button>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-100"
                >
                  {error}
                </motion.div>
              )}

              <canvas
                id="visualizer"
                className="w-full h-64 rounded-lg bg-gray-900"
                width="800"
                height="200"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-xl">
            <h2 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Connected Users
            </h2>
            <AnimatePresence>
              <motion.div className="space-y-4">
                {users.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`p-4 rounded-lg ${
                      user.isSharing
                        ? 'bg-purple-500/20 border border-purple-500'
                        : 'bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{user.name}</span>
                      {user.isSharing && (
                        <span className="px-2 py-1 text-sm bg-purple-500 rounded-full">
                          Sharing
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Room; 