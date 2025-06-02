// src/App.jsx
import React, { createContext, useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
// Import socket.io-client as before
import { io } from 'socket.io-client';

import Home    from './pages/Home';
import Join    from './pages/Join';
import Host    from './pages/Host';
import Lobby   from './pages/Lobby';
import PickBan from './pages/PickBan';

export const SocketContext = createContext(null);

export default function App() {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // ◀︎ Use a _relative_ connection (no IP/port) so Vite can proxy it.
    const newSocket = io();
    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/host"    element={<Host />} />
        <Route path="/join"    element={<Join />} />
        <Route path="/lobby"   element={<Lobby />} />
        <Route path="/pickban" element={<PickBan />} />
      </Routes>
    </SocketContext.Provider>
  );
}
