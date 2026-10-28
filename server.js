const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const clients = new Map();

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function leave(ws) {
  const c = clients.get(ws);
  if (!c) return;
  clients.delete(ws);
  if (c.room && rooms.has(c.room)) {
    const room = rooms.get(c.room);
    room.players.delete(ws);
    for (const peer of room.players) send(peer, { type: 'peer-left', id: c.id });
    if (!room.players.size) rooms.delete(c.room);
  }
}
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Porvany Tuz multiplayer server is running.\n');
});
const wss = new WebSocket.Server({ server, maxPayload: 2048 });
wss.on('connection', ws => {
  const client = { id: crypto.randomUUID(), room: null, x: 5000, y: 5000, hp: 100, name: 'Игрок' };
  clients.set(ws, client);
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'create') {
      if (client.room) leave(ws);
      let c; do { c = code(); } while (rooms.has(c));
      const room = { players: new Set([ws]) };
      rooms.set(c, room); client.room = c; client.id = 'P1';
      send(ws, { type: 'created', id: client.id, code: c, players: 1 });
      return;
    }
    if (m.type === 'join') {
      const c = String(m.code || '').toUpperCase();
      const room = rooms.get(c);
      if (!room) return send(ws, { type: 'error', message: 'Комната не найдена или сервер перезапустился.' });
      if (room.players.size >= 2) return send(ws, { type: 'error', message: 'Комната уже заполнена (максимум 2 игрока).' });
      if (client.room) leave(ws);
      client.room = c; client.id = 'P2'; room.players.add(ws);
      const existing = [...room.players].filter(p => p !== ws);
      send(ws, { type: 'joined', id: client.id, code: c, players: room.players.size });
      for (const peer of existing) {
        const peerClient = clients.get(peer);
        send(ws, { type: 'peer-joined', peer: peerClient });
        send(peer, { type: 'peer-joined', peer: client });
      }
      send(ws, { type: 'room-state', players: [...room.players].map(p => clients.get(p)) });
      return;
    }
    if (m.type === 'move') {
      if (!client.room || !rooms.has(client.room)) return;
      const x = Number(m.x), y = Number(m.y), hp = Number(m.hp);
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000) return;
      client.x = x; client.y = y;
      if (Number.isFinite(hp)) client.hp = Math.max(0, Math.min(10000, hp));
      if (typeof m.name === 'string') client.name = m.name.slice(0, 24);
      const room = rooms.get(client.room);
      for (const peer of room.players) if (peer !== ws) send(peer, { type: 'peer-move', player: client });
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});
server.listen(PORT, '0.0.0.0', () => console.log(`Multiplayer server listening on ${PORT}`));
