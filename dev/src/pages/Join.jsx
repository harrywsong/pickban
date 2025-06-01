// src/pages/Join.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SocketContext } from '../App';

export default function Join() {
  const socket = useContext(SocketContext);
  const navigate = useNavigate();

  const [role, setRole] = useState('teamleader');
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Listen for "room-updated" to know when join was successful
    function onRoomUpdated(updatedRoom) {
      // If we successfully joined as teamleader, navigate to /lobby
      if (role === 'teamleader') {
        navigate('/lobby', {
          state: {
            role,
            partyCode: updatedRoom.partyCode,
            format: updatedRoom.format,
            myTeamName: teamName.trim(),
          },
        });
      } else {
        // Spectators also go to Lobby (no team name needed)
        navigate('/lobby', {
          state: {
            role,
            partyCode: updatedRoom.partyCode,
            format: updatedRoom.format,
            myTeamName: '',
          },
        });
      }
    }

    function onError(msg) {
      setError(msg);
    }

    socket.on('room-updated', onRoomUpdated);
    socket.on('error', onError);

    return () => {
      socket.off('room-updated', onRoomUpdated);
      socket.off('error', onError);
    };
  }, [socket, navigate, role, teamName]);

  const handleJoin = () => {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = teamName.trim();

    if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
      setError('유효하지 않은 로비 코드입니다. 대문자 A–Z와 숫자 0–9만 허용됩니다.');
      return;
    }
    if (role === 'teamleader' && !trimmedName) {
      setError('팀장으로 들어가려면 팀명을 입력해야 합니다.');
      return;
    }

    setError('');
    console.log('CLIENT (Join): Emitting join-room →', {
      partyCode: trimmedCode,
      role,
      teamLeaderName: trimmedName,
    });
    socket.emit('join-room', {
      partyCode: trimmedCode,
      role,
      teamLeaderName: trimmedName,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-slate-900 text-white">
      <h2 className="text-4xl font-bold mb-6">로비 참가</h2>
      <div className="flex flex-col gap-4 w-full max-w-md">
        <fieldset>
          <legend className="mb-1 font-medium">입장 유형</legend>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="joinRole"
                value="teamleader"
                checked={role === 'teamleader'}
                onChange={() => setRole('teamleader')}
              />
              팀장으로 입장
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="joinRole"
                value="spectator"
                checked={role === 'spectator'}
                onChange={() => setRole('spectator')}
              />
              관전자로 입장
            </label>
          </div>
        </fieldset>

        <label className="block">
          <span className="block mb-1 font-medium">로비 코드</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="예: ABC123"
            className="w-full px-3 py-2 bg-slate-800 rounded-md text-white"
          />
        </label>

        {role === 'teamleader' && (
          <label className="block">
            <span className="block mb-1 font-medium">팀 이름</span>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="팀 이름"
              className="w-full px-3 py-2 bg-slate-800 rounded-md text-white"
            />
          </label>
        )}

        {error && <p className="text-red-500">{error}</p>}

        <button
          onClick={handleJoin}
          className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          로비 참가
        </button>
      </div>
    </div>
  );
}
