import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface User {
  id: string;
  name: string;
  isSharing: boolean;
}

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'User 1', isSharing: true },
    { id: '2', name: 'User 2', isSharing: false },
  ]);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    } catch (err) {
      setError('Your browser does not support the Web Audio API. Please use a modern browser.');
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
      if (audioContextRef.current && analyserRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        setIsSharing(true);
        startVisualization();
        
        // Update users list when sharing starts
        setUsers(prev => prev.map(user => 
          user.id === '1' ? { ...user, isSharing: true } : { ...user, isSharing: false }
        ));

        // Handle when user stops sharing through the browser's UI
        stream.getAudioTracks()[0].onended = () => {
          setIsSharing(false);
          setUsers(prev => prev.map(user => ({ ...user, isSharing: false })));
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to access audio. Please check your permissions.');
      }
      setIsSharing(false);
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
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];

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
      className="container mx-auto px-4 py-8"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {error && (
        <motion.div 
          className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}
      <motion.div 
        className="flex justify-between items-center mb-8"
        variants={itemVariants}
      >
        <h2 className="text-2xl heading-primary gradient-text">
          Room: {roomId}
        </h2>
        <motion.button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg border border-white/10 hover:border-accent-1/50 
                   transition-colors duration-300 heading-secondary text-white/60 hover:text-white"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Leave Room
        </motion.button>
      </motion.div>

      <div className="grid md:grid-cols-[1fr,300px] gap-8">
        <motion.div 
          className="space-y-6"
          variants={itemVariants}
        >
          <motion.div 
            className="room-card"
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-4 flex justify-between items-center">
              <h3 className="text-xl heading-secondary">
                {isSharing ? 'You are sharing audio' : 'Current Audio Stream'}
              </h3>
              <motion.button
                onClick={startSharing}
                disabled={isSharing}
                className={`neon-button ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                whileHover={!isSharing ? { scale: 1.05 } : {}}
                whileTap={!isSharing ? { scale: 0.95 } : {}}
              >
                {isSharing ? 'Sharing' : 'Share Audio'}
              </motion.button>
            </div>
            <canvas
              id="visualizer"
              className="w-full h-40 rounded-lg bg-primary shadow-lg"
              width="800"
              height="160"
            />
          </motion.div>
        </motion.div>

        <motion.div 
          className="room-card"
          variants={itemVariants}
        >
          <h3 className="text-xl heading-secondary mb-6">Users</h3>
          <motion.div 
            className="space-y-3"
            variants={containerVariants}
          >
            {users.map(user => (
              <motion.div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                whileHover={{ scale: 1.02 }}
              >
                <span className="heading-secondary">{user.name}</span>
                {user.isSharing && (
                  <motion.span 
                    className="text-sm text-accent-1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.3,
                      ease: "easeOut"
                    }}
                  >
                    Sharing
                  </motion.span>
                )}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Room; 