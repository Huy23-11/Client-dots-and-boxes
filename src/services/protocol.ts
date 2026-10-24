// src/services/protocol.ts
//
// Giao thức game giữa client và Java server (qua bridge.js).
//
// Gói tin (đã được bridge bọc/tháo frame TCP) có dạng chuỗi:
//     OPCODE,,payload
// Các trường trong payload ngăn cách nhau bằng dấu ';'.
//
// Nguồn tham chiếu phía server:
//   - Decoder.java / UserRepresentative.java : opcode client gửi lên
//   - Encoder.java / MatchMakingManager.java / Room.java : opcode server trả về

import type { BoardSize, RankTier } from "../data"

// ─── Opcode ───────────────────────────────────────────────────────────────────

export const OP = {
  // client → server
  JOIN_QUICK_MATCH: "JOIN_QUICK_MATCH",
  CANCEL_QUICK_MATCH: "CANCEL_QUICK_MATCH",
  MAKE_MOVE: "MAKE_MOVE",
  SURRENDER: "SURRENDER",

  // server → client
  REPLY_JOIN_QUICK_MATCH: "REPLY_JOIN_QUICK_MATCH",
  REPLY_CANCEL_QUICK_MATCH: "REPLY_CANCEL_QUICK_MATCH",
  MATCH_FOUND: "MATCH_FOUND",
  MOVE_RESULT: "MOVE_RESULT",
  INVALID_MOVE: "INVALID_MOVE",
  GAME_OVER: "GAME_OVER",
  OPPONENT_SURRENDER: "OPPONENT_SURRENDER",
  OPPONENT_DISCONNECT: "OPPONENT_DISCONNECT",
} as const

// Server hiện chỉ tạo bàn 3x3 (MatchMakingManager.createMatch: createRoom(p1, p2, 3, 3)).
// Đây là số ô mỗi cạnh: 3x3 ô = 4x4 điểm.
export const SUPPORTED_BOARD_SIZE: BoardSize = 3

// ─── Gửi lên server ───────────────────────────────────────────────────────────

const buildMessage = (opcode: string, params = "") => `${opcode},,${params}`

// JOIN_QUICK_MATCH,,<kích thước bàn> — server hiện chưa đọc tham số này nhưng luôn cần có ",,"
export const msgJoinQuickMatch = (boardSize: number) =>
  buildMessage(OP.JOIN_QUICK_MATCH, String(boardSize))

export const msgCancelQuickMatch = () => buildMessage(OP.CANCEL_QUICK_MATCH)

// MAKE_MOVE,,r1;c1;r2;c2 — tọa độ 2 ĐIỂM (dot) của cạnh, bắt đầu từ 0
export const msgMakeMove = (r1: number, c1: number, r2: number, c2: number) =>
  buildMessage(OP.MAKE_MOVE, `${r1};${c1};${r2};${c2}`)

export const msgSurrender = () => buildMessage(OP.SURRENDER)

// ─── Nhận từ server ───────────────────────────────────────────────────────────

// Tách "OPCODE,,payload" (payload có thể chứa ",,")
export function splitServerMessage(
  raw: unknown
): { opcode: string; params: string } | null {
  if (typeof raw !== "string") return null
  const idx = raw.indexOf(",,")
  if (idx < 0) return { opcode: raw, params: "" }
  return { opcode: raw.slice(0, idx), params: raw.slice(idx + 2) }
}

const toInt = (s: string | undefined): number | null => {
  if (s === undefined) return null
  const n = Number.parseInt(s.trim(), 10)
  return Number.isNaN(n) ? null : n
}

const toBool = (s: string | undefined) => (s ?? "").trim() === "true"

// ── MATCH_FOUND ──
// roomId;opponentUsername;opponentDisplayName;opponentRanking;role
// role = 1: đi trước, role = 2: đi sau
export interface MatchInfo {
  roomId: number
  opponentUsername: string
  opponentDisplayName: string
  opponentRanking: number
  role: 1 | 2
}

// Thông tin trận đang chơi dùng cho GamePage
export interface ActiveMatch extends MatchInfo {
  boardSize: BoardSize
  opponentRankTier: RankTier
}

export function parseMatchFound(params: string): MatchInfo | null {
  const f = params.split(";")
  if (f.length < 5) return null
  const roomId = toInt(f[0])
  const ranking = toInt(f[3])
  const role = toInt(f[4])
  if (roomId === null || ranking === null || (role !== 1 && role !== 2)) return null
  return {
    roomId,
    opponentUsername: f[1],
    opponentDisplayName: f[2] || f[1],
    opponentRanking: ranking,
    role,
  }
}

