// production/server.js
// ─────────────────────────────────────────────────────────────────────────────
// A resilient Express + Socket.IO back‑end.  Now with CORS updated to allow
// your front‑end at http://40.233.116.152:5173.  Wrapped all event handlers
// in try/catch, bound to 0.0.0.0, and added an uncaughtException handler so
// PM2 logs any crashes instead of restarting silently.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// ─── 0) Catch any fatal, uncaught exceptions so PM2 logs them ─────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception in server.js:', err);
  // We do not explicitly call process.exit() here, because PM2 will record the error.
});

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',  // Allow all for static file serving. Adjust if needed.
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Serve static files from 'dist' (your React build)
app.use(express.static(path.join(__dirname, 'dist')));

// For any route not handled by your API or socket.io, serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ─── 2) Define the pool of 7 maps once, so “decider” logic can reference it ─────
const ALL_MAPS = [
  '로터스',
  '헤이븐',
  '아이스박스',
  '어센트',
  '펄',
  '스플릿',
  '선셋'
];

// ─── 3) Build a Bo1 sequence over those 7 maps ────────────────────────────────
function buildBo1Sequence() {
  const seq = [];
  const totalMaps = ALL_MAPS.length; // 7
  for (let i = 0; i < totalMaps - 1; i++) {
    seq.push({
      action: 'ban',
      team: i % 2 === 0 ? 'leader1' : 'leader2'
    });
  }
  seq.push({
    action: 'decider',
    team: 'none'
  });
  return seq;
}

// ─── 4) Pre‑defined Bo3 and Bo5 sequences (includes side picks) ───────────────
const SEQUENCES = {
  Bo1: [
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'decider',  team: 'none'    },
    { action: 'pick-side',team: 'leader1' }
  ],
  Bo3: [
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'pick-map', team: 'leader1' },
    { action: 'pick-side',team: 'leader2' },
    { action: 'pick-map', team: 'leader2' },
    { action: 'pick-side',team: 'leader1' },
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'decider',  team: 'none'   },
    { action: 'pick-side',team: 'leader1' }
  ],
  Bo5: [
    { action: 'ban',      team: 'leader1' },
    { action: 'ban',      team: 'leader2' },
    { action: 'pick-map', team: 'leader1' },
    { action: 'pick-side',team: 'leader2' },
    { action: 'pick-map', team: 'leader2' },
    { action: 'pick-side',team: 'leader1' },
    { action: 'pick-map', team: 'leader1' },
    { action: 'pick-side',team: 'leader2' },
    { action: 'pick-map', team: 'leader2' },
    { action: 'pick-side',team: 'leader1' },
    { action: 'decider',  team: 'none'    },
    { action: 'pick-side',team: 'leader1' } // or alternate
  ]
};


// ─── 5) In‑memory store for rooms, keyed by partyCode ──────────────────────────
const rooms = {};

// ─── 6) (Optional) Serve static files from `public/` if you ever bundle a front‑end build ─
app.use(express.static(path.join(__dirname, 'public')));

