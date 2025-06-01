// src/pages/Host.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SocketContext } from '../App';

export default function Host() {
  const navigate = useNavigate();
  const socket = useContext(SocketContext);

  // Local state
  const [format, setFormat] = useState('Bo3');   // default dropdown = Best of 3
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!socket) return; // don’t attach listeners until socket exists

    function handleRoomUpdated(room) {
      console.log('DEBUG: handleRoomUpdated got room →', room);
      navigate('/lobby', {
        state: {
          role: 'admin',
          partyCode: room.partyCode,
          format: room.format,
          myTeamName: '',
        },
      });
    }

    function handleError(msg) {
      console.log('DEBUG: handleError got message →', msg);
      setErrorMsg(msg);
    }

    socket.on('room-updated', handleRoomUpdated);
    socket.on('error', handleError);

    return () => {
      socket.off('room-updated', handleRoomUpdated);
      socket.off('error', handleError);
    };
  }, [socket, navigate]);

  function handleSubmit(e) {
    e.preventDefault();

    // DEBUG: Log immediately to check if handleSubmit is running
    console.log('DEBUG: handleSubmit fired! socket ===', socket);

    if (!socket) {
      console.log('DEBUG: socket is still null, returning early');
      setErrorMsg('Still connecting to server… please wait a moment and try again.');
      return;
    }

    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('DEBUG: Emitting create-room →', { partyCode: newCode, format });
    socket.emit('create-room', { partyCode: newCode, format });
  }

  // ALWAYS render the form
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div className="bg-slate-800 p-6 rounded-2xl shadow-lg w-full max-w-md">
      <h1 className="text-2xl font-bold mb-6 text-center">새 로비 생성</h1>

        <form onSubmit={handleSubmit}>
          <label className="block mb-2 font-medium">
            시리즈 포맷 선택:
            <select
              className="mt-1 block w-full bg-slate-700 text-white rounded p-2"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="Bo1">1판제</option>
              <option value="Bo3">3판제</option>
              <option value="Bo5">5판제</option>
            </select>
          </label>

          {errorMsg && (
            <p className="text-red-400 text-sm mb-2">{errorMsg}</p>
          )}

          {/* The button is type="submit", so clicking it should fire handleSubmit */}
          <button
            type="submit"
            className="mt-4 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded"
          >
            로비 생성
          </button>
        </form>
      </div>
    </div>
  );
}
