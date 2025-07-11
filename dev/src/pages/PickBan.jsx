// src/pages/PickBan.jsx
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SocketContext } from '../App';
import { motion, AnimatePresence } from 'framer-motion';

const mapData = [
  { key: '어센트',   file: '어센트.png' },
  { key: '바인드',   file: '바인드.png' },
  { key: '코로드',   file: '코로드.png' },
  { key: '헤이븐',   file: '헤이븐.png' },
  { key: '아이스박스', file: '아이스박스.png' },
  { key: '로터스',   file: '로터스.png' },
  { key: '선셋',     file: '선셋.png' },
];

export default function PickBan() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const socket = useContext(SocketContext);

  // Redirect to Home if required state is missing
  if (!state || !state.role || !state.partyCode || !state.sequence) {
    navigate('/', { replace: true });
    return null;
  }

  const {
    role,           // "admin" | "teamleader" | "spectator"
    partyCode,
    format,
    myTeamName,
    sequence: initialSequence,
    chosen: initialChosen
  } = state;

  // Local component state
  const [roomState, setRoomState] = useState(null);
  const [sequence, setSequence] = useState(initialSequence || []);
  const [chosen, setChosen] = useState(initialChosen || []);
  const [currentStep, setCurrentStep] = useState(0);
  const [leader1Name, setLeader1Name] = useState('');
  const [leader2Name, setLeader2Name] = useState('');

  // Refs for sounds
  const banSound   = useRef(null);
  const pickSound  = useRef(null);
  const clickSound = useRef(null);

  // Previous chosen length so we play sound once per new entry
  const prevChosenLengthRef = useRef(initialChosen.length);

  // Ref for auto-scrolling the chosen list
  const seqContainerRef = useRef(null);

  // Initialize Audio objects once on mount
  useEffect(() => {
    banSound.current   = new Audio('/assets/sounds/ban.mp3');
    pickSound.current  = new Audio('/assets/sounds/pick.mp3');
    clickSound.current = new Audio('/assets/sounds/click.mp3');
  }, []);

  // Join room & listen for updates
  useEffect(() => {
    socket.emit('join-room', {
      partyCode,
      role,
      teamLeaderName: role === 'teamleader' ? myTeamName : ''
    });

    function handleRoomUpdated(room) {
      setRoomState(room);
      setSequence(room.sequence);
      setChosen(room.chosen);
      setCurrentStep(room.currentStep);
      setLeader1Name(room.leader1Name || '');
      setLeader2Name(room.leader2Name || '');

      // Play sound for new chosen entry
      const prevLen = prevChosenLengthRef.current;
      const newLen = room.chosen.length;
      if (newLen > prevLen) {
        const lastEntry = room.chosen[newLen - 1];
        if (lastEntry.type === 'ban') {
          banSound.current.currentTime = 0;
          banSound.current.play();
        } else if (lastEntry.type === 'pick-map') {
          pickSound.current.currentTime = 0;
          pickSound.current.play();
        } else if (lastEntry.type === 'pick-side') {
          clickSound.current.currentTime = 0;
          clickSound.current.play();
        } else if (lastEntry.type === 'decider') {
          pickSound.current.currentTime = 0;
          pickSound.current.play();
        }
      }
      prevChosenLengthRef.current = newLen;
    }

    function handleError(msg) {
      alert(`Error: ${msg}`);
      navigate('/', { replace: true });
    }

    socket.on('room-updated', handleRoomUpdated);
    socket.on('error', handleError);

    return () => {
      socket.off('room-updated', handleRoomUpdated);
      socket.off('error', handleError);
    };
  }, [socket, navigate, partyCode, role, myTeamName]);

  // Auto-scroll chosen sequence to bottom whenever it changes
  useEffect(() => {
    if (seqContainerRef.current) {
      seqContainerRef.current.scrollTop = seqContainerRef.current.scrollHeight;
    }
  }, [chosen]);

  // Show loading until first update arrives
  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen text-xl text-white bg-slate-900">
        로비 로딩중...
      </div>
    );
  }

  // Compute "Next:" text based on current step
  const step = sequence[currentStep] || null;
  let nextText = '';
  if (step) {
    if (step.action === 'ban') {
      const actor = step.team === 'leader1' ? leader1Name : leader2Name;
      nextText = `다음: ${actor || '…'} BAN`;
    } else if (step.action === 'pick-map') {
      const actor = step.team === 'leader1' ? leader1Name : leader2Name;
      nextText = `다음: ${actor || '…'} PICK`;
    } else if (step.action === 'pick-side') {
      const actor = step.team === 'leader1' ? leader1Name : leader2Name;
      nextText = `다음: ${actor || '…'} PICK SIDE`;
    } else if (step.action === 'decider') {
      nextText = '결정자: 마지막 맵 자동 선택';
    }
  } else {
    nextText = '픽밴 완료';
  }

  // Determine if this client is leader1 or leader2
  let amLeader1 = false, amLeader2 = false;
  if (role === 'teamleader') {
    if (myTeamName === leader1Name) amLeader1 = true;
    else if (myTeamName === leader2Name) amLeader2 = true;
  }
  let isMyTurn = false;
  if (step && step.team === 'leader1' && amLeader1) isMyTurn = true;
  if (step && step.team === 'leader2' && amLeader2) isMyTurn = true;

  // Build a set of already-chosen names so we can style them
  const chosenMapNames = new Set(
    chosen
      .filter(c => ['ban', 'pick-map', 'decider'].includes(c.type))
      .map(c => c.name)
  );

  // Extract the decider entry (if present) from `chosen`
  const deciderEntry = chosen.find(c => c.type === 'decider');

  // Handle map thumbnail click (emit to server)
  function handleMapClick(mapName) {
    if (!isMyTurn || !step) return;
    // Only allow clicks when action is ban or pick-map
    if (step.action !== 'ban' && step.action !== 'pick-map') return;

    socket.emit('select-map', {
      partyCode,
      mapName,
      by: amLeader1 ? 'leader1' : 'leader2'
    });
  }

  // Handle side pick click (emit to server)
  function handleSideClick(side) {
    if (!isMyTurn || !step) return;
    socket.emit('select-side', {
      partyCode,
      side,
      by: amLeader1 ? 'leader1' : 'leader2'
    });
  }

  // Determine which sections to render
  const showSideOverlay = step && step.action === 'pick-side' && isMyTurn;

  return (
    <div className="min-h-screen bg-slate-900 text-white px-6 py-6">
      {/* ─────────── Header (slides in from top) ─────────── */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-slate-800 p-5 rounded-2xl shadow-lg flex justify-between items-start"
      >
        {/* Left: Party Code / Host / Join / Format */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">로비 코드: {partyCode}</h2>
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">1팀:</span> {leader1Name || '—'}{' '}
          </p>
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">2팀:</span> {leader2Name || '—'}
          </p>
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">형식:</span> {format}
          </p>
        </div>

        {/* Right: Next / Waiting */}
        <div className="text-right space-y-2">
          <p className="text-3xl font-semibold text-yellow-300">{nextText}</p>
          {step && !isMyTurn && (
            <p className="text-xl italic text-gray-400">상대 팀 선택 대기중...</p>
          )}
        </div>

      </motion.div>

      {/* ─────────── Banner Announcing Decider (if chosen) ─────────── */}
      {deciderEntry && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 bg-yellow-700 px-4 py-3 rounded-lg shadow-inner text-center text-white font-semibold"
        >
          ⚡ 결정자 맵: {deciderEntry.name} ⚡
        </motion.div>
      )}

      {/* ─────────── Main Content: Maps (80%) + Chosen Sequence (20%) ─────────── */}
      <div className="mt-6 flex gap-6">
        {/* ──────── Map Grid (80% width) ──────── */}
        <div className="w-4/5 grid grid-cols-3 gap-5">
        {mapData.map(({ key, file }, idx) => {
          // Determine if this tile is currently clickable:
          const isClickable =
            isMyTurn &&
            (step?.action === 'ban' || step?.action === 'pick-map') &&
            !chosenMapNames.has(key);

          // Determine status: "banned", "picked", "decider", or "available"
          let status = 'available';
          const foundBan = chosen.find(c => c.name === key && c.type === 'ban');
          const foundPick = chosen.find(c => c.name === key && c.type === 'pick-map');
          const foundDecider = chosen.find(c => c.name === key && c.type === 'decider');
          if (foundDecider) status = 'decider';
          else if (foundPick) status = 'picked';
          else if (foundBan) status = 'banned';

          // Slide‐in animation offsets
          const slideX = idx % 2 === 0 ? -50 : 50;
          const delay = 0.1 + idx * 0.05;

          // Base border / extra classes based on status
          let borderClass = 'border-transparent';
          let extraClasses = '';
          if (status === 'banned') {
            extraClasses = 'filter grayscale opacity-50';
          } else if (status === 'picked') {
            borderClass = 'border-green-400 ring-2 ring-green-400';
          } else if (status === 'decider') {
            borderClass = 'border-yellow-400 ring-4 ring-yellow-400';
          }

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: slideX }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay }}
              className={`
                relative
                ${isClickable ? 'cursor-pointer hover:border-yellow-400' : 'cursor-not-allowed'}
                overflow-hidden rounded-lg border-2
                ${borderClass}
                bg-gradient-to-br from-slate-700 to-slate-800
                transition-all duration-200
                ${extraClasses}
              `}
              onClick={() => isClickable && handleMapClick(key)}
            >
              <img
                src={`/assets/maps/${file}`}
                alt={key}
                className="w-full h-40 object-cover"
              />
              <div className="bg-black bg-opacity-60 py-2 text-center">
                <span className="font-semibold text-white">{key}</span>
              </div>
            </motion.div>
          );
        })}

        </div>

        {/* ──────── Chosen Sequence Log (20% width) ──────── */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-1/5 bg-slate-800 p-5 rounded-2xl shadow-inner max-h-[calc(100vh-200px)] overflow-y-auto"
        >
          <h3 className="text-xl font-semibold mb-4">기록</h3>
          <div ref={seqContainerRef} className="space-y-2">
          {chosen.length > 0 ? (
            chosen.map((item, idx) => {
              const actorName = item.by === 'leader1' ? leader1Name
                              : item.by === 'leader2' ? leader2Name
                              : '';
              let textColor = 'text-white';
              let desc = '';

              if (item.type === 'ban') {
                desc = `BANNED ${item.name}`;
                textColor = 'text-red-500';
              }
              else if (item.type === 'pick-map') {
                desc = `PICKED ${item.name}`;
                textColor = 'text-green-500';
              }
              else if (item.type === 'pick-side') {
                // Find the map that this side-pick refers to:
                const prev = chosen[idx - 1];
                const mapForSide = prev ? prev.name : '…';
                desc = `PICKED ${item.name} on ${mapForSide}`;
                if (item.name === 'ATTACK') textColor = 'text-orange-500';
                else if (item.name === 'DEFENSE') textColor = 'text-blue-500';
              }
              else if (item.type === 'decider') {
                desc = `DECIDER ${item.name}`;
                textColor = 'text-yellow-300';
              }

              // Special: Do NOT show actorName for decider!
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + idx * 0.05 }}
                  className="flex items-center space-x-2"
                >
                  {item.type !== 'decider' && (
                    <span className="font-semibold text-blue-200">
                      {actorName || '…'}:
                    </span>
                  )}
                  <span className={`${textColor} font-medium`}>
                    {desc}
                  </span>
                </motion.div>
              );
            })
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="italic text-gray-400"
            >
              기록이 없습니다.
            </motion.p>
          )}

          </div>
        </motion.div>
      </div>

      {/* ─────────── Side‑Pick Overlay (covers entire screen only for active picker) ─────────── */}
      <AnimatePresence>
        {showSideOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-slate-800 p-6 rounded-2xl shadow-xl w-80 text-center"
            >
              <h3 className="text-2xl font-bold text-yellow-300 mb-4">픽 사이드 선택</h3>
              <div className="flex flex-col space-y-4">
                <button
                  onClick={() => handleSideClick('ATTACK')}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold"
                >
                  공격
                </button>
                <button
                  onClick={() => handleSideClick('DEFENSE')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold"
                >
                  수비
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
