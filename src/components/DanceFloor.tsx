import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface User {
    id: string;
    name: string;
    isSharing: boolean;
    upvotes?: number;
    downvotes?: number;
}

interface DanceFloorProps {
    users: User[];
    stream?: MediaStream;
    isSharing: boolean;
    currentUserId?: string;
}

// Curated list of fun avatars
const AVATARS = [
    "👽", "🤖", "👻", "👾", "🤡", "👹", "👺", "💀", "☠️", "🎃",
    "🦁", "🐯", "🐻", "🐨", "🐼", "🐸", "🐙", "🦄", "🐲", "🦕",
    "🦖", "🐳", "🐬", "🐠", "🐡", "🦈", "🦋", "🐞", "🐝", "🕷️",
    "🕺", "💃", "👯", "🕴️", "🧘", "🤸", "🏋️", "🤹", "🧙", "🧛",
    "🧟", "🧞", "🧜", "🧚", "🎸", "🎷", "🥁", "🎻", "🎺", "🎤"
];

// Deterministic avatar generation
const getAvatar = (username: string) => {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATARS.length;
    return AVATARS[index];
};

// Fix for TS2786: 'AnimatePresence' cannot be used as a JSX component.
const AnimatePresenceWrapper = AnimatePresence as unknown as React.FC<React.PropsWithChildren<any>>;

const DanceFloor: React.FC<DanceFloorProps> = ({ users, stream, isSharing, currentUserId }) => {
    const [beatIntensity, setBeatIntensity] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number>();

    // Initialize Audio Analysis
    useEffect(() => {
        if (!stream) {
            setBeatIntensity(0);
            return;
        }

        const initAudio = () => {
            try {
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }

                if (audioContextRef.current.state === "suspended") {
                    audioContextRef.current.resume();
                }

                // Create analyser if not exists
                if (!analyserRef.current) {
                    analyserRef.current = audioContextRef.current.createAnalyser();
                    analyserRef.current.fftSize = 256; // Smaller FFT for performance
                    analyserRef.current.smoothingTimeConstant = 0.8;
                }

                // Connect stream
                if (sourceRef.current) {
                    sourceRef.current.disconnect();
                }
                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                sourceRef.current.connect(analyserRef.current);

                analyze();
            } catch (err) {
                console.error("Error initializing dance floor audio:", err);
            }
        };

        const analyze = () => {
            if (!analyserRef.current) return;

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);

            // Focus on bass frequencies (approx 20Hz - 150Hz)
            // With fftSize 256 and sampleRate 44100, each bin is ~172Hz
            // So we check the first few bins
            const bassEnergy = dataArray.slice(0, 4).reduce((a, b) => a + b, 0) / 4;

            // Normalize to 0-1 range with a threshold
            const threshold = 100; // Minimum energy to trigger beat
            let intensity = 0;

            if (bassEnergy > threshold) {
                intensity = (bassEnergy - threshold) / (255 - threshold);
                // Add some "snap" to the beat
                intensity = Math.pow(intensity, 1.5);
            }

            // Smooth decay
            setBeatIntensity(prev => Math.max(intensity, prev * 0.85));

            animationFrameRef.current = requestAnimationFrame(analyze);
        };

        initAudio();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (sourceRef.current) {
                sourceRef.current.disconnect();
            }
            // Don't close context as it might be shared or expensive to recreate
        };
    }, [stream]);

    // Calculate grid columns based on user count for optimal layout
    const gridStyle = useMemo(() => {
        const count = users.length;
        let minSize = "100px";

        if (count > 50) minSize = "60px";
        else if (count > 20) minSize = "80px";
        else if (count <= 4) minSize = "150px";

        return {
            gridTemplateColumns: `repeat(auto-fill, minmax(${minSize}, 1fr))`
        };
    }, [users.length]);

    return (
        <div className="bg-black/40 backdrop-blur-xl rounded-xl p-6 border border-white/10 relative overflow-hidden min-h-[300px] flex flex-col">
            {/* Dynamic Spotlight Effect */}
            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                style={{
                    background: `radial-gradient(circle at 50% 50%, rgba(139, 92, 246, ${0.1 + beatIntensity * 0.2}) 0%, transparent 70%)`,
                    opacity: stream ? 1 : 0.3
                }}
            />

            <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className="text-lg font-semibold text-gray-300 flex items-center gap-2">
                    <span className="text-2xl">🪩</span>
                    The Dance Floor
                    <span className="text-xs bg-white/10 px-2 py-1 rounded-full text-gray-400">
                        {users.length} {users.length === 1 ? 'Dancer' : 'Dancers'}
                    </span>
                </h3>

                {/* Vibe Indicator */}
                {stream && (
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-20 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-75 ease-out"
                                style={{ width: `${beatIntensity * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div
                className="grid gap-4 relative z-10 flex-grow content-start transition-all duration-500"
                style={gridStyle}
            >
                <AnimatePresenceWrapper>
                    {users.map((user) => {
                        const isMe = user.id === currentUserId;
                        const isDJ = user.isSharing;
                        const avatar = getAvatar(user.name);

                        // Calculate individual bounce delay based on user ID hash
                        // This creates a "wave" effect instead of everyone bouncing perfectly in sync
                        const hash = user.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
                        const delay = (hash % 5) * 0.05;

                        return (
                            <motion.div
                                key={user.id}
                                layout
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="relative group"
                            >
                                <div
                                    className={`
                    aspect-square rounded-2xl flex flex-col items-center justify-center p-2
                    transition-colors duration-300
                    ${isDJ ? 'bg-purple-500/20 border-purple-500/50' : 'bg-white/5 border-white/10'}
                    border hover:bg-white/10 hover:border-white/30
                  `}
                                >
                                    {/* Avatar Container with Beat Animation */}
                                    <div
                                        className="text-4xl md:text-5xl mb-2 transition-transform duration-75 will-change-transform"
                                        style={{
                                            transform: stream
                                                ? `scale(${1 + beatIntensity * 0.3}) translateY(${beatIntensity * -10}px)`
                                                : 'none',
                                            transitionDelay: `${delay}s`
                                        }}
                                    >
                                        {/* Idle Animation when no music */}
                                        <div className={!stream ? "animate-float" : ""}>
                                            {avatar}
                                        </div>
                                    </div>

                                    {/* Name Tag */}
                                    <div className="w-full text-center">
                                        <p className="text-xs font-medium truncate text-gray-300 group-hover:text-white transition-colors">
                                            {user.name}
                                        </p>
                                        {isMe && <span className="text-[10px] text-purple-400 font-bold">YOU</span>}
                                        {isDJ && <span className="text-[10px] text-pink-400 font-bold block">DJ</span>}
                                    </div>

                                    {/* Glow Effect on Beat */}
                                    {stream && (
                                        <div
                                            className="absolute inset-0 rounded-2xl bg-purple-500/20 blur-xl transition-opacity duration-75 pointer-events-none"
                                            style={{ opacity: beatIntensity }}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresenceWrapper>
            </div>
        </div>
    );
};

export default DanceFloor;
