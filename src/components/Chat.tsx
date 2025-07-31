
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';
import './Chat.css';

interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: string;
}

interface ChatProps {
  socket: Socket | undefined;
  roomId: string | undefined;
  username: string;
}

const Chat: React.FC<ChatProps> = ({ socket, roomId, username }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('chat-message', (message: Message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    socket.on('user-joined-chat', (username: string) => {
      const message: Message = {
        id: `${Date.now()}`,
        username: 'System',
        text: `${username} has joined the room.`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    socket.on('user-left-chat', (username: string) => {
      const message: Message = {
        id: `${Date.now()}`,
        username: 'System',
        text: `${username} has left the room.`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    return () => {
      socket.off('chat-message');
      socket.off('user-joined-chat');
      socket.off('user-left-chat');
    };
  }, [socket]);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      const message: Message = {
        id: `${Date.now()}`,
        username,
        text: newMessage,
        timestamp: new Date().toLocaleTimeString(),
      };
      socket.emit('chat-message', { roomId, message });
      setNewMessage('');
    }
  };

  return (
    <div className={`chat-container ${isOpen ? 'open' : 'closed'}`}>
      <motion.div
        className="chat-window"
        initial={{ x: '100%' }}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <div className="chat-header">
          <h3>Live Chat</h3>
          <button onClick={() => setIsOpen(false)}>&times;</button>
        </div>
        <div className="chat-body" ref={chatBodyRef}>
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`chat-message ${msg.username === username ? 'my-message' : ''} ${msg.username === 'System' ? 'system-message' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="message-username">{msg.username}</div>
                <div className="message-text">{msg.text}</div>
                <div className="message-timestamp">{msg.timestamp}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <form className="chat-input" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
          />
          <button type="submit">Send</button>
        </form>
      </motion.div>
      {!isOpen && (
        <motion.button
          className="chat-toggle-button"
          onClick={() => setIsOpen(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Chat
        </motion.button>
      )}
    </div>
  );
};

export default Chat;
