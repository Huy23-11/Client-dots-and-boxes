/**
 * bridge.js - TCP ↔ WebSocket Gateway
 *
 * Công dụng: Convert TCP Socket messages từ Java Server
 *            thành WebSocket messages cho React Browser
 *
 * Installation:
 *   npm init -y
 *   npm install ws
 *   node bridge.js
 */

const WebSocket = require('ws');
const net = require('net');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚙️  CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PORT_WEBSOCKET = 8443;  // React connects here
const PORT_TCP = 5000;         // Java server here
const HOST_TCP = 'localhost';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📡 START WEBSOCKET SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const wss = new WebSocket.Server({ port: PORT_WEBSOCKET });

console.log(`
╔════════════════════════════════════════════════╗
║        🌉 TCP ↔ WebSocket Bridge               ║
╚════════════════════════════════════════════════╝

📡 WebSocket Server listening on: ws://localhost:${PORT_WEBSOCKET}
🔗 Will forward to Java Server:   tcp://${HOST_TCP}:${PORT_TCP}

Waiting for React clients to connect...
`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔌 HANDLE CLIENT CONNECTION (REACT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wss.on('connection', (ws) => {
  console.log('\n✅ React Client connected via WebSocket');

  let tcpSocket = null;
  let connected = false;

  // ─────────────────────────────────────────────────────────────
  // 1️⃣  Connect to Java Server
  // ─────────────────────────────────────────────────────────────

  tcpSocket = net.createConnection(
    { port: PORT_TCP, host: HOST_TCP },
    () => {
      console.log('   ✅ Bridge connected to Java Server');
      connected = true;

      // Inform React that server is connected
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Kết nối tới server thành công'
      }));
    }
  );

  // ─────────────────────────────────────────────────────────────
  // 2️⃣  Receive message from React (WebSocket)
  // ─────────────────────────────────────────────────────────────

  ws.on('message', (msg) => {
    if (!connected) {
      console.log('   ⚠️  Message received but server not connected');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Chưa kết nối tới server'
      }));
      return;
    }

    console.log(`\n📤 BROWSER → BRIDGE:\n   "${msg}"`);

    // Encode message to TCP frame format
    const frame = encodeFrame(msg);
    console.log(`   Frame size: ${frame.length} bytes`);
    console.log(`   Frame hex: ${frame.toString('hex').substring(0, 40)}...`);

    // Send frame to Java Server
    tcpSocket.write(frame);
  });

  // ─────────────────────────────────────────────────────────────
  // 3️⃣  Receive data from Java Server (TCP Socket)
  // ─────────────────────────────────────────────────────────────

  // TCP là stream: 1 lần 'data' có thể chứa nhiều frame (vd REPLY_LOGIN + SET_SESSION_ID)
  // hoặc chỉ một phần frame → gom vào buffer rồi tách từng frame theo độ dài.
  let pending = Buffer.alloc(0);

  tcpSocket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);

    while (pending.length >= 16) {
      const payloadLength = pending.readInt32BE(0);
      const frameSize = 16 + payloadLength;
      if (pending.length < frameSize) break; // chưa đủ frame, chờ thêm dữ liệu

      const message = pending.slice(16, frameSize).toString('utf-8');
      pending = pending.slice(frameSize);

      console.log(`\n📥 SERVER → BRIDGE → BROWSER:\n   "${message}"`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', data: message }));
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // ⚠️  Error Handling
  // ─────────────────────────────────────────────────────────────

  tcpSocket.on('error', (err) => {
    console.error('\n❌ TCP Socket Error:', err.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Kết nối server bị lỗi'
    }));
    connected = false;
  });

  tcpSocket.on('close', () => {
    console.log('\n🔌 TCP connection closed');
    connected = false;
    ws.send(JSON.stringify({
      type: 'disconnected'
    }));
  });

  ws.on('close', () => {
    console.log('\n🔌 WebSocket client disconnected');
    if (tcpSocket) tcpSocket.end();
  });

  ws.on('error', (err) => {
    console.error('\n❌ WebSocket Error:', err.message);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 HELPER FUNCTIONS: Encode/Decode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ✂️  Encode message to TCP frame
 *
 * Format:
 * [PayloadLength:4][SessionId:4][MessageId:4][NumParts:2][PartId:2][Payload:n]
 *
 * Total: 16 + n bytes
 *
 * Example: "LOGIN,,user;pass" (16 bytes)
 *          → Frame: 16 + 30 = 46 bytes
 */
function encodeFrame(message) {
  // Convert UTF-8 string to bytes
  const payload = Buffer.from(message, 'utf-8');
  const length = payload.length;

  // Allocate buffer for header + payload
  const frame = Buffer.allocUnsafe(16 + length);

  // Write header (Big Endian format)
  frame.writeInt32BE(length, 0);           // Byte 0-3:   Payload length
  frame.writeInt32BE(-1, 4);               // Byte 4-7:   Session ID (-1 = not authenticated)
  frame.writeInt32BE(0, 8);                // Byte 8-11:  Message ID
  frame.writeInt16BE(1, 12);               // Byte 12-13: Number of parts
  frame.writeInt16BE(0, 14);               // Byte 14-15: Part ID

  // Write payload
  payload.copy(frame, 16);

  return frame;
}

/**
 * 📖 Decode TCP frame back to message
 *
 * Skip 16-byte header, extract payload
 */
function decodeFrame(buffer) {
  // Header is 16 bytes, payload starts at byte 16
  const payload = buffer.slice(16);
  return payload.toString('utf-8');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 FRAME EXAMPLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
Message: "LOGIN,,QuangHuy99;123456"  (30 bytes)

Frame bytes:
┌─────────────────────────────────────────────────────────┐
│ Offset │ Bytes  │ Type   │ Value          │ Meaning     │
├─────────────────────────────────────────────────────────┤
│ 0-3    │ 1E 00 00 00 │ Int32  │ 30      │ Payload len │
│ 4-7    │ FF FF FF FF │ Int32  │ -1      │ Session ID  │
│ 8-11   │ 00 00 00 00 │ Int32  │ 0       │ Message ID  │
│ 12-13  │ 00 01       │ Int16  │ 1       │ Num parts   │
│ 14-15  │ 00 00       │ Int16  │ 0       │ Part ID     │
│ 16-45  │ 4C 4F 47... │ String │ LOGIN.. │ Payload     │
└─────────────────────────────────────────────────────────┘

Total: 46 bytes (16 header + 30 payload)
*/

console.log(`

📝 Frame Structure Example:
   Message: "LOGIN,,QuangHuy99;123456" (30 bytes payload)

   Encoded Frame: 46 bytes
   ┌──────┬────────┬────────┬──────┬───────┬──────────────────┐
   │ Len  │ SessId │ MsgId  │Parts │PartId │ Payload          │
   ├──────┼────────┼────────┼──────┼───────┼──────────────────┤
   │ 0x1E │ 0xFFFF │ 0x0000 │ 0x01 │ 0x00  │ LOGIN,,QuangHuy99;
   │ (30) │  (-1)  │   (0)  │  (1) │  (0)  │ 123456...        │
   └──────┴────────┴────────┴──────┴───────┴──────────────────┘
`);