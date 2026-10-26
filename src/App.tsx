import { useState, useEffect, useRef } from "react"
import GamePage from "./GamePage"
import CreateRoomPage from "./CreateRoomPage"
import {
  MOCK_USER,
  ONLINE_PLAYERS,
  OFFLINE_PLAYERS,
  LEADERBOARD,
  BOARD_SIZE_OPTIONS,
  rankClass,
  rankIcon,
  rankColor,
  getWinRate,
  type Page,
  type BoardSize,
  type RankTier,
  type UserProfile,
  type LeaderboardEntry,
} from "./data"

// ✅ WebSocket Service (singleton dùng chung cho toàn bộ app) — xem src/services/websocket.ts
import { wsService, type WsStatus } from "./services/websocket"
// Giao thức game với server (opcode, parser, builder) — xem src/services/protocol.ts
import {
  OP,
  SUPPORTED_BOARD_SIZE,
  splitServerMessage,
  parseLeaderboard,
  parseMatchFound,
  msgJoinQuickMatch,
  msgCancelQuickMatch,
  type ActiveMatch,
  parseRestoreMatch,
  type RestoreMatchMsg,
  parseUsersList,
  type ServerUser,
} from "./services/protocol"

// ─── Tab Session (sessionStorage: mỗi tab một phiên riêng) ────────────────────

const SESSION_KEY = "dnb_tab_session"

interface TabSession {
  sessionId: string
  username: string
}

// Trả về session của tab hiện tại nếu sessionId đã được gắn với một user
function loadTabSession(): TabSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.sessionId === "string" &&
      parsed.sessionId &&
      typeof parsed.username === "string" &&
      parsed.username
    ) {
      return { sessionId: parsed.sessionId, username: parsed.username }
    }
  } catch {
    // ignore
  }
  return null
}

// sessionId = session id do server cấp (SET_SESSION_ID) sau khi đăng nhập
function saveTabSession(username: string, sessionId: string) {
  try {
    const session: TabSession = { sessionId, username }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

function clearTabSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

// ─── Server data helpers ──────────────────────────────────────────────────────

// Các opcode server có thể dùng để trả về dữ liệu user
const USER_DATA_OPCODES = [
  "RETURN_USER_DETAIL", // opcode server thực tế trả về
  "USER_DATA",
  "REPLY_GET_USER_DETAIL",
  "GET_USER_DETAIL",
]

// Server trả: username;displayName;ranking;status (cũng chấp nhận JSON)
function parseUserDetail(params: string): any {
  const trimmed = params.trim()
  if (trimmed.startsWith("{")) return JSON.parse(trimmed)
  const [username, displayName, ranking, status] = params.split(";")
  return { username, displayName, ranking: Number(ranking), status }
}

// Convert ranking points to rank tier
const mapRankingToTier = (ranking: number): RankTier => {
  if (ranking >= 2000) return "Thách Đấu"
  if (ranking >= 1800) return "Kim Cương"
  if (ranking >= 1600) return "Vàng"
  if (ranking >= 1400) return "Bạc"
  return "Đồng"
}

// Map database fields → UserProfile (an toàn khi thiếu field)
function buildUserProfile(userData: any, fallbackUsername: string): UserProfile {
  const username: string = userData?.username || fallbackUsername
  const displayName: string = userData?.displayName || username
  const ranking = Number(userData?.ranking) || 0
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((n: string) => n[0])
      .join("")
      .toUpperCase() || username.slice(0, 2).toUpperCase()

  return {
    initials,
    username,
    flag: "🇻🇳", // Default nếu không có trong DB
    nationality: "Việt Nam", // Default nếu không có trong DB
    rankTier: mapRankingToTier(ranking),
    rankPoints: ranking,
    money: 50000, // Default nếu không có trong DB
    gamesPlayed: userData?.totalMatches || 0,
    gamesWon: userData?.totalWins || 0,
  } as UserProfile
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string
  type: "success" | "error"
  onClose: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div
      className="toast fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl"
      style={{
        background:
          type === "success" ? "rgba(16,50,30,0.95)" : "rgba(50,16,20,0.95)",
        border: `1px solid ${
          type === "success" ? "rgba(34,197,94,0.5)" : "rgba(247,79,94,0.5)"
        }`,
        backdropFilter: "blur(12px)",
      }}
    >
      <span className="text-xl">{type === "success" ? "✅" : "❌"}</span>
      <span
        className="text-sm font-medium"
        style={{
          color: type === "success" ? "#4ade80" : "#f87171",
          fontFamily: "var(--font-body)",
        }}
      >
        {message}
      </span>
      <button
        onClick={onClose}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

function DotsBoxesLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={4 + c * 16}
            cy={4 + r * 16}
            r={2.5}
            fill="#4f8ef7"
          />
        )),
      )}
      <line
        x1="4"
        y1="4"
        x2="20"
        y2="4"
        stroke="#4f8ef7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="4"
        x2="4"
        y2="20"
        stroke="#4f8ef7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="4"
        x2="20"
        y2="20"
        stroke="#4f8ef7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="20"
        stroke="#4f8ef7"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5.5"
        y="5.5"
        width="13"
        height="13"
        fill="rgba(79,142,247,0.25)"
        rx="1"
      />
      <line
        x1="20"
        y1="20"
        x2="36"
        y2="20"
        stroke="#f74f5e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="20"
        x2="20"
        y2="36"
        stroke="#f74f5e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="36"
        y1="20"
        x2="36"
        y2="36"
        stroke="#f74f5e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="36"
        x2="36"
        y2="36"
        stroke="#f74f5e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="21.5"
        y="21.5"
        width="13"
        height="13"
        fill="rgba(247,79,94,0.25)"
        rx="1"
      />
    </svg>
  )
}

function GameDecoration({ opacity = 0.12 }: { opacity?: number }) {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity,
        pointerEvents: "none",
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((r) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={60 + c * 80}
            cy={60 + r * 80}
            r={3}
            fill="#4f8ef7"
          />
        )),
      )}
      <line
        x1="60"
        y1="60"
        x2="140"
        y2="60"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="140"
        y1="60"
        x2="140"
        y2="140"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="140"
        x2="140"
        y2="140"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="60"
        x2="60"
        y2="140"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="62"
        y="62"
        width="76"
        height="76"
        fill="rgba(79,142,247,0.12)"
        rx="2"
      />
      <line
        x1="220"
        y1="60"
        x2="300"
        y2="60"
        stroke="#f74f5e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="300"
        y1="60"
        x2="300"
        y2="140"
        stroke="#f74f5e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="220"
        y1="60"
        x2="220"
        y2="140"
        stroke="#f74f5e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="220"
        y1="140"
        x2="300"
        y2="140"
        stroke="#f74f5e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="222"
        y="62"
        width="76"
        height="76"
        fill="rgba(247,79,94,0.12)"
        rx="2"
      />
      <line
        x1="140"
        y1="60"
        x2="220"
        y2="60"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="140"
        x2="60"
        y2="220"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="220"
        x2="140"
        y2="220"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="140"
        y1="140"
        x2="140"
        y2="220"
        stroke="#4f8ef7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="62"
        y="142"
        width="76"
        height="76"
        fill="rgba(79,142,247,0.12)"
        rx="2"
      />
    </svg>
  )
}

// ─── Match History ────────────────────────────────────────────────────────────

interface MatchRecord {
  id: number
  opponent: string
  opponentFlag: string
  result: "win" | "lose" | "draw"
  scoreSelf: number
  scoreOpponent: number
  boardSize: BoardSize
  date: string
}

