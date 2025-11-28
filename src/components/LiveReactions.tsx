import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Reaction {
    id: string;
    emoji: string;
    x: number; // Starting horizontal position (0-100%)
}

interface LiveReactionsProps {
    reactions: Reaction[];
}

// Fix for TS2786: 'AnimatePresence' cannot be used as a JSX component.
const AnimatePresenceWrapper = AnimatePresence as unknown as React.FC<React.PropsWithChildren<any>>;

const LiveReactions: React.FC<LiveReactionsProps> = ({ reactions }) => {
    const [visibleReactions, setVisibleReactions] = useState<Reaction[]>([]);
    const processedIdsRef = React.useRef<Set<string>>(new Set());

    useEffect(() => {
        // Only add reactions we haven't seen before
        const newReactions = reactions.filter(r => !processedIdsRef.current.has(r.id));

        if (newReactions.length === 0) return;

        // Mark these as processed
        newReactions.forEach(r => processedIdsRef.current.add(r.id));

        // Add new reactions to visible list
        setVisibleReactions((prev) => {
            const combined = [...prev, ...newReactions];
            // Keep only the latest 20 to avoid performance issues
            return combined.slice(-20);
        });

        // Auto-remove after animation completes
        const timer = setTimeout(() => {
            setVisibleReactions((prev) =>
                prev.filter((r) => !newReactions.find((newR) => newR.id === r.id))
            );
            // Clean up processed IDs to prevent memory leak
            newReactions.forEach(r => processedIdsRef.current.delete(r.id));
        }, 3000); // Slightly longer than animation to ensure smooth exit

        return () => clearTimeout(timer);
    }, [reactions]);

    return (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            <AnimatePresenceWrapper>
                {visibleReactions.map((reaction) => (
                    <motion.div
                        key={reaction.id}
                        initial={{
                            opacity: 0,
                            y: "95vh",
                            x: `${reaction.x}vw`,
                            scale: 0.5,
                        }}
                        animate={{
                            opacity: [0, 0.6, 0.5, 0], // Balanced visibility
                            y: "10vh",
                            x: `${reaction.x + (Math.random() - 0.5) * 10}vw`,
                            scale: [0.5, 1.1, 1, 0.7],
                            rotate: [(Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15],
                        }}
                        exit={{
                            opacity: 0,
                            scale: 0.3,
                        }}
                        transition={{
                            duration: 2.5,
                            ease: [0.4, 0.0, 0.2, 1],
                        }}
                        className="absolute text-5xl"
                        style={{
                            textShadow: "0 0 30px rgba(139, 92, 246, 0.8), 0 0 60px rgba(139, 92, 246, 0.4)",
                            filter: "drop-shadow(0 0 10px rgba(139, 92, 246, 0.6))",
                            willChange: "transform, opacity",
                        }}
                    >
                        {reaction.emoji}
                    </motion.div>
                ))}
            </AnimatePresenceWrapper>
        </div>
    );
};

export default LiveReactions;
