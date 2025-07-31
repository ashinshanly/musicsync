
import React, { useState, useEffect, useRef } from 'react';
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
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  messages: Message[];
}

const Chat: React.FC<ChatProps> = ({ socket, roomId, username, isOpen, setIsOpen, messages }) => {
  const [newMessage, setNewMessage] = useState('');
  const chatBodyRef = useRef<HTMLDivElement>(null);

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
    <>
      <div className={`chat-container ${isOpen ? 'open' : ''}`}>
        <div className="chat-window">
          <div className="chat-header">
            <h3>Live Chat</h3>
            <button onClick={() => setIsOpen(false)}>&times;</button>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message ${msg.username === username ? 'my-message' : ''} ${msg.username === 'System' ? 'system-message' : ''}`}>
                <div className="message-username">{msg.username}</div>
                <div className="message-text">{msg.text}</div>
                <div className="message-timestamp">{msg.timestamp}</div>
              </div>
            ))}
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
        </div>
      </div>
      {!isOpen && (
        <button
          className="chat-toggle-button"
          onClick={() => setIsOpen(true)}
        >
          Chat
        </button>
      )}
    </>
  );
};

export default Chat;
