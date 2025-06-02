// production/server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Allow CORS from Vite dev (http://localhost:5173)
const io = new Server(server, {
  cors: {
    origin: 'http://40.233.116.152:5173',
    methods: ['GET', 'POST'],
  }
});

const port = process.env.PORT || 3001;

// In‑memory store for rooms, keyed by partyCode
// Each room looks like:
// {
//   partyCode,
//   format,                 // "Bo1", "Bo3", or "Bo5"
//   leader1Name: string or null,
//   leader1SocketId: string or null,
//   leader2Name: string or null,
//   leader2SocketId: string or null,
//   spectators: [ socketId, … ],
//   started: boolean,
//   currentStep: number,      // index into sequence[]
//   sequence: [ … ],          // array of steps ({ action, team })
//   chosen: [ … ],            // array of { name, type, by }
// }
const rooms = {};

// Build Bo1 sequence: alternate bans until 1 map remains, then decider
function buildBo1Sequence() {
  const seq = [];
  const totalMaps = 7; // ← change this to 7 if you want a Bo1 over seven maps
  for (let i = 0; i < totalMaps - 1; i++) {
    seq.push({
      action: 'ban',
      team: i % 2 === 0 ? 'leader1' : 'leader2',
    });
  }
  seq.push({
    action: 'decider',
    team: 'none',
  });
  return seq;
}


// Hard‐coded Bo3 and Bo5 sequences (Bo5 now includes side picks)
const SEQUENCES = {
  Bo1: buildBo1Sequence(),

  Bo3: [
    { action: 'ban',      team: 'leader1' }, // 1) Home bans 1
    { action: 'ban',      team: 'leader2' }, // 2) Away bans 1
    { action: 'pick-map', team: 'leader1' }, // 3) Home picks Game 1 map
    { action: 'pick-side',team: 'leader2' }, // 4) Away picks Game 1 side
    { action: 'pick-map', team: 'leader2' }, // 5) Away picks Game 2 map
    { action: 'pick-side',team: 'leader1' }, // 6) Home picks Game 2 side
    { action: 'ban',      team: 'leader1' }, // 7) Home bans 1 (remaining pool)
    { action: 'ban',      team: 'leader2' }, // 8) Away bans 1 (remaining pool)
    { action: 'decider',  team: 'none'   }, // 9) Decider (last map left)
    { action: 'pick-side',team: 'leader1' }  // 10) Home picks Game 3 side
  ],

  Bo5: [
    { action: 'ban',      team: 'leader1' }, // 1) Home bans 1
    { action: 'ban',      team: 'leader2' }, // 2) Away bans 1
    { action: 'pick-map', team: 'leader1' }, // 3) Home picks Game 1 map
    { action: 'pick-side',team: 'leader2' }, // 4) Away picks Game 1 side
    { action: 'pick-map', team: 'leader2' }, // 5) Away picks Game 2 map
    { action: 'pick-side',team: 'leader1' }, // 6) Home picks Game 2 side
    { action: 'ban',      team: 'leader2' }, // 7) Away bans 1 (remaining pool)
    { action: 'ban',      team: 'leader1' }, // 8) Home bans 1 (remaining pool)
    { action: 'pick-map', team: 'leader1' }, // 9) Home picks Game 3 map
    { action: 'pick-side',team: 'leader2' }, // 10) Away picks Game 3 side
    { action: 'ban',      team: 'leader2' }, // 11) Away bans 1 (pool down to 2)
    { action: 'ban',      team: 'leader1' }, // 12) Home bans 1 (leaves decider)
    { action: 'decider',  team: 'none'   },  // 13) Decider (last map left)
    { action: 'pick-side',team: 'leader1' }  // 14) Home picks Game 4 side (decider)
  ],
};

// (Optional) Serve static files if you have a production frontend build
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log(`SERVER: Socket connected [id=${socket.id}]`);

  // ─── create-room ───────────────────────────────────────────────────
  socket.on('create-room', (data) => {
    const { partyCode, format } = data;
    console.log(`SERVER: create-room → code="${partyCode}", format="${format}"`);

    // 1) Validate partyCode (alphanumeric uppercase) and format existence
    if (!/^[A-Z0-9]+$/.test(partyCode) || !SEQUENCES[format]) {
      socket.emit('error', 'Invalid code or format.');
      return;
    }

    // 2) Prevent duplicate partyCodes
    if (rooms[partyCode]) {
      socket.emit('error', 'Party code already exists.');
      return;
    }

    // 3) Initialize the new room object
    rooms[partyCode] = {
      partyCode,
      format,
      leader1Name: null,
      leader1SocketId: null,
      leader2Name: null,
      leader2SocketId: null,
      spectators: [],
      started: false,
      currentStep: 0,
      sequence: SEQUENCES[format].slice(), // clone the array
      chosen: [],
    };

    // 4) Join the creator’s socket to that partyCode room
    socket.join(partyCode);
    console.log(`SERVER: Room "${partyCode}" created (format=${format})`);

    // 5) Immediately broadcast the new room state to everyone in that room
    io.to(partyCode).emit('room-updated', rooms[partyCode]);
  });

  // ─── UPDATED join-room ─────────────────────────────────────────────────
  socket.on('join-room', (data) => {
    const { partyCode, role, teamLeaderName } = data;
    console.log(
      `SERVER: join-room → code="${partyCode}", role="${role}", teamLeaderName="${teamLeaderName}"`
    );

    const room = rooms[partyCode];
    if (!room) {
      socket.emit('error', 'Party code not found. Please check and try again.');
      return;
    }

    // Always let the socket join the Socket.io room so it can receive broadcasts
    socket.join(partyCode);

    // 1) If this same socket was already leader1, just re‐join (no reassignment)
    if (role === 'teamleader' && room.leader1SocketId === socket.id) {
      console.log(
        `SERVER: Re‐joining as existing Leader1 [${room.leader1Name}] → socket=${socket.id}`
      );
    }
    // 2) If this same socket was already leader2, just re‐join (no reassignment)
    else if (role === 'teamleader' && room.leader2SocketId === socket.id) {
      console.log(
        `SERVER: Re‐joining as existing Leader2 [${room.leader2Name}] → socket=${socket.id}`
      );
    }
    // 3) Else – a brand-new “teamleader” is trying to join
    else if (role === 'teamleader') {
      const name = teamLeaderName?.trim();
      if (!name) {
        socket.emit('error', 'Team leader name is empty.');
        return;
      }

      if (!room.leader1Name) {
        room.leader1Name = name;
        room.leader1SocketId = socket.id;
        console.log(
          `SERVER: New Leader1 "${name}" joined room ${partyCode} [socket=${socket.id}]`
        );
      } else if (!room.leader2Name) {
        room.leader2Name = name;
        room.leader2SocketId = socket.id;
        console.log(
          `SERVER: New Leader2 "${name}" joined room ${partyCode} [socket=${socket.id}]`
        );
      } else {
        socket.emit('error', 'Both leader slots are already taken.');
        return;
      }
    }
    // 4) Spectator logic (unchanged)
    else if (role === 'spectator') {
      room.spectators.push(socket.id);
      console.log(`SERVER: Spectator [id=${socket.id}] joined room ${partyCode}`);
    }
    // 5) Admin logic (unchanged)
    else if (role === 'admin') {
      console.log(`SERVER: Admin [id=${socket.id}] joined room ${partyCode}`);
    }
    // 6) Any other role is invalid
    else {
      socket.emit('error', 'Invalid role when joining.');
      return;
    }

    // Finally, broadcast the updated room to everyone in that partyCode
    io.to(partyCode).emit('room-updated', rooms[partyCode]);
  });

  // ─── start-pickban ─────────────────────────────────────────────────
  socket.on('start-pickban', (data) => {
    const { partyCode } = data;
    const room = rooms[partyCode];
    if (!room) {
      socket.emit('error', 'Room does not exist.');
      return;
    }
    // Ensure both teamleaders have joined
    if (!room.leader1Name || !room.leader2Name) {
      socket.emit('error', 'Both team leaders must join before starting.');
      return;
    }
    room.started = true;
    room.currentStep = 0;
    room.chosen = [];
    // Reset the sequence to a fresh clone
    room.sequence = SEQUENCES[room.format].slice();
    console.log(`SERVER: Pick/Ban started in room ${partyCode}`);
    io.to(partyCode).emit('room-updated', room);
  });