function generateMatchHistory(user: UserProfile): MatchRecord[] {
  let seed = 1
  for (let i = 0; i < user.username.length; i++)
    seed = (seed * 31 + user.username.charCodeAt(i)) % 233280
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  const opponentPool = [...ONLINE_PLAYERS, ...OFFLINE_PLAYERS]
  const sizes: BoardSize[] = [3, 4, 5]
  const winRate = user.gamesPlayed > 0 ? user.gamesWon / user.gamesPlayed : 0.5

  const records: MatchRecord[] = []
  let dayOffset = 0
  for (let i = 0; i < 20; i++) {
    const opp = opponentPool[Math.floor(rand() * opponentPool.length)]
    const size = sizes[Math.floor(rand() * sizes.length)]
    const total = size * size
    const isDraw = total % 2 === 0 && rand() < 0.08
    const isWin = !isDraw && rand() < winRate

    let scoreSelf: number, scoreOpponent: number
    if (isDraw) {
      scoreSelf = scoreOpponent = total / 2
    } else if (isWin) {
      scoreSelf =
        Math.ceil(total / 2) + Math.floor(rand() * Math.floor(total / 2 + 1))
      scoreSelf = Math.min(scoreSelf, total)
      scoreOpponent = total - scoreSelf
    } else {
      scoreOpponent =
        Math.ceil(total / 2) + Math.floor(rand() * Math.floor(total / 2 + 1))
      scoreOpponent = Math.min(scoreOpponent, total)
      scoreSelf = total - scoreOpponent
    }

    dayOffset += 1 + Math.floor(rand() * 2)
    const d = new Date()
    d.setDate(d.getDate() - dayOffset)

    records.push({
      id: i,
      opponent: opp.username,
      opponentFlag: opp.flag,
      result: isDraw ? "draw" : scoreSelf > scoreOpponent ? "win" : "lose",
      scoreSelf,
      scoreOpponent,
      boardSize: size,
      date: d.toLocaleDateString("vi-VN"),
    })
  }
  return records
}

