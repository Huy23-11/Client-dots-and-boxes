// Giao thức giữa React và Java server (qua bridge.js): OPCODE,,payload
import type { BoardSize, RankTier } from "../data"

export const OP = {
  JOIN_QUICK_MATCH: "JOIN_QUICK_MATCH",
  CANCEL_QUICK_MATCH: "CANCEL_QUICK_MATCH",
  MAKE_MOVE: "MAKE_MOVE",
  SURRENDER: "SURRENDER",
  REPLY_JOIN_QUICK_MATCH: "REPLY_JOIN_QUICK_MATCH",
  REPLY_CANCEL_QUICK_MATCH: "REPLY_CANCEL_QUICK_MATCH",
  MATCH_FOUND: "MATCH_FOUND",
  MOVE_RESULT: "MOVE_RESULT",
  INVALID_MOVE: "INVALID_MOVE",
  GAME_OVER: "GAME_OVER",
  OPPONENT_SURRENDER: "OPPONENT_SURRENDER",
  OPPONENT_DISCONNECT: "OPPONENT_DISCONNECT",
  RESTORE_MATCH: "RESTORE_MATCH",
  GET_LEADERBOARD: "GET_LEADERBOARD",
  REPLY_LEADERBOARD: "REPLY_LEADERBOARD",
  GET_USERS_AVAILABLE_LIST: "GET_USERS_AVAILABLE_LIST",
  REPLY_USERS_AVAILABLE_LIST: "REPLY_USERS_AVAILABLE_LIST",
  INVITE: "INVITE",
  INVITED: "INVITED",
  INVITED_BY: "INVITED_BY",

  RESPONSE_INVITE: "RESPONSE_INVITE",
  RESPONSE_INVITATION: "RESPONSE_INVITATION",
  REPLY_RESPONSE_INVITE: "REPLY_RESPONSE_INVITE",

  SHARE_ROOM: "SHARE_ROOM",
  REPLY_SHARE_ROOM: "REPLY_SHARE_ROOM",

  CANCEL_SHARE_ROOM: "CANCEL_SHARE_ROOM",
  REPLY_CANCEL_SHARE_ROOM: "REPLY_CANCEL_SHARE_ROOM",

  FIND_ROOM: "FIND_ROOM",
  REPLY_FIND_ROOM: "REPLY_FIND_ROOM",
} as const

const toInt = (value: string | undefined): number | null => {
  if (value === undefined || !/^-?\d+$/.test(value.trim())) return null
  const parsed = Number(value.trim())
  return Number.isSafeInteger(parsed) ? parsed : null
}
const toBool = (s: string | undefined) => (s ?? "").trim() === "true"

// RESTORE_MATCH,,roomId;opponentUsername;opponentDisplayName;opponentUserId;
// role;boardSize;p1Score;p2Score;nextTurn;p1UserId;edges;boxes
// edges: r1:c1:r2:c2|... hoặc NONE; boxes: r:c:ownerId|... hoặc NONE
export interface RestoreMatchMsg {
  roomId: number
  opponentUsername: string
  opponentDisplayName: string
  opponentUserId: number
  role: 1 | 2
  boardSize: BoardSize
  p1Score: number
  p2Score: number
  nextTurn: number
  p1UserId: number
  edges: [number, number, number, number][]
  boxes: { r: number; c: number; ownerId: number }[]
}