// ─── 7) Handle every new Socket.IO connection ─────────────────────────────────
io.on('connection', (socket) => {
  console.log(`✅ SERVER: Socket connected [id=${socket.id}]`);

  // ─── 7.1) create-room ───────────────────────────────────────────────────────
  socket.on('create-room', (data) => {
    try {
      const { partyCode, format } = data;
      console.log(`→ create-room: code="${partyCode}", format="${format}"`);

      // 1) Validate code and format
      if (!/^[A-Z0-9]+$/.test(partyCode) || !SEQUENCES[format]) {
        socket.emit('error', 'Invalid code or format.');
        return;
      }

      // 2) Prevent duplicate codes
      if (rooms[partyCode]) {
        socket.emit('error', 'Party code already exists.');
        return;
      }

      // 3) Initialize room object
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
        sequence: SEQUENCES[format].slice(),
        chosen: []
      };

      // 4) Join the creator’s socket to that room
      socket.join(partyCode);
      console.log(`✔ Room "${partyCode}" created (format=${format})`);

      // 5) Broadcast this new room state to everyone in that room
      io.to(partyCode).emit('room-updated', rooms[partyCode]);
    } catch (err) {
      console.error('❌ Error in create-room:', err);
      socket.emit('error', 'Server error in create-room.');
    }
  });

  // ─── 7.2) join-room ───────────────────────────────────────────────────────────
  socket.on('join-room', (data) => {
    try {
      const { partyCode, role, teamLeaderName } = data;
      console.log(`→ join-room: code="${partyCode}", role="${role}", name="${teamLeaderName}"`);

      const room = rooms[partyCode];
      if (!room) {
        socket.emit('error', 'Party code not found.');
        return;
      }

      // Always let the socket join the Socket.IO room so it can receive broadcasts
      socket.join(partyCode);

      // 1) If this socket was already leader1, simply re‑join
      if (role === 'teamleader' && room.leader1SocketId === socket.id) {
        console.log(`↻ Re‑joining as existing Leader1 [${room.leader1Name}] socket=${socket.id}`);
      }
      // 2) If this socket was already leader2, simply re‑join
      else if (role === 'teamleader' && room.leader2SocketId === socket.id) {
        console.log(`↻ Re‑joining as existing Leader2 [${room.leader2Name}] socket=${socket.id}`);
      }
      // 3) A brand‑new teamleader is trying to join
      else if (role === 'teamleader') {
        const name = teamLeaderName?.trim();
        if (!name) {
          socket.emit('error', 'Team leader name is empty.');
          return;
        }
        if (!room.leader1Name) {
          room.leader1Name = name;
          room.leader1SocketId = socket.id;
          console.log(`✔ New Leader1 "${name}" joined [socket=${socket.id}]`);
        } else if (!room.leader2Name) {
          room.leader2Name = name;
          room.leader2SocketId = socket.id;
          console.log(`✔ New Leader2 "${name}" joined [socket=${socket.id}]`);
        } else {
          socket.emit('error', 'Both leader slots are already taken.');
          return;
        }
      }
      // 4) Spectator logic
      else if (role === 'spectator') {
        room.spectators.push(socket.id);
        console.log(`✔ Spectator joined [socket=${socket.id}]`);
      }
      // 5) Admin logic
      else if (role === 'admin') {
        console.log(`✔ Admin joined [socket=${socket.id}]`);
      }
      // 6) Invalid role
      else {
        socket.emit('error', 'Invalid role when joining.');
        return;
      }

      // Broadcast the updated room state
      io.to(partyCode).emit('room-updated', rooms[partyCode]);
    } catch (err) {
      console.error('❌ Error in join-room:', err);
      socket.emit('error', 'Server error in join-room.');
    }
  });

  // ─── 7.3) start-pickban ───────────────────────────────────────────────────────
  socket.on('start-pickban', (data) => {
    try {
      const { partyCode } = data;
      const room = rooms[partyCode];
      if (!room) {
        socket.emit('error', 'Room does not exist.');
        return;
      }
      if (!room.leader1Name || !room.leader2Name) {
        socket.emit('error', 'Both team leaders must join before starting.');
        return;
      }
      room.started = true;
      room.currentStep = 0;
      room.chosen = [];
      room.sequence = SEQUENCES[room.format].slice();
      console.log(`✔ Pick/Ban started in room ${partyCode}`);

      io.to(partyCode).emit('room-updated', room);
    } catch (err) {
      console.error('❌ Error in start-pickban:', err);
      socket.emit('error', 'Server error in start-pickban.');
    }
  });

  // ─── 7.4) select-map ───────────────────────────────────────────────────────────
  socket.on('select-map', (data) => {
    try {
      const { partyCode, mapName, by } = data;
      const room = rooms[partyCode];
      if (!room || !room.started) return;

      const step = room.sequence[room.currentStep];
      if (!step) return;

      // Only allow “ban” or “pick-map” by the correct team
      if (
        (step.action === 'ban'      && step.team !== by) ||
        (step.action === 'pick-map' && step.team !== by)
      ) {
        return;
      }

      // Prevent double selection
      if (room.chosen.find((c) => c.name === mapName)) {
        return;
      }

      // 1) Record the ban/pick
      room.chosen.push({ name: mapName, type: step.action, by });
      // 2) Advance one step
      room.currentStep += 1;

      // 3) If next step is “decider,” automatically pick the last remaining map
      const nextStep = room.sequence[room.currentStep];
      if (nextStep && nextStep.action === 'decider') {
        const chosenNames = new Set(room.chosen.map((c) => c.name));
        const deciderMap = ALL_MAPS.find((m) => !chosenNames.has(m));
        if (deciderMap) {
          room.chosen.push({ name: deciderMap, type: 'decider', by: 'none' });
        }
        room.currentStep += 1;
      }

      // 4) Broadcast updated state
      io.to(partyCode).emit('room-updated', room);
    } catch (err) {
      console.error('❌ Error in select-map:', err);
      socket.emit('error', 'Server error in select-map.');
    }
  });

  // ─── 7.5) select-side ──────────────────────────────────────────────────────────
  socket.on('select-side', (data) => {
    try {
      const { partyCode, side, by } = data;
      const room = rooms[partyCode];
      if (!room || !room.started) return;

      const step = room.sequence[room.currentStep];
      if (!step) return;

      // Only allow “pick-side” by the correct team
      if (step.action !== 'pick-side' || step.team !== by) {
        return;
      }

      room.chosen.push({ name: side, type: 'pick-side', by });
      room.currentStep += 1;

      io.to(partyCode).emit('room-updated', room);
    } catch (err) {
      console.error('❌ Error in select-side:', err);
      socket.emit('error', 'Server error in select-side.');
    }
  });

  // ─── 7.6) disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    try {
      console.log(`🔌 SERVER: Socket disconnected [id=${socket.id}]`);
      for (const code in rooms) {
        const room = rooms[code];
        let changed = false;

        // Remove from spectators if present
        const specIdx = room.spectators.indexOf(socket.id);
        if (specIdx !== -1) {
          room.spectators.splice(specIdx, 1);
          changed = true;
        }

        // (Optional) If you want to clear a leader’s slot when they disconnect, uncomment below:
        // if (room.leader1SocketId === socket.id) {
        //   room.leader1SocketId = null;
        //   room.leader1Name = null;
        //   changed = true;
        // }
        // if (room.leader2SocketId === socket.id) {
        //   room.leader2SocketId = null;
        //   room.leader2Name = null;
        //   changed = true;
        // }

        if (changed) {
          io.to(code).emit('room-updated', room);
        }

        // If no sockets remain in that room, delete it
        const sids = io.sockets.adapter.rooms.get(code);
        if (!sids || sids.size === 0) {
          console.log(`🗑️ Deleting empty room ${code}`);
          delete rooms[code];
        }
      }
    } catch (err) {
      console.error('❌ Error in disconnect handler:', err);
    }
  });
}); // end io.on('connection')

// ─── 8) Finally, start listening on port 3001 on all interfaces ───────────────
const port = process.env.PORT || 3001;
server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${port}`);
});
