// src/pages/Lobby.jsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
import { SocketContext } from '../App';

export default function Lobby() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const socket = useContext(SocketContext);

  // If someone navigates here incorrectly, redirect them back to Home
  if (!state || !state.role || !state.partyCode) {
    navigate('/', { replace: true });
    return null;
  }

  const { role, partyCode, format, myTeamName } = state;
  const [roomState, setRoomState] = useState(null);

  useEffect(() => {
    // 1) As soon as this component mounts, re‑emit join-room so we get the latest state
    socket.emit('join-room', {
      partyCode,
      role,
      teamLeaderName: role === 'teamleader' ? myTeamName : '',
    });

    // 2) Listen for “room-updated”
    socket.on('room-updated', (updatedRoom) => {
      setRoomState(updatedRoom);

      // If pick/ban has started, navigate everyone to /pickban
      if (updatedRoom.started) {
        const myName = role === 'teamleader' ? myTeamName : '';
        navigate('/pickban', {
          state: {
            role,
            partyCode,
            format,
            myTeamName: myName,
            sequence: updatedRoom.sequence,
            chosen: updatedRoom.chosen,
          },
        });
      }
    });

    // 3) Listen for any errors (e.g. invalid code)
    socket.on('error', (msg) => {
      alert(`Error: ${msg}`);
      navigate('/', { replace: true });
    });

    return () => {
      socket.off('room-updated');
      socket.off('error');
    };
  }, [socket, navigate, role, partyCode, myTeamName]);

  // While we’re waiting for the server’s first “room-updated”, show a loading state
  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen text-xl text-white bg-slate-900">
        Connecting to lobby…
      </div>
    );
  }

  // Destructure the updated room fields
  const { leader1Name, leader2Name } = roomState;

  // We only show “Start Pick/Ban” for the admin once both leaders have joined
  const showStartButton =
    role === 'admin' && leader1Name && leader2Name && !roomState.started;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-xl mx-auto bg-slate-800 p-6 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold mb-4">로비 코드: {partyCode}</h2>
        <p className="mb-2">
          <span className="font-semibold">팀장 1:</span>{' '}
          {leader1Name || '첫 번째 팀장이 참가할 때까지 대기중...'}
        </p>
        <p className="mb-4">
          <span className="font-semibold">팀장 2:</span>{' '}
          {leader2Name || '두 번째 팀장이 참가할 때까지 대기중...'}
        </p>

        {role === 'teamleader' && !roomState.started && (
          <p className="mt-4 text-yellow-300 font-medium">
            관리자가 픽밴을 시작할 때까지 대기중...
          </p>
        )}

        {role === 'spectator' && !roomState.started && (
          <p className="mt-4 text-yellow-300 font-medium">
            관전자로 대기중...
          </p>
        )}

        {showStartButton && (
          <button
            className="mt-6 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded"
            onClick={() => {
              socket.emit('start-pickban', { partyCode });
            }}
          >
            픽밴 시작
          </button>
        )}
      </div>
    </div>
  );
}