export function parseRestoreMatch(params: string): RestoreMatchMsg | null {
  const f = params.split(";")
  if (f.length < 12) return null
  const roomId = toInt(f[0])
  const opponentUserId = toInt(f[3])
  const role = toInt(f[4])
  const parsedBoardSize = toInt(f[5])
  const boardSize = parsedBoardSize !== null && [3, 4, 5].includes(parsedBoardSize)
    ? parsedBoardSize as BoardSize
    : null
  const p1Score = toInt(f[6])
  const p2Score = toInt(f[7])
  const nextTurn = toInt(f[8])
  const p1UserId = toInt(f[9])
  if (roomId === null || opponentUserId === null || (role !== 1 && role !== 2) ||
    boardSize === null || p1Score === null || p2Score === null ||
    nextTurn === null || p1UserId === null || p1UserId <= 0 || opponentUserId <= 0 ||
    p1Score < 0 || p2Score < 0) return null

  const edges: [number, number, number, number][] = []
  const edgesStr = f[10].trim()
  if (edgesStr && edgesStr !== "NONE") {
    for (const part of edgesStr.split("|")) {
      const v = part.split(":")
      if (v.length !== 4) return null
      const nums = v.map(toInt)
      if (nums.some(x => x === null)) return null
      edges.push(nums as [number, number, number, number])
    }
  }

  const boxes: { r: number; c: number; ownerId: number }[] = []
  const boxesStr = f[11].trim()
  if (boxesStr && boxesStr !== "NONE") {
    for (const part of boxesStr.split("|")) {
      const v = part.split(":")
      if (v.length !== 3) return null
      const [r, c, ownerId] = v.map(toInt)
      if (r === null || c === null || ownerId === null) return null
      boxes.push({ r, c, ownerId })
    }
  }
  return { roomId, opponentUsername: f[1], opponentDisplayName: f[2] || f[1],
    opponentUserId, role, boardSize, p1Score, p2Score, nextTurn, p1UserId, edges, boxes }
}

// Server hỗ trợ kích thước 3x3, 4x4 và 5x5; mặc định UI là 3x3.
export const SUPPORTED_BOARD_SIZE: BoardSize = 3
const buildMessage = (opcode: string, params = "") => `${opcode},,${params}`
// Client gửi đúng format mà Java MatchMakingManager hiểu: 3x3, 4x4, 5x5 hoặc ANY.
export const msgJoinQuickMatch = (boardSize: BoardSize | "any") =>
  buildMessage(
    OP.JOIN_QUICK_MATCH,
    boardSize === "any" ? "ANY" : `${boardSize}x${boardSize}`
  )
export const msgCancelQuickMatch = () => buildMessage(OP.CANCEL_QUICK_MATCH)
export const msgMakeMove = (r1: number, c1: number, r2: number, c2: number) =>
  buildMessage(OP.MAKE_MOVE, `${r1};${c1};${r2};${c2}`)
export const msgSurrender = () => buildMessage(OP.SURRENDER)

export function splitServerMessage(raw: unknown): { opcode: string; params: string } | null {
  if (typeof raw !== "string") return null
  const idx = raw.indexOf(",,")
  if (idx < 0) return { opcode: raw, params: "" }
  return { opcode: raw.slice(0, idx), params: raw.slice(idx + 2) }
}

export interface LeaderboardRow {
  rank: number
  userId: number
  username: string
  displayName: string
  ranking: number
  totalWins: number
}

export function parseLeaderboard(
  params: string
): LeaderboardRow[] {
  if (!params.trim()) return []

  const result: LeaderboardRow[] = []

  for (const row of params.split("|")) {
    const fields = row.split(";")

    if (fields.length !== 6) continue

    const [
      rankText,
      userIdText,
      username,
      displayName,
      rankingText,
      winsText,
    ] = fields

    const rank = Number(rankText)
    const userId = Number(userIdText)
    const ranking = Number(rankingText)
    const totalWins = Number(winsText)

    if (
      !Number.isSafeInteger(rank) ||
      !Number.isSafeInteger(userId) ||
      !Number.isSafeInteger(ranking) ||
      !Number.isSafeInteger(totalWins) ||
      rank < 1 ||
      userId < 1 ||
      !username
    ) {
      continue
    }

    result.push({
      rank,
      userId,
      username,
      displayName,
      ranking,
      totalWins,
    })
  }

  return result
}

export type ServerUserStatus =
  | "online"
  | "ingame"
  | "offline"
  | "queuing"

export interface ServerUser {
  userId: number
  username: string
  displayName: string
  status: ServerUserStatus
}

export function parseUsersList(params: string): ServerUser[] {
  if (!params.trim()) return []

  const users: ServerUser[] = []

  for (const row of params.split("|")) {
    const fields = row.split(":")

    if (fields.length !== 4) continue

    const [idText, username, displayName, statusText] = fields
    const userId = Number(idText)

    if (!Number.isSafeInteger(userId) || userId <= 0 || !username) {
      continue
    }

    const validStatuses: ServerUserStatus[] = [
      "online",
      "ingame",
      "offline",
      "queuing",
    ]

    const status: ServerUserStatus =
      validStatuses.includes(statusText as ServerUserStatus)
        ? (statusText as ServerUserStatus)
        : "offline"

    users.push({
      userId,
      username,
      displayName,
      status,
    })
  }

  return users
}

