import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Lobby from './components/Lobby';
import Room from './components/Room';
import CreateRoom from './components/CreateRoom';

function App() {
  return (
    <Router basename="/musicsync">
      <div className="min-h-screen bg-primary text-white">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