// ─── select-map ───────────────────────────────────────────────────
socket.on('select-map', (data) => {
  const { partyCode, mapName, by } = data;
  const room = rooms[partyCode];
  if (!room || !room.started) return;

  const step = room.sequence[room.currentStep];
  if (!step) return;

  // Only allow “ban” or “pick-map” from the correct team.
  // (We do NOT expect the client to ever send “decider” – server will handle that itself.)
  if (
    (step.action === 'ban' && step.team !== by) ||
    (step.action === 'pick-map' && step.team !== by)
  ) {
    return;
  }

  // Prevent double‐picks/bans
  if (room.chosen.find((m) => m.name === mapName)) {
    return;
  }

  // 1) Add this ban/pick to chosen[]
  room.chosen.push({ name: mapName, type: step.action, by });
  // 2) Advance to next step
  room.currentStep += 1;

  // 3) Now check if the next step is a “decider”
  const nextStep = room.sequence[room.currentStep];
  if (nextStep && nextStep.action === 'decider') {
    // We need to find the single remaining map that hasn’t been chosen yet.
    // First, build a set of every map name that’s already in chosen[]:
    const chosenNames = new Set(room.chosen.map((c) => c.name));

    // Next, define the full pool of maps. This must match exactly the 7 maps you allow:
    //   로터스, 헤이븐, 아이스박스, 어센트, 펄, 스플릿, 선셋
    const ALL_MAPS = [
      '로터스',
      '헤이븐',
      '아이스박스',
      '어센트',
      '펄',
      '스플릿',
      '선셋',
    ];

    // Find the one map not yet in chosenNames:
    const deciderMap = ALL_MAPS.find((m) => !chosenNames.has(m));
    if (deciderMap) {
      // Append a “decider” entry
      room.chosen.push({ name: deciderMap, type: 'decider', by: 'none' });
    }
    // Advance past the decider step as well
    room.currentStep += 1;
  }

  // 4) Broadcast the updated room state
  io.to(partyCode).emit('room-updated', room);
});


  // ─── select-side ──────────────────────────────────────────────────
  socket.on('select-side', (data) => {
    const { partyCode, side, by } = data; // side = 'Attack' or 'Defense'
    const room = rooms[partyCode];
    if (!room || !room.started) return;

    const step = room.sequence[room.currentStep];
    if (!step) return;

    // Only allow side pick if step.action === 'pick-side' and step.team matches
    if (step.action !== 'pick-side' || step.team !== by) {
      return;
    }

    // Record the side pick, advance step, broadcast
    room.chosen.push({ name: side, type: 'pick-side', by });
    room.currentStep += 1;
    io.to(partyCode).emit('room-updated', room);
  });

  // ─── disconnect ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`SERVER: Socket disconnected [id=${socket.id}]`);
    for (const code in rooms) {
      const room = rooms[code];
      let changed = false;

      // Remove from spectators if present
      const specIdx = room.spectators.indexOf(socket.id);
      if (specIdx !== -1) {
        room.spectators.splice(specIdx, 1);
        changed = true;
      }

      // (Optional) If a leader disconnects, you could clear their slot here.
      // Currently, we leave leader1Name/leader2Name intact so they can rejoin.
      // e.g.:
      // if (room.leader1SocketId === socket.id) {
      //   room.leader1SocketId = null;
      //   changed = true;
      // }
      // if (room.leader2SocketId === socket.id) {
      //   room.leader2SocketId = null;
      //   changed = true;
      // }

      if (changed) {
        io.to(code).emit('room-updated', room);
      }

      // If no sockets remain in this room, delete it
      const sids = io.sockets.adapter.rooms.get(code);
      if (!sids || sids.size === 0) {
        console.log(`SERVER: Deleting empty room ${code}`);
        delete rooms[code];
      }
    }
  });
});

server.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