export interface MatchInfo {
  roomId: number
  opponentUsername: string
  opponentDisplayName: string
  opponentRanking: number
  role: 1 | 2
  boardSize: BoardSize
}
export interface ActiveMatch extends MatchInfo {
  opponentRankTier: RankTier
}
export function parseMatchFound(params: string): MatchInfo | null {
  const f = params.split(";")
  // Java gửi: roomId;opponentUsername;opponentDisplayName;opponentRanking;role;boardSize
  if (f.length < 6) return null

  const roomId = toInt(f[0])
  const ranking = toInt(f[3])
  const role = toInt(f[4])
  const sizeMatch = f[5].trim().toLowerCase().match(/^([345])(?:x\1)?$/)
  const boardSize = sizeMatch ? Number(sizeMatch[1]) as BoardSize : null

  if (roomId === null || ranking === null || (role !== 1 && role !== 2) || boardSize === null) {
    return null
  }

  return {
    roomId,
    opponentUsername: f[1],
    opponentDisplayName: f[2] || f[1],
    opponentRanking: ranking,
    role,
    boardSize,
  }
}

export interface MoveResultMsg {
  playedBy: number; r1: number; c1: number; r2: number; c2: number
  completedBoxes: { r: number; c: number }[]
  p1Score: number; p2Score: number; nextTurn: number
  bonusTurn: boolean; gameOver: boolean; winnerId: number; isDraw: boolean
}
export function parseMoveResult(params: string): MoveResultMsg | null {
  const f = params.split(";")
  if (f.length < 13) return null
  const playedBy = toInt(f[0]), r1 = toInt(f[1]), c1 = toInt(f[2])
  const r2 = toInt(f[3]), c2 = toInt(f[4]), p1Score = toInt(f[6])
  const p2Score = toInt(f[7]), nextTurn = toInt(f[8]), winnerId = toInt(f[11])
  if (playedBy === null || r1 === null || c1 === null || r2 === null || c2 === null ||
    p1Score === null || p2Score === null || nextTurn === null || winnerId === null) return null
  const completedBoxes: { r: number; c: number }[] = []
  const boxesStr = f[5].trim()
  if (boxesStr && boxesStr !== "NONE") {
    for (const part of boxesStr.split("|")) {
      const entries = part.split(":")
      if (entries.length !== 2) return null
      const [r, c] = entries.map(toInt)
      if (r === null || c === null) return null
      completedBoxes.push({ r, c })
    }
  }
  return { playedBy, r1, c1, r2, c2, completedBoxes, p1Score, p2Score, nextTurn,
    bonusTurn: toBool(f[9]), gameOver: toBool(f[10]), winnerId, isDraw: toBool(f[12]) }
}

export interface GameOverMsg {
  winnerId: number; p1Score: number; p2Score: number; isDraw: boolean; reason: string
}
export function parseGameOver(params: string): GameOverMsg | null {
  const f = params.split(";")
  if (f.length < 5) return null
  const winnerId = toInt(f[0]), p1Score = toInt(f[1]), p2Score = toInt(f[2])
  if (winnerId === null || p1Score === null || p2Score === null) return null
  return { winnerId, p1Score, p2Score, isDraw: toBool(f[3]), reason: f[4].trim() }
}

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
export interface EdgeRef { type: "h" | "v"; r: number; c: number }
export function edgeToDots(e: EdgeRef): [number, number, number, number] {
  return e.type === "h" ? [e.r, e.c, e.r, e.c + 1] : [e.r, e.c, e.r + 1, e.c]
}
export function dotsToEdge(r1: number, c1: number, r2: number, c2: number): EdgeRef | null {
  if (r1 === r2 && Math.abs(c1 - c2) === 1) return { type: "h", r: r1, c: Math.min(c1, c2) }
  if (c1 === c2 && Math.abs(r1 - r2) === 1) return { type: "v", r: Math.min(r1, r2), c: c1 }
  return null
}