// ── MOVE_RESULT ──
// playedBy;r1;c1;r2;c2;completedBoxes;p1Score;p2Score;nextTurn;bonusTurn;gameOver;winnerId;isDraw
//  - playedBy / nextTurn / winnerId là USER ID (không phải role)
//  - completedBoxes: "r:c|r:c" hoặc "NONE"
//  - nextTurn = -1 khi ván đã kết thúc; winnerId = 0 nếu hòa, -1 nếu chưa có
export interface MoveResultMsg {
  playedBy: number
  r1: number
  c1: number
  r2: number
  c2: number
  completedBoxes: { r: number; c: number }[]
  p1Score: number
  p2Score: number
  nextTurn: number
  bonusTurn: boolean
  gameOver: boolean
  winnerId: number
  isDraw: boolean
}

export function parseMoveResult(params: string): MoveResultMsg | null {
  const f = params.split(";")
  if (f.length < 13) return null

  const playedBy = toInt(f[0])
  const r1 = toInt(f[1])
  const c1 = toInt(f[2])
  const r2 = toInt(f[3])
  const c2 = toInt(f[4])
  const p1Score = toInt(f[6])
  const p2Score = toInt(f[7])
  const nextTurn = toInt(f[8])
  const winnerId = toInt(f[11])
  if (
    playedBy === null || r1 === null || c1 === null || r2 === null || c2 === null ||
    p1Score === null || p2Score === null || nextTurn === null || winnerId === null
  ) {
    return null
  }

  const completedBoxes: { r: number; c: number }[] = []
  const boxesStr = f[5].trim()
  if (boxesStr && boxesStr !== "NONE") {
    for (const part of boxesStr.split("|")) {
      const [br, bc] = part.split(":").map((x) => toInt(x))
      if (br !== null && bc !== null && br !== undefined && bc !== undefined) {
        completedBoxes.push({ r: br, c: bc })
      }
    }
  }

  return {
    playedBy, r1, c1, r2, c2,
    completedBoxes,
    p1Score, p2Score, nextTurn,
    bonusTurn: toBool(f[9]),
    gameOver: toBool(f[10]),
    winnerId,
    isDraw: toBool(f[12]),
  }
}

// ── GAME_OVER ──
// winnerId;p1Score;p2Score;isDraw;reason
//  reason: GAME_FINISHED | SURRENDER | DISCONNECT
export interface GameOverMsg {
  winnerId: number
  p1Score: number
  p2Score: number
  isDraw: boolean
  reason: string
}

export function parseGameOver(params: string): GameOverMsg | null {
  const f = params.split(";")
  if (f.length < 5) return null
  const winnerId = toInt(f[0])
  const p1Score = toInt(f[1])
  const p2Score = toInt(f[2])
  if (winnerId === null || p1Score === null || p2Score === null) return null
  return {
    winnerId,
    p1Score,
    p2Score,
    isDraw: toBool(f[3]),
    reason: f[4].trim(),
  }
}

// ── INVALID_MOVE ── payload là mã lý do hoặc câu thông báo của server
const INVALID_MOVE_TEXT: Record<string, string> = {
  NOT_YOUR_TURN: "Chưa đến lượt của bạn",
  NOT_IN_MATCH: "Bạn không ở trong trận đấu nào",
  MATCH_ENDED: "Trận đấu đã kết thúc",
  ROOM_NOT_BELONG: "Bạn không thuộc phòng này",
  INVALID_PARAMS: "Nước đi không hợp lệ",
  INVALID_NUMBER_FORMAT: "Nước đi không hợp lệ",
}

export function describeInvalidMove(reason: string): string {
  const key = reason.trim()
  return INVALID_MOVE_TEXT[key] ?? (key || "Nước đi không hợp lệ")
}

// ─── Chuyển đổi cạnh <-> tọa độ điểm ──────────────────────────────────────────
//
// Client lưu cạnh dạng:
//   h[r][c] : cạnh ngang nối điểm (r,c)-(r,c+1)
//   v[r][c] : cạnh dọc   nối điểm (r,c)-(r+1,c)
// Server dùng tọa độ 2 điểm: r1;c1;r2;c2.

export interface EdgeRef {
  type: "h" | "v"
  r: number
  c: number
}

export function edgeToDots(e: EdgeRef): [number, number, number, number] {
  return e.type === "h"
    ? [e.r, e.c, e.r, e.c + 1]
    : [e.r, e.c, e.r + 1, e.c]
}

export function dotsToEdge(
  r1: number,
  c1: number,
  r2: number,
  c2: number
): EdgeRef | null {
  if (r1 === r2 && Math.abs(c1 - c2) === 1) {
    return { type: "h", r: r1, c: Math.min(c1, c2) }
  }
  if (c1 === c2 && Math.abs(r1 - r2) === 1) {
    return { type: "v", r: Math.min(r1, r2), c: c1 }
  }
  return null
}