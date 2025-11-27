import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
    id: string;
    username: string;
    text: string;
    timestamp: string;
}

interface ChatProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    currentUser: string;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, currentUser }) => {
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            onSendMessage(newMessage);
            setNewMessage("");
        }
    };

    // Generate a consistent color for a username
    const getUserColor = (username: string) => {
        const colors = [
            "text-red-400", "text-orange-400", "text-amber-400",
            "text-green-400", "text-emerald-400", "text-teal-400",
            "text-cyan-400", "text-sky-400", "text-blue-400",
            "text-indigo-400", "text-violet-400", "text-purple-400",
            "text-fuchsia-400", "text-pink-400", "text-rose-400"
        ];
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-white/10 bg-white/5 backdrop-blur-md rounded-t-xl">
                <h2 className="text-xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
                    Live Chat
                </h2>
            </div>

            <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-black/20 backdrop-blur-sm custom-scrollbar">
                {/* @ts-ignore */}
                <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                        const isMe = msg.username === currentUser;
                        const isSystem = msg.username === "System";
                        const userColor = getUserColor(msg.username);

                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"
                                    } ${isSystem ? "justify-center" : ""}`}
                            >
                                {!isSystem && (
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg
                      ${isMe ? "bg-gradient-to-br from-purple-500 to-indigo-600" : "bg-gradient-to-br from-gray-600 to-gray-700"}
                    `}
                                    >
                                        {msg.username.charAt(0).toUpperCase()}
                                    </div>
                                )}

                                <div
                                    className={`max-w-[80%] p-3 rounded-2xl shadow-md backdrop-blur-sm
                    ${isSystem
                                            ? "bg-gray-800/80 text-gray-300 text-xs py-1 px-4 rounded-full border border-gray-700"
                                            : isMe
                                                ? "bg-gradient-to-br from-purple-600/90 to-indigo-600/90 text-white rounded-br-none border border-purple-500/30"
                                                : "bg-gray-800/90 text-gray-200 rounded-bl-none border border-gray-700/50"
                                        }
                  `}
                                >
                                    {!isSystem && (
                                        <div className={`text-xs font-bold mb-1 ${isMe ? "text-purple-200" : userColor}`}>
                                            {msg.username}
                                        </div>
                                    )}
                                    <div className="text-sm break-words leading-relaxed">{msg.text}</div>
                                    {!isSystem && (
                                        <div className={`text-[10px] mt-1 text-right opacity-70 ${isMe ? "text-purple-200" : "text-gray-500"}`}>
                                            {msg.timestamp}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-md rounded-b-xl">
                <form
                    className="flex items-center gap-2 relative"
                    onSubmit={handleSubmit}
                >
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-black/30 border border-white/10 rounded-full pl-4 pr-12 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-black/50 transition-all duration-300"
                    />
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="absolute right-1.5 top-1.5 p-1.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5 transform rotate-90"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                        </svg>
                    </motion.button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