function MatchHistoryModal({
  user,
  onClose,
}: {
  user: UserProfile
  onClose: () => void
}) {
  const history = generateMatchHistory(user)
  const wins = history.filter((m) => m.result === "win").length
  const losses = history.filter((m) => m.result === "lose").length
  const draws = history.filter((m) => m.result === "draw").length

  const resultMeta = {
    win: {
      label: "THẮNG",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.12)",
      border: "rgba(74,222,128,0.3)",
    },
    lose: {
      label: "THUA",
      color: "#f87171",
      bg: "rgba(248,113,113,0.1)",
      border: "rgba(248,113,113,0.3)",
    },
    draw: {
      label: "HÒA",
      color: "#f7c04f",
      bg: "rgba(247,192,79,0.1)",
      border: "rgba(247,192,79,0.3)",
    },
  } as const

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="slide-up glass rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity text-lg"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <span className="text-2xl">📜</span>
          <div>
            <h2
              className="text-lg font-bold"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.05em",
              }}
            >
              LỊCH SỬ ĐẤU
            </h2>
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {user.flag} {user.username} · 20 trận gần nhất
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 flex-shrink-0">
          <div
            className="rounded-lg py-2.5 text-center"
            style={{
              background: "rgba(74,222,128,0.1)",
              border: "1px solid rgba(74,222,128,0.25)",
            }}
          >
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
              }}
            >
              THẮNG
            </p>
            <p
              className="font-bold text-lg"
              style={{ color: "#4ade80", fontFamily: "var(--font-display)" }}
            >
              {wins}
            </p>
          </div>
          <div
            className="rounded-lg py-2.5 text-center"
            style={{
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
            }}
          >
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
              }}
            >
              THUA
            </p>
            <p
              className="font-bold text-lg"
              style={{ color: "#f87171", fontFamily: "var(--font-display)" }}
            >
              {losses}
            </p>
          </div>
          <div
            className="rounded-lg py-2.5 text-center"
            style={{
              background: "rgba(247,192,79,0.08)",
              border: "1px solid rgba(247,192,79,0.25)",
            }}
          >
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
              }}
            >
              HÒA
            </p>
            <p
              className="font-bold text-lg"
              style={{ color: "#f7c04f", fontFamily: "var(--font-display)" }}
            >
              {draws}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {history.map((m) => {
            const meta = resultMeta[m.result]
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{
                  background: meta.bg,
                  border: `1px solid ${meta.border}`,
                }}
              >
                <span
                  className="text-xs font-bold px-2 py-1 rounded flex-shrink-0"
                  style={{
                    color: meta.color,
                    background: `${meta.color}22`,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                  }}
                >
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium truncate"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    vs {m.opponentFlag} {m.opponent}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                    }}
                  >
                    Bàn {m.boardSize}×{m.boardSize} · {m.date}
                  </p>
                </div>
                <span
                  className="text-sm font-bold flex-shrink-0"
                  style={{ color: meta.color, fontFamily: "var(--font-mono)" }}
                >
                  {m.scoreSelf}–{m.scoreOpponent}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Player Popup ─────────────────────────────────────────────────────────────

function PlayerPopup({
  user,
  onClose,
}: {
  user: UserProfile
  onClose: () => void
}) {
  const winRate = getWinRate(user.gamesPlayed, user.gamesWon)
  const rc = rankColor(user.rankTier)
  const [showHistory, setShowHistory] = useState(false)
  return (
    <div
      className="fade-in fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="slide-up glass rounded-2xl p-6 w-80 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity text-lg"
        >
          ✕
        </button>
        <div className="flex flex-col items-center mb-5">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mb-3 relative"
            style={{
              background: `linear-gradient(135deg,${rc}33,${rc}55)`,
              border: `3px solid ${rc}`,
              boxShadow: `0 0 24px ${rc}55`,
              fontFamily: "var(--font-display)",
            }}
          >
            {user.initials}
            <span className="absolute -bottom-1 -right-1 text-lg">
              {user.flag}
            </span>
          </div>
          <h3
            className="text-lg font-bold"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "0.05em",
            }}
          >
            {user.username}
          </h3>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            {user.nationality}
          </p>
        </div>
        <div
          className="flex items-center justify-center gap-2 mb-4 py-2 px-4 rounded-lg"
          style={{ background: `${rc}18`, border: `1.5px solid ${rc}60` }}
        >
          <span className="text-xl">{rankIcon(user.rankTier)}</span>
          <div>
            <p
              className={`text-sm font-bold ${rankClass(user.rankTier)}`}
              style={{ fontFamily: "var(--font-display)", fontSize: 16 }}
            >
              {user.rankTier}
            </p>
            <p
              className="text-xs"
              style={{
                fontFamily: "var(--font-mono)",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {user.rankPoints.toLocaleString()} điểm
            </p>
          </div>
        </div>
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg mb-4"
          style={{
            background: "rgba(247,192,79,0.12)",
            border: "1.5px solid rgba(247,192,79,0.45)",
          }}
        >
          <span
            className="text-xs"
            style={{
              color: "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-mono)",
            }}
          >
            SỐ TIỀN
          </span>
          <span
            className="font-bold text-sm"
            style={{ color: "#f7c04f", fontFamily: "var(--font-mono)" }}
          >
            💰 {user.money.toLocaleString()} xu
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            {
              label: "ĐÃ CHƠI",
              value: user.gamesPlayed,
              color: "rgba(255,255,255,0.7)",
            },
            { label: "THẮNG", value: user.gamesWon, color: "#4f8ef7" },
            { label: "TỈ LỆ", value: winRate, color: "#4ade80" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg py-3 text-center"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1.5px solid rgba(255,255,255,0.15)",
              }}
            >
              <p
                className="text-xs mb-1"
                style={{
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              >
                {s.label}
              </p>
              <p
                className="font-bold text-lg"
                style={{ color: s.color, fontFamily: "var(--font-display)" }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <button
          className="btn-ghost w-full py-2.5 flex items-center justify-center gap-2 text-sm"
          onClick={() => setShowHistory(true)}
        >
          📜 Xem lịch sử đấu
        </button>
      </div>

      {showHistory && (
        <MatchHistoryModal user={user} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fade-in fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="slide-up glass rounded-2xl p-7 w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
        <div className="flex items-center gap-3 mb-5">
          <DotsBoxesLogo size={36} />
          <div>
            <h2
              className="text-xl font-bold glow-blue"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.05em",
              }}
            >
              LUẬT CHƠI
            </h2>
            <p
              className="text-xs"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Dots & Boxes
            </p>
          </div>
        </div>
        {[
          {
            icon: "🎯",
            title: "Mục tiêu",
            body: "Người chơi có nhiều ô vuông nhất khi kết thúc trận đấu sẽ chiến thắng.",
          },
          {
            icon: "🔵",
            title: "Cách chơi",
            body: "Mỗi lượt, vẽ một cạnh nối hai điểm kề nhau (ngang hoặc dọc, không chéo). Cạnh đó phải chưa được vẽ.",
          },
          {
            icon: "⬛",
            title: "Chiếm ô",
            body: "Khi vẽ cạnh thứ 4 đóng một hình vuông → chiếm ô đó (đánh dấu X hoặc O) và được thêm một lượt nữa!",
          },
          {
            icon: "📐",
            title: "Kích thước bàn",
            body: "• 3×3 (9 ô) — Nhỏ, khoảng 5 phút\n• 4×4 (16 ô) — Chuẩn, khoảng 15 phút\n• 5×5 (25 ô) — Lớn, khoảng 30 phút",
          },
          {
            icon: "🏆",
            title: "Xếp hạng",
            body: "Thắng → tăng điểm rank. Bảng xếp hạng sắp xếp theo tổng số trận thắng (giảm dần).",
          },
        ].map((rule) => (
          <div
            key={rule.title}
            className="mb-3 rounded-xl p-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{rule.icon}</span>
              <h4
                className="font-semibold"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "#4f8ef7",
                  fontSize: 15,
                }}
              >
                {rule.title}
              </h4>
            </div>
            <p
              className="text-sm whitespace-pre-line"
              style={{ color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}
            >
              {rule.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  onClose,
  onLogout,
  username,
}: {
  onClose: () => void
  onLogout: (username: string) => void
  username: string
}) {
  const [vol, setVol] = useState(70)
  const [notif, setNotif] = useState(true)
  const [autoMatch, setAutoMatch] = useState(false)
  return (
    <div
      className="fade-in fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="slide-up glass rounded-2xl p-7 w-80 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
        <h2
          className="text-xl font-bold mb-5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}
        >
          ⚙️ CÀI ĐẶT
        </h2>
        <div className="space-y-5">
          <div>
            <div
              className="flex justify-between text-sm mb-2"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              <span>🔊 Âm lượng</span>
              <span
                style={{ fontFamily: "var(--font-mono)", color: "#4f8ef7" }}
              >
                {vol}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={vol}
              onChange={(e) => setVol(+e.target.value)}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #4f8ef7 ${vol}%, rgba(255,255,255,0.15) ${vol}%)`,
              }}
            />
          </div>
          {[
            { label: "🔔 Thông báo", val: notif, set: setNotif },
            { label: "🎲 Tự ghép trận", val: autoMatch, set: setAutoMatch },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <span
                className="text-sm"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                {item.label}
              </span>
              <button
                onClick={() => item.set(!item.val)}
                className="w-12 h-6 rounded-full transition-all relative"
                style={{
                  background: item.val ? "#4f8ef7" : "rgba(255,255,255,0.15)",
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: item.val ? "26px" : "2px" }}
                />
              </button>
            </div>
          ))}
          <div
            className="pt-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <button
              className="btn-danger w-full text-sm py-2"
              onClick={() => onLogout(username)}
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Auth Page ────────────────────────────────────────────────────────────────


function AuthPage({
  onLogin,
  wsStatus,
}: {
  onLogin: (u: UserProfile, serverSessionId: string | null) => void
  wsStatus: WsStatus
}) {
  const [tab, setTab] = useState<"login" | "register">("login")
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm: "",
    flag: "🇻🇳",
    nationality: "Việt Nam",
  })
  const [toast, setToast] = useState<{
    msg: string
    type: "success" | "error"
  } | null>(null)
  const [loading, setLoading] = useState(false)

  // Refs để tránh stale closure trong callback WebSocket
  const pendingUsernameRef = useRef("")
  const serverSessionIdRef = useRef<string | null>(null)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLoginRef = useRef(onLogin)
  onLoginRef.current = onLogin

  const clearTimers = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    if (loginTimeoutRef.current) {
      clearTimeout(loginTimeoutRef.current)
      loginTimeoutRef.current = null
    }
  }

  // ✅ Lắng nghe message từ server (kết nối WebSocket do App quản lý)
  useEffect(() => {
    const unsubscribe = wsService.subscribe((response) => {
      if (response.type === "message") {
        console.log("📨 Server message:", response.data)
        handleServerResponse(response.data)
      } else if (response.type === "error") {
        setToast({ msg: response.message, type: "error" })
        setLoading(false)
      }
    })
    return () => {
      unsubscribe()
      clearTimers()
    }
  }, [])

  // ✅ Handle server response with proper opcode parsing
  const handleServerResponse = (message: string) => {
    if (typeof message !== "string") return
    console.log("Processing server message:", message)

    // Parse opcode format: "OPCODE,,PARAMS"
    const [opcode, ...rest] = message.split(",,")
    const params = rest.join(",,")

    // Handle REPLY_LOGIN opcode
    if (opcode === "REPLY_LOGIN") {
      const statusMap: Record<string, string> = {
        LOGIN_SUCCESS: "✅ Đăng nhập thành công! Chào mừng trở lại 👋",
        UNKNOWN_USERNAME: "❌ Tên đăng nhập không tồn tại",
        WRONG_PASSWORD: "❌ Mật khẩu sai",
        ACCOUNT_ALREADY_ONLINE: "❌ Tài khoản đang online",
      }

      const statusMessage = statusMap[params] || `❌ Lỗi: ${params}`
      const type = params === "LOGIN_SUCCESS" ? "success" : "error"

      show(statusMessage, type)

      if (params === "LOGIN_SUCCESS") {
        // Request user data từ database (dùng ref, không dùng form state cũ)
        const username = pendingUsernameRef.current
        console.log("📤 Requesting user data from server...")
        wsService.sendMessage(`GET_USER_DETAIL,,${username}`)

        // Nếu server không trả dữ liệu user, vẫn chuyển vào trang chủ
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = setTimeout(() => {
          fallbackTimerRef.current = null
          console.warn("⚠️ No user data from server, using default profile")
          onLoginRef.current(
            buildUserProfile(null, username),
            serverSessionIdRef.current
          )
        }, 3000)
      } else {
        clearTimers()
        setLoading(false)
      }
    }
    // Server cấp session id ngay sau khi đăng nhập thành công
    else if (opcode === "SET_SESSION_ID") {
      serverSessionIdRef.current = params.trim() || null
    }
    // Handle GET_USER_DETAIL response (user data từ database)
    else if (USER_DATA_OPCODES.includes(opcode)) {
      if (!pendingUsernameRef.current) return
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }
      try {
        const userData = parseUserDetail(params)
        console.log("📥 Received user data from database:", userData)
        const userProfile = buildUserProfile(
          userData,
          pendingUsernameRef.current
        )
        console.log("✅ Converted user profile:", userProfile)
        onLoginRef.current(userProfile, serverSessionIdRef.current)
      } catch (error) {
        console.error("❌ Failed to parse user data:", error)
        show("Lỗi khi lấy dữ liệu người dùng", "error")
        setLoading(false)
      }
    }
  }

  const show = (msg: string, type: "success" | "error") =>
    setToast({ msg, type })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // ✅ Use WebSocket
  const handleLogin = () => {
    if (!form.username.trim() || !form.password) {
      show("Vui lòng nhập đầy đủ thông tin!", "error")
      return
    }

    if (wsStatus !== "connected") {
      show("Chưa kết nối tới server. Vui lòng đợi...", "error")
      return
    }

    setLoading(true)
    pendingUsernameRef.current = form.username
    serverSessionIdRef.current = null

    // ✅ Send login request with correct opcode format
    // Format: "LOGIN,,username;password"
    const loginMessage = `LOGIN,,${form.username};${form.password}`
    wsService.sendMessage(loginMessage)

    // Timeout sau 5 giây
    if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current)
    loginTimeoutRef.current = setTimeout(() => {
      setLoading(false)
    }, 5000)
  }

  const handleRegister = () => {
    if (!form.username.trim() || !form.password || !form.confirm) {
      show("Vui lòng điền đầy đủ thông tin!", "error")
      return
    }
    if (form.username.length < 4) {
      show("Tên đăng nhập phải có ít nhất 4 ký tự!", "error")
      return
    }
    if (form.password.length < 6) {
      show("Mật khẩu phải có ít nhất 6 ký tự!", "error")
      return
    }
    if (form.password !== form.confirm) {
      show("Mật khẩu xác nhận không khớp!", "error")
      return
    }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      show("Đăng ký thành công! Hãy đăng nhập 🎮", "success")
      setTimeout(() => setTab("login"), 1500)
    }, 1000)
  }

  return (
    <div className="dot-grid min-h-screen flex items-center justify-center relative overflow-hidden">
      <GameDecoration opacity={0.15} />
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "10%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(79,142,247,0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "15%",
          right: "10%",
          width: 250,
          height: 250,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(247,79,94,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="slide-up relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <DotsBoxesLogo size={52} />
          </div>
          <h1
            className="glow-blue text-4xl font-bold tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            DOTS & BOXES
          </h1>
          <p
            className="text-sm mt-1"
            style={{
              color: "rgba(255,255,255,0.35)",
              fontFamily: "var(--font-mono)",
            }}
          >
            online · competitive · strategy
          </p>

          {/* ✅ NEW: WebSocket status indicator */}
          <div
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
            style={{
              background:
                wsStatus === "connected"
                  ? "rgba(74,222,128,0.12)"
                  : wsStatus === "connecting"
                    ? "rgba(247,192,79,0.12)"
                    : "rgba(248,113,113,0.12)",
              border:
                wsStatus === "connected"
                  ? "1px solid rgba(74,222,128,0.3)"
                  : wsStatus === "connecting"
                    ? "1px solid rgba(247,192,79,0.3)"
                    : "1px solid rgba(248,113,113,0.3)",
              color:
                wsStatus === "connected"
                  ? "#4ade80"
                  : wsStatus === "connecting"
                    ? "#f7c04f"
                    : "#f87171",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                wsStatus === "connecting" ? "animate-pulse" : ""
              }`}
              style={{
                background:
                  wsStatus === "connected"
                    ? "#4ade80"
                    : wsStatus === "connecting"
                      ? "#f7c04f"
                      : "#f87171",
              }}
            />
            {wsStatus === "connected"
              ? "✅ Kết nối server"
              : wsStatus === "connecting"
                ? "⏳ Đang kết nối..."
                : "❌ Lỗi kết nối"}
          </div>
        </div>

        <div className="glass rounded-2xl overflow-hidden shadow-2xl">
          <div
            className="flex"
            style={{ borderBottom: "1px solid rgba(79,142,247,0.15)" }}
          >
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-4 transition-all"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                  color: tab === t ? "#4f8ef7" : "rgba(255,255,255,0.35)",
                  background:
                    tab === t ? "rgba(79,142,247,0.08)" : "transparent",
                  borderBottom: `2px solid ${
                    tab === t ? "#4f8ef7" : "transparent"
                  }`,
                }}
              >
                {t === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ"}
              </button>
            ))}
          </div>

          <div className="p-7">
            {tab === "login" ? (
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Tên người dùng
                  </label>
                  <input
                    className="game-input"
                    placeholder="Nhập tên đăng nhập..."
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Mật khẩu
                  </label>
                  <input
                    className="game-input"
                    type="password"
                    placeholder="Nhập mật khẩu..."
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
                <button
                  className="btn-primary w-full mt-2"
                  onClick={handleLogin}
                  disabled={loading || wsStatus !== "connected"}
                >
                  {loading
                    ? "Đang xử lý..."
                    : wsStatus !== "connected"
                      ? "Kết nối server..."
                      : "ĐĂNG NHẬP"}
                </button>
                <p
                  className="text-xs text-center"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  Demo:{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "rgba(79,142,247,0.6)",
                    }}
                  >
                    QuangHuy99
                  </span>{" "}
                  /{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "rgba(79,142,247,0.6)",
                    }}
                  >
                    123456
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Tên người dùng
                  </label>
                  <input
                    className="game-input"
                    placeholder="Tối thiểu 4 ký tự..."
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Quốc tịch
                  </label>
                  <select
                    className="game-input"
                    style={{ cursor: "pointer" }}
                    value={form.flag}
                    onChange={(e) => {
                      const opts: Record<string, string> = {
                        "🇻🇳": "Việt Nam",
                        "🇯🇵": "Nhật Bản",
                        "🇰🇷": "Hàn Quốc",
                        "🇺🇸": "Mỹ",
                        "🇨🇳": "Trung Quốc",
                        "🇹🇭": "Thái Lan",
                      }
                      set("flag", e.target.value)
                      set("nationality", opts[e.target.value] || "Khác")
                    }}
                  >
                    <option value="🇻🇳">🇻🇳 Việt Nam</option>
                    <option value="🇯🇵">🇯🇵 Nhật Bản</option>
                    <option value="🇰🇷">🇰🇷 Hàn Quốc</option>
                    <option value="🇺🇸">🇺🇸 Mỹ</option>
                    <option value="🇨🇳">🇨🇳 Trung Quốc</option>
                    <option value="🇹🇭">🇹🇭 Thái Lan</option>
                  </select>
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Mật khẩu
                  </label>
                  <input
                    className="game-input"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự..."
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1.5 uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Xác nhận mật khẩu
                  </label>
                  <input
                    className="game-input"
                    type="password"
                    placeholder="Nhập lại mật khẩu..."
                    value={form.confirm}
                    onChange={(e) => set("confirm", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  />
                </div>
                <button
                  className="btn-primary w-full mt-2"
                  onClick={handleRegister}
                  disabled={loading}
                >
                  {loading ? "Đang xử lý..." : "ĐĂNG KÝ"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

// ─── Home Page ────────────────────────────────────────────────────────────────

// Trạng thái tìm trận:
//   idle       : chưa tìm
//   joining    : đã gửi JOIN_QUICK_MATCH, chờ REPLY_JOIN_QUICK_MATCH
//   searching  : đang trong hàng đợi, chờ MATCH_FOUND
//   cancelling : đã gửi CANCEL_QUICK_MATCH, chờ REPLY_CANCEL_QUICK_MATCH
type SearchState = "idle" | "joining" | "searching" | "cancelling"

const JOIN_ERROR_TEXT: Record<string, string> = {
  ALREADY_BUSY: "⚠️ Bạn đang tìm trận hoặc đang trong một trận đấu khác",
}

function HomePage({
  user,
  onNavigate,
  selectedSize,
  onSizeChange,
  onCreateRoom,
  onLogout,
  autoSearch,
  onAutoSearchHandled,
}: {
  user: UserProfile
  onNavigate: (p: Page) => void
  selectedSize: SizeFilter
  onSizeChange: (s: SizeFilter) => void
  onCreateRoom: () => void
  onLogout: (username: string) => void
  autoSearch: boolean
  onAutoSearchHandled: () => void
}) {
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [usersLoading, setUsersLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [serverUsers, setServerUsers] = useState<ServerUser[]>([])
 
  // Chặn gửi request lặp khi effect được chạy lại ở môi trường dev
  const leaderboardRequestedRef = useRef(false)
  const [showRules, setShowRules] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [searchState, setSearchState] = useState<SearchState>("idle")
  // Ref song song với state để callback WebSocket luôn đọc được giá trị mới nhất
  const searchRef = useRef<SearchState>("idle")
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStartedRef = useRef(false)
  const usersRequestedRef = useRef(false)

  const updateSearch = (s: SearchState) => {
    searchRef.current = s
    setSearchState(s)
  }

  const clearSearchTimer = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
  }

  const showNotice = (msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 2800)
  }

  // ✅ Lắng nghe phản hồi ghép trận từ server
  // (MATCH_FOUND được App xử lý để chuyển sang trang game; ở đây chỉ dọn trạng thái tìm trận)
  useEffect(() => {
    const unsubscribe = wsService.subscribe((response) => {
      if (response?.type !== "message") return
      const msg = splitServerMessage(response.data)
      if (!msg) return

      switch (msg.opcode) {

        case OP.REPLY_LEADERBOARD: {
          const rows = parseLeaderboard(msg.params)

          const entries: LeaderboardEntry[] = rows.map((row) => ({
            userId: row.userId,
            rank: row.rank,
            username: row.username,
            flag: "",
            rankTier: mapRankingToTier(row.ranking),
            wins: row.totalWins,
            rankPoints: row.ranking,
            isSelf: row.username === user.username,
          }))

          setLeaderboard(entries)
          setLeaderboardLoading(false)
          break
        }

        case OP.REPLY_USERS_AVAILABLE_LIST: {
          const users = parseUsersList(msg.params)

          console.log("[USERS] Received:", users)

          setServerUsers(users)
          setUsersLoading(false)
          break
        }

        case OP.MATCH_FOUND:
          // Người ghép thứ hai nhận MATCH_FOUND TRƯỚC REPLY_JOIN_QUICK_MATCH → về idle để bỏ qua reply muộn
          clearSearchTimer()
          updateSearch("idle")
          break

        case OP.REPLY_JOIN_QUICK_MATCH: {
          if (searchRef.current !== "joining") return
          clearSearchTimer()
          const status = msg.params.trim()
          if (status === "SUCCESS" || status === "ALREADY_IN_QUEUE") {
            updateSearch("searching")
          } else {
            updateSearch("idle")
            showNotice(JOIN_ERROR_TEXT[status] ?? `❌ Không thể tìm trận: ${status}`)
          }
          break
        }

        case OP.REPLY_CANCEL_QUICK_MATCH: {
          if (searchRef.current !== "cancelling") return
          clearSearchTimer()
          updateSearch("idle")
          // SUCCESS: đã rời hàng đợi. NOT_IN_QUEUE: không còn trong hàng đợi (vd. vừa được ghép trận).
          if (msg.params.trim() === "SUCCESS") showNotice("Đã hủy tìm trận")
          break
        }
      }
    })
    // Đăng ký listener xong mới gửi yêu cầu lấy Top 7
    if (
      !leaderboardRequestedRef.current &&
      wsService.getStatus() === "connected"
    ) {
      leaderboardRequestedRef.current = true
      wsService.sendMessage(`${OP.GET_LEADERBOARD},,`)
    }

    if (
      !usersRequestedRef.current &&
      wsService.getStatus() === "connected"
    ) {
      usersRequestedRef.current = true
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
    }

    return () => {
      unsubscribe()
      clearSearchTimer()
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  // TEST: yêu cầu Top 7 từ Java server
  useEffect(() => {
    const unsubscribe = wsService.subscribe((response) => {
      if (response?.type !== "message") return;

      const msg = splitServerMessage(response.data);
      if (!msg || msg.opcode !== "REPLY_LEADERBOARD") return;

      console.log("[TEST] Top 7 nhận từ backend:", msg.params);
    });

    // Gửi yêu cầu sau khi người dùng đã đăng nhập và vào HomePage
    wsService.sendMessage("GET_LEADERBOARD,,");

    return unsubscribe;
  }, []);

  // ✅ CHƠI NHANH → gửi JOIN_QUICK_MATCH, chờ server ghép
  const handleQuickPlay = () => {
    if (searchRef.current !== "idle") return
    if (wsService.getStatus() !== "connected") {
      showNotice("❌ Chưa kết nối tới server")
      return
    }

    // Gửi đúng lựa chọn: ANY hoặc 3x3 / 4x4 / 5x5.
    // msgJoinQuickMatch sẽ serialize đúng format server đang yêu cầu.
    console.log("[CLIENT] JOIN_QUICK_MATCH requested size:", selectedSize)
    updateSearch("joining")
    wsService.sendMessage(msgJoinQuickMatch(selectedSize))

    clearSearchTimer()
    searchTimer.current = setTimeout(() => {
      if (searchRef.current === "joining") {
        updateSearch("idle")
        showNotice("❌ Server không phản hồi, vui lòng thử lại")
      }
    }, 6000)
  }

  // ✅ HỦY → gửi CANCEL_QUICK_MATCH
  const handleCancelSearch = () => {
    if (searchRef.current !== "searching" && searchRef.current !== "joining") return
    updateSearch("cancelling")
    wsService.sendMessage(msgCancelQuickMatch())

    clearSearchTimer()
    searchTimer.current = setTimeout(() => {
      if (searchRef.current === "cancelling") updateSearch("idle")
    }, 5000)
  }

  // Bấm "Tìm trận mới" ở màn hình kết quả → về trang chủ và tự bắt đầu tìm trận
  useEffect(() => {
    if (!autoSearch || autoStartedRef.current) return
    autoStartedRef.current = true
    onAutoSearchHandled()
    handleQuickPlay()
  }, [])

  // Cho phép chọn đủ 3x3, 4x4, 5x5.
  const handleSizeClick = (n: BoardSize) => {
    onSizeChange(n)
  }

  // Đang tìm trận mà sang trang tạo phòng thì hủy tìm trận trước
  const handleCreateRoomClick = () => {
    if (searchRef.current === "searching" || searchRef.current === "joining") {
      wsService.sendMessage(msgCancelQuickMatch())
      updateSearch("idle")
    }
    onCreateRoom()
  }

  const searching = searchState !== "idle"
  const searchLabel =
    selectedSize === "any" ? "Tất cả kích thước" : `${selectedSize}×${selectedSize}`

  const otherUsers = serverUsers.filter(
    (p) => p.username !== user.username
  )

  const idlePlayers = otherUsers.filter(
    (p) => p.status === "online" || p.status === "queuing"
  )

  const playingPlayers = otherUsers.filter(
    (p) => p.status === "ingame"
  )

  const offlinePlayers = otherUsers.filter(
    (p) => p.status === "offline"
  )

  return (
    <div className="dot-grid min-h-screen flex flex-col relative overflow-hidden">
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <GameDecoration opacity={0.09} />
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "20%",
            width: 350,
            height: 350,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(79,142,247,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "15%",
            right: "15%",
            width: 280,
            height: 280,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(247,79,94,0.05) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Top Bar ── */}
      <header
        className="glass border-b relative z-10 flex items-center gap-3 px-5 py-3"
        style={{ borderColor: "rgba(79,142,247,0.15)" }}
      >
        <button
          onClick={() => setShowProfile(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all hover:scale-110"
          style={{
            background: `linear-gradient(135deg,${rankColor(user.rankTier)}44,${rankColor(user.rankTier)}22)`,
            border: `2px solid ${rankColor(user.rankTier)}`,
            boxShadow: `0 0 12px ${rankColor(user.rankTier)}44`,
            fontFamily: "var(--font-display)",
          }}
        >
          {user.initials}
        </button>
        <div className="mr-auto">
          <p
            className="text-sm font-semibold leading-none"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "0.04em",
            }}
          >
            {user.username}
          </p>
          <p
            className={`text-xs ${rankClass(user.rankTier)}`}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
          >
            {rankIcon(user.rankTier)} {user.rankTier}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{
            background: "rgba(247,192,79,0.12)",
            border: "1px solid rgba(247,192,79,0.3)",
          }}
        >
          <span className="text-sm">💰</span>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-mono)", color: "#f7c04f" }}
          >
            {user.money.toLocaleString()}
          </span>
        </div>
        <button
          className="icon-btn"
          onClick={() => setShowSettings(true)}
          title="Cài đặt"
        >
          <svg
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 relative z-10 overflow-hidden">
        {/* ── LEFT SIDEBAR: Board Size + Leaderboard ── */}
        <aside
          className="w-64 flex-shrink-0 border-r flex flex-col overflow-y-auto"
          style={{
            borderColor: "rgba(79,142,247,0.12)",
            background: "rgba(13,16,35,0.6)",
          }}
        >
          {/* Board Size Section */}
          <div
            className="p-4 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <p
              className="text-xs font-semibold mb-3 uppercase tracking-widest"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Kích thước bàn
            </p>
            <div className="space-y-1.5">
              {/* "Any" option */}
              <button
                onClick={() => onSizeChange("any")}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                style={{
                  background:
                    selectedSize === "any"
                      ? "rgba(247,192,79,0.15)"
                      : "rgba(255,255,255,0.04)",
                  border: `1.5px solid ${
                    selectedSize === "any"
                      ? "rgba(247,192,79,0.45)"
                      : "rgba(255,255,255,0.07)"
                  }`,
                }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor:
                      selectedSize === "any"
                        ? "#f7c04f"
                        : "rgba(255,255,255,0.3)",
                  }}
                >
                  {selectedSize === "any" && (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: "#f7c04f" }}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className="text-xs font-semibold"
                    style={{
                      color:
                        selectedSize === "any"
                          ? "#f7c04f"
                          : "rgba(255,255,255,0.7)",
                    }}
                  >
                    Tất cả kích thước
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                    }}
                  >
                    Bất kỳ bàn nào
                  </p>
                </div>
              </button>

              {BOARD_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.n}
                  onClick={() => handleSizeClick(opt.n)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background:
                      selectedSize === opt.n
                        ? "rgba(79,142,247,0.15)"
                        : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${
                      selectedSize === opt.n
                        ? "rgba(79,142,247,0.45)"
                        : "rgba(255,255,255,0.07)"
                    }`,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor:
                        selectedSize === opt.n
                          ? "#4f8ef7"
                          : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {selectedSize === opt.n && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: "#4f8ef7" }}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-xs font-semibold"
                      style={{
                        color:
                          selectedSize === opt.n
                            ? "#4f8ef7"
                            : "rgba(255,255,255,0.7)",
                      }}
                    >
                      {opt.label} — {opt.desc}
                    </p>
                    <p
                      className="text-xs"
                      style={{
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                      }}
                    >
                      {opt.boxes} · {opt.duration}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Leaderboard Section */}
          <div className="flex-1 p-4">
            <p
              className="text-xs font-semibold mb-3 uppercase tracking-widest"
              style={{
                color: "rgba(255,255,255,0.35)",
                fontFamily: "var(--font-mono)",
              }}
            >
              🏆 Bảng xếp hạng
            </p>
            {leaderboardLoading ? (
              <p className="text-xs text-white/40 px-2 py-3">
                Đang tải bảng xếp hạng...
              </p>
            ) : leaderboard.length === 0 ? (
              <p className="text-xs text-white/40 px-2 py-3">
                Chưa có dữ liệu xếp hạng.
              </p>
            ) : (
              leaderboard.map((entry) => (
                <div
                  key={entry.userId ?? entry.rank}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg"
                  style={{
                    background: entry.isSelf
                      ? "rgba(79,142,247,0.1)"
                      : "transparent",
                    border: entry.isSelf
                      ? "1px solid rgba(79,142,247,0.2)"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    className="text-xs w-5 text-center flex-shrink-0"
                    style={{
                      color:
                        entry.rank === 1
                          ? "#f7c04f"
                          : entry.rank === 2
                            ? "#b0b8c8"
                            : entry.rank === 3
                              ? "#cd7f32"
                              : "rgba(255,255,255,0.3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    {entry.rank <= 3
                      ? ["🥇", "🥈", "🥉"][entry.rank - 1]
                      : entry.rank}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-medium truncate"
                      style={{
                        color: entry.isSelf
                          ? "#4f8ef7"
                          : "rgba(255,255,255,0.8)",
                      }}
                    >
                      {entry.username} {entry.isSelf ? "(bạn)" : ""}
                    </p>

                    <p
                      className={`text-xs ${rankClass(entry.rankTier)}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                      }}
                    >
                      {rankIcon(entry.rankTier)} {entry.wins} thắng
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── CENTER: Game Actions ── */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <DotsBoxesLogo size={64} />
            </div>
            <h1
              className="text-5xl font-bold tracking-widest glow-blue mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              DOTS & BOXES
            </h1>
            <p
              className="text-sm"
              style={{
                color: "rgba(255,255,255,0.3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Trò chơi chiến thuật đối kháng online
            </p>
            {selectedSize !== "any" && (
              <div
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
                style={{
                  background: "rgba(79,142,247,0.15)",
                  border: "1px solid rgba(79,142,247,0.3)",
                  color: "#4f8ef7",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Bàn {selectedSize}×{selectedSize} đã chọn
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-3"
              onClick={handleQuickPlay}
              disabled={searching}
              style={{
                borderRadius: 12,
                opacity: searching ? 0.6 : 1,
                cursor: searching ? "not-allowed" : "pointer",
              }}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
              CHƠI NHANH
            </button>
            <button
              className="w-full py-4 text-base flex items-center justify-center gap-3 font-semibold transition-all hover:scale-105"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.05em",
                borderRadius: 12,
                fontSize: 16,
                background: "rgba(247,79,94,0.15)",
                border: "1px solid rgba(247,79,94,0.4)",
                color: "#f74f5e",
                boxShadow: "0 4px 16px rgba(247,79,94,0.15)",
              }}
              onClick={handleCreateRoomClick}
            >
              <svg
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              TẠO BÀN
            </button>
            <button
              className="btn-ghost w-full py-2.5 flex items-center justify-center gap-2 text-sm"
              onClick={() => setShowRules(true)}
            >
              <svg
                width="15"
                height="15"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Hướng dẫn luật chơi
            </button>
          </div>
        </main>

        {/* ── RIGHT SIDEBAR: Online + Offline Players ── */}
        <aside
          className="w-60 flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{
            borderColor: "rgba(79,142,247,0.12)",
            background: "rgba(13,16,35,0.6)",
          }}
        >
          {/* Online section */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full pulse"
                  style={{ background: "#4ade80" }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "#4ade80",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                  }}
                >
                  {idlePlayers.length + playingPlayers.length + 1}
                </span>
              </div>
            </div>

            {/* Self */}
            <div
              className="mx-2 mb-1 flex items-center gap-2 px-2 py-2 rounded-lg"
              style={{
                background: "rgba(79,142,247,0.1)",
                border: "1px solid rgba(79,142,247,0.2)",
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                style={{
                  background: `${rankColor(user.rankTier)}33`,
                  border: `1.5px solid ${rankColor(user.rankTier)}`,
                  fontFamily: "var(--font-display)",
                }}
              >
                {user.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {user.flag} {user.username}
                </p>
                <p
                  className="text-xs"
                  style={{
                    color: "#4ade80",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                  }}
                >
                  ● Rảnh (Bạn)
                </p>
              </div>
            </div>

            {idlePlayers.map((p) => (
              <div
                key={p.username}
                className="mx-2 mb-0.5 flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  // style={{
                  //   background: `${rankColor(p.rankTier)}22`,
                  //   border: `1.5px solid ${rankColor(p.rankTier)}55`,
                  //   color: rankColor(p.rankTier),
                  //   fontFamily: "var(--font-display)",
                  // }}
                  style={{
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "1.5px solid rgba(99, 102, 241, 0.35)",
                    color: "#818cf8",
                  }}
                >
                  {p.username[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs truncate"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {p.displayName || p.username}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: "#4ade80",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                    }}
                  >
                    ● Rảnh
                  </p>
                </div>
              </div>
            ))}

            {playingPlayers.map((p) => (
              <div
                key={p.username}
                className="mx-2 mb-0.5 flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  // style={{
                  //   background: `${rankColor(p.rankTier)}22`,
                  //   border: `1.5px solid ${rankColor(p.rankTier)}55`,
                  //   color: rankColor(p.rankTier),
                  //   fontFamily: "var(--font-display)",
                  // }}
                  style={{
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "1.5px solid rgba(99, 102, 241, 0.35)",
                    color: "#818cf8",
                  }}
                >
                  {p.username[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs truncate"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {p.displayName || p.username}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: "#f7c04f",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                    }}
                  >
                    ● Đang chơi
                  </p>
                </div>
              </div>
            ))}

            {/* Offline section */}
            <div
              className="flex items-center gap-1.5 px-4 pt-3 pb-2 mt-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              />
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                }}
              >
                NGOẠI TUYẾN ({offlinePlayers.length})
              </span>
            </div>

            {offlinePlayers.map((p) => (
              <div
                key={p.username}
                className="mx-2 mb-0.5 flex items-center gap-2 px-2 py-2 rounded-lg"
              >
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1.5px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {p.username[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs truncate"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                  >
                    {p.displayName || p.username}
                  </p>
                  <p
                    className="text-xs"
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                    }}
                  >
                    Ngoại tuyến
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Modals */}
      {showProfile && (
        <PlayerPopup user={user} onClose={() => setShowProfile(false)} />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onLogout={onLogout}
          username={user.username}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* Matchmaking toast (đang tìm trận / hủy tìm trận) */}
      {searching && (
        <div
          className="toast fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-xl flex items-center gap-3 z-30"
          style={{
            background: "rgba(13,16,35,0.95)",
            border: "1px solid rgba(79,142,247,0.4)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(79,142,247,0.2)",
          }}
        >
          <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <span className="text-sm font-medium" style={{ color: "#4f8ef7" }}>
            {searchState === "cancelling"
              ? "Đang hủy tìm trận..."
              : `🔍 Đang tìm đối thủ · Bàn ${searchLabel}...`}
          </span>
          {searchState !== "cancelling" && (
            <button
              onClick={handleCancelSearch}
              className="ml-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all hover:scale-105"
              style={{
                background: "rgba(247,79,94,0.15)",
                border: "1px solid rgba(247,79,94,0.4)",
                color: "#f74f5e",
                fontFamily: "var(--font-mono)",
              }}
            >
              HỦY
            </button>
          )}
        </div>
      )}

      {/* Notice toast (thông báo chức năng đang phát triển, lỗi ghép trận...) */}
      {notice && (
        <div
          className="toast fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium z-30"
          style={{
            background: "rgba(13,16,35,0.95)",
            border: "1px solid rgba(247,192,79,0.4)",
            color: "#f7c04f",
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 24px rgba(247,192,79,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          {notice}
        </div>
      )}

      <style>{`input[type=range]::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;background:white;border:2px solid rgba(0,0,0,0.3);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4)}`}</style>
    </div>
  )
}

// ─── App (Router) ──────────────────────────────────────────────────────────────

type SizeFilter = BoardSize | "any"

export default function App() {
  const [page, setPage] = useState<Page>("auth")
  const [user, setUser] = useState<UserProfile | null>(null)
  // Mặc định chọn 3×3; người chơi có thể chọn 4×4, 5×5 hoặc ANY
  const [selectedSize, setSelectedSize] = useState<SizeFilter>(SUPPORTED_BOARD_SIZE)
  const [wsStatus, setWsStatus] = useState<WsStatus>(wsService.getStatus())

  // Trận đang chơi (do server ghép: MATCH_FOUND) và cờ tự tìm trận mới sau khi kết thúc ván
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null)
  const [restoreSnapshot, setRestoreSnapshot] = useState<RestoreMatchMsg | null>(null)
  const restoreSnapshotRef = useRef<RestoreMatchMsg | null>(null)
  const [autoSearch, setAutoSearch] = useState(false)

  // ✅ Session của TAB hiện tại (sessionStorage): có user gắn với session → khôi phục
  const [savedSession] = useState<TabSession | null>(() => loadTabSession())
  const [restoring, setRestoring] = useState<boolean>(savedSession !== null)
  const restoringRef = useRef<boolean>(savedSession !== null)
  const attachAcceptedRef = useRef(false)
  const endRestore = () => {
    restoringRef.current = false
    setRestoring(false)
  }

  const failRestore = () => {
    clearTabSession()
    restoreSnapshotRef.current = null
    setRestoreSnapshot(null)
    endRestore()
  }

  // ✅ Kết nối WebSocket một lần ở cấp App (không bị đóng khi chuyển trang)
  useEffect(() => {
    const offStatus = wsService.onStatusChange(setWsStatus)
    const offMessage = wsService.subscribe((response) => {
      if (!restoringRef.current || !savedSession) return
      if (response?.type !== "message") return

      const [opcode, ...rest] = String(response.data).split(",,")
      const params = rest.join(",,")

      // Server không còn session này (đã bị xóa) → về trang đăng nhập
      if (opcode === "REPLY_LOGOUT") {
        failRestore()
        return
      }

      // Attach thành công → lấy dữ liệu user
      if (opcode === "REPLY_ATTACH") {
        if (params.trim() === "ATTACH_SUCCESS") {
          attachAcceptedRef.current = true

          wsService.sendMessage(
            `GET_USER_DETAIL,,${savedSession.username}`
          )
        } else {
          failRestore()
        }
        return
      }
      if (!USER_DATA_OPCODES.includes(opcode)) return
      try {
        const profile = buildUserProfile(
          parseUserDetail(params),
          savedSession.username
        )
        console.log("♻️ Session restored for:", profile.username)
        setUser(profile)
        setPage(restoreSnapshotRef.current ? "game" : "home")
        endRestore()
      } catch (error) {
        console.error("❌ Failed to restore session:", error)
        failRestore()
      }
    })

    wsService.connect()
    setWsStatus(wsService.getStatus())

    return () => {
      offMessage()
      offStatus()
      wsService.disconnect()
    }
  }, [])

  // ✅ Server ghép được trận → MATCH_FOUND: roomId;opponentUsername;opponentDisplayName;opponentRanking;role
  // Xử lý ở cấp App để dù người chơi đang ở trang nào cũng được đưa vào trận
  useEffect(() => {
    const offMatch = wsService.subscribe((response) => {
      if (response?.type !== "message") return
      const msg = splitServerMessage(response.data)
      if (!msg || msg.opcode !== OP.MATCH_FOUND) return

      const info = parseMatchFound(msg.params)
      if (!info) {
        console.error("❌ Không đọc được MATCH_FOUND:", msg.params)
        return
      }
      console.log("🎮 Match found:", info)
      restoreSnapshotRef.current = null
      setRestoreSnapshot(null)
      setActiveMatch({
        ...info,
        // Dùng kích thước thực do server gửi trong MATCH_FOUND.
        boardSize: info.boardSize,
        opponentRankTier: mapRankingToTier(info.opponentRanking) as RankTier,
      })
      setPage("game")
    })
    return offMatch
  }, [])
  useEffect(() => {
    const off = wsService.subscribe((response) => {
      if (response?.type !== "message") return
      const msg = splitServerMessage(response.data)
      if (!msg || msg.opcode !== "RESTORE_MATCH") return

      const info = parseRestoreMatch(msg.params)
      if (!info) return

      restoreSnapshotRef.current = info
      setRestoreSnapshot(info)
      setActiveMatch({
        roomId: info.roomId,
        opponentUsername: info.opponentUsername,
        opponentDisplayName: info.opponentDisplayName,
        opponentRanking: 0, // hoặc gọi thêm GET_USER_DETAIL nếu cần hiển thị rank
        role: info.role,
        boardSize: info.boardSize,
        opponentRankTier: mapRankingToTier(0) as RankTier, // server chưa gửi rank đối thủ
      })
      setPage("game")
    })
    return off
  }, [])
  
  // ✅ Khi đã kết nối mà tab đang có session → lấy lại dữ liệu user và vào thẳng trang chủ
  useEffect(() => {
    if (!restoring || !savedSession) return

    // Không gửi attach khi WebSocket chưa kết nối.
    // Giữ trạng thái restoring để chờ kết nối thay vì quay về Login.
    if (wsStatus !== "connected") return

    attachAcceptedRef.current = false

    let attempts = 0

    const sendAttach = () => {
      if (!restoringRef.current || attachAcceptedRef.current) {
        return
      }

      if (wsService.getStatus() !== "connected") {
        return
      }

      attempts += 1

      console.log(
        `📤 Attaching session attempt ${attempts}:`,
        savedSession.sessionId
      )

      wsService.sendMessage(
        `ATTACH_REQUEST,,${savedSession.sessionId}`
      )
    }

    // Thử lần đầu sau một khoảng ngắn để bridge khởi tạo TCP.
    const firstAttempt = window.setTimeout(sendAttach, 500)

    // Nếu bridge báo chưa kết nối tới Java Server,
    // thử lại cho đến khi attach thành công hoặc hết thời gian.
    const retryInterval = window.setInterval(sendAttach, 1000)

    const timeout = window.setTimeout(() => {
      if (restoringRef.current) {
        console.warn("⚠️ Session restore timed out")
        failRestore()
      }
    }, 15000)

    return () => {
      window.clearTimeout(firstAttempt)
      window.clearInterval(retryInterval)
      window.clearTimeout(timeout)
    }
  }, [wsStatus, restoring])

  const handleLogin = (
    u: UserProfile,
    serverSessionId: string | null
  ) => {
    if (serverSessionId) {
      saveTabSession(u.username, serverSessionId)
    } else {
      clearTabSession()
    }

    setUser(u)

    // Có snapshot trận đấu thì ưu tiên vào GamePage.
    // Không dùng setTimeout chuyển về Home nữa.
    if (restoreSnapshotRef.current !== null) {
      setPage("game")
    } else {
      setPage("home")
    }
  }   

  // ✅ Handle logout - send LOGOUT opcode to server
  const handleLogout = (username: string) => {
    console.log("📤 Sending logout request for:", username)

    // Server yêu cầu: "LOGOUT,,sessionId" (không phải username)
    const sessionId = loadTabSession()?.sessionId
    if (sessionId) wsService.sendMessage(`LOGOUT,,${sessionId}`)

    // Xoá session của tab và quay lại trang đăng nhập
    clearTabSession()
    setUser(null)
    setActiveMatch(null)
    restoreSnapshotRef.current = null
    setRestoreSnapshot(null)
    setPage("auth")

    console.log("✅ User logged out: " + username)
  }

  const handleCreateRoom = () => {
    setPage("create-room")
  }

  // Rời màn hình trận đấu (đã kết thúc hoặc đã thoát giữa trận)
  const handleLeaveGame = () => {
    setActiveMatch(null)
    restoreSnapshotRef.current = null
    setRestoreSnapshot(null)
    setPage("home")
  }

  // "Tìm trận mới" sau khi kết thúc ván: về trang chủ và tự bắt đầu tìm trận
  const handlePlayAgain = () => {
    setActiveMatch(null)
    restoreSnapshotRef.current = null
    setRestoreSnapshot(null)
    setAutoSearch(true)
    setPage("home")
  }

  const roomDefaultSize: BoardSize =
    selectedSize === "any" ? SUPPORTED_BOARD_SIZE : selectedSize

  if (restoring)
    return (
      <div className="dot-grid min-h-screen flex items-center justify-center">
        <div className="glass rounded-xl px-6 py-3.5 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          <span
            className="text-sm font-medium"
            style={{ color: "#4f8ef7", fontFamily: "var(--font-mono)" }}
          >
            Đang khôi phục phiên đăng nhập...
          </span>
        </div>
      </div>
    )

  if (page === "auth") return <AuthPage onLogin={handleLogin} wsStatus={wsStatus} />
  if (!user) return null
  if (page === "game" && activeMatch)
    return (
      <GamePage
        key={activeMatch.roomId}
        match={activeMatch}
        user={user}
        onBack={handleLeaveGame}
        onPlayAgain={handlePlayAgain}
        initialSnapshot={restoreSnapshot?.roomId === activeMatch.roomId ? restoreSnapshot : undefined}
      />
    )
  if (page === "create-room")
    return (
      <CreateRoomPage
        user={user}
        defaultSize={roomDefaultSize}
        onBack={() => setPage("home")}
      />
    )
  return (
    <HomePage
      user={user}
      onNavigate={setPage}
      selectedSize={selectedSize}
      onSizeChange={setSelectedSize}
      onCreateRoom={handleCreateRoom}
      onLogout={handleLogout}
      autoSearch={autoSearch}
      onAutoSearchHandled={() => setAutoSearch(false)}
    />
  )
}