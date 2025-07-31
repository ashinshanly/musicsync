
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
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  messages: Message[];
  onSendMessage: (text: string) => void;
  username: string;
}

const Chat: React.FC<ChatProps> = ({ isOpen, setIsOpen, messages, onSendMessage, username }) => {
  const [newMessage, setNewMessage] = useState('');
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage(newMessage);
    setNewMessage('');
  };

  return (
    <div className={`chat-container ${isOpen ? 'open' : 'closed'}`}>
      <div className="chat-window">
        <div className="chat-header" onClick={() => setIsOpen(!isOpen)}>
          <h3>Live Chat</h3>
          <button>{isOpen ? '▼' : '▲'}</button>
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
        <form className="chat-input" onSubmit={handleFormSubmit}>
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
  );
};

export default Chat;
