import { useEffect, useState } from "react"
import type { BoardSize, UserProfile } from "./data"
import { BOARD_SIZE_OPTIONS } from "./data"
import {
  OP,
  SUPPORTED_BOARD_SIZE,
  splitServerMessage,
  parseUsersList,
  type ServerUser,
} from "./services/protocol"
import { wsService } from "./services/websocket"

// ─── Player Row ───────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  onInvite,
}: {
  player: ServerUser
  onInvite?: () => void
}) {
  const isOffline = player.status === "offline"
  const isPlaying = player.status === "ingame"
  const isQueuing = player.status === "queuing"

  const displayName = player.displayName?.trim() || player.username

  const statusText = isOffline
    ? "Ngoại tuyến"
    : isPlaying
      ? "Đang chơi"
      : isQueuing
        ? "Đang tìm trận"
        : "Rảnh"

  const statusColor = isOffline
    ? "rgba(255,255,255,0.3)"
    : isPlaying
      ? "#f7c04f"
      : "#4ade80"

  const avatarColor = isOffline
    ? "#64748b"
    : isPlaying
      ? "#f7c04f"
      : "#4ade80"

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/5">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
        style={{
          background: `${avatarColor}20`,
          border: `1.5px solid ${avatarColor}55`,
          color: avatarColor,
          fontFamily: "var(--font-display)",
        }}
      >
        {displayName[0]?.toUpperCase() || "?"}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold truncate"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {displayName}
        </p>

        <p
          className="text-xs"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: statusColor,
          }}
        >
          ● {statusText}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {player.status === "online" && onInvite && (
          <button
            onClick={onInvite}
            className="text-xs px-2 py-1 rounded-lg font-semibold transition-all hover:scale-105"
            style={{
              background: "rgba(79,142,247,0.2)",
              color: "#4f8ef7",
              border: "1px solid rgba(79,142,247,0.35)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}
          >
            MỜI
          </button>
        )}
      </div>
    </div>
  )
}

// ─── CreateRoomPage ───────────────────────────────────────────────────────────

interface Props {
  user: UserProfile
  defaultSize: BoardSize
  onBack: () => void
}

export default function CreateRoomPage({ user, defaultSize, onBack }: Props) {
  const [size, setSize] = useState<BoardSize>(defaultSize)
  const [roomName, setRoomName] = useState(`Phòng của ${user.username}`)
  const [toast, setToast] = useState<string | null>(null)

  const [serverUsers, setServerUsers] = useState<ServerUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [creatingRoom, setCreatingRoom] = useState(false)

  useEffect(() => {
    // Đăng ký listener trước khi gửi yêu cầu
    const unsubscribe = wsService.subscribe((response) => {
      if (response?.type !== "message") return

      const msg = splitServerMessage(response.data)

      if (!msg || msg.opcode !== OP.REPLY_USERS_AVAILABLE_LIST) {
        return
      }

      const users = parseUsersList(msg.params)

      console.log("[CREATE ROOM] Users received:", users)

      setServerUsers(users)
      setUsersLoading(false)
    })

    // Yêu cầu danh sách khi mở Create Room
    if (wsService.getStatus() === "connected") {
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  useEffect(() => {
    const unsubscribe = wsService.subscribe((response) => {
      if (response?.type !== "message") return

      const msg = splitServerMessage(response.data)
            if (!msg) return

            if (msg.opcode === OP.INVITED) {
        const status = msg.params.trim()

        if (status === "SUCCESS") {
          showToast("Server đã gửi lời mời thành công.")
        } else if (status === "USER_INGAME") {
          showToast("Người chơi đang ở trong trận.")
        } else if (status === "USER_UNAVAILABLE") {
          showToast("Người chơi hiện không khả dụng.")
        } else {
          showToast(`Gửi lời mời thất bại: ${status}`)
        }

        return
      }

      if (msg.opcode === OP.REPLY_USERS_AVAILABLE_LIST) {
        setServerUsers(parseUsersList(msg.params))
        return
      }

      if (msg.opcode === OP.REPLY_SHARE_ROOM) {
        const [status, code] = msg.params.split(";")
        setCreatingRoom(false)

        if (status === "SUCCESS" && code) {
          setRoomCode(code)
          showToast(`Tạo phòng thành công! Mã phòng: ${code}`)
        } else if (status === "ALREADY_IN_QUEUE") {
          showToast("Mày đang trong hàng đợi ghép trận.")
        } else if (status === "ALREADY_BUSY") {
          showToast("Mày đang bận hoặc đã ở trong phòng.")
        } else {
          showToast("Tạo phòng thất bại. Thử lại nhé.")
        }
      }
    })

    if (wsService.getStatus() === "connected") {
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const handleInvite = (p: ServerUser) => {
    if (wsService.getStatus() !== "connected") {
      showToast("Chưa kết nối tới server.")
      return
    }

    // Tìm ID của tài khoản đang đăng nhập từ dữ liệu server
    const currentUser = serverUsers.find(
      (u) => u.username === user.username
    )

    if (!currentUser) {
      showToast("Chưa lấy được thông tin tài khoản. Thử lại nhé.")
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
      return
    }

    if (p.status !== "online") {
      showToast("Người chơi này hiện không thể nhận lời mời.")
      return
    }

    const boardSize = `${size}x${size}`

    console.log("[INVITE] Sending invitation:", {
      senderId: currentUser.userId,
      receiverId: p.userId,
      boardSize,
    })

    wsService.sendMessage(
      `${OP.INVITE},,${currentUser.userId};${p.userId};${boardSize}`
    )

    showToast(`Đang gửi lời mời tới ${p.username}...`)
  }

  const otherUsers = serverUsers.filter(
    (p) => p.username !== user.username
  )

  const onlineUsers = otherUsers.filter(
    (p) => p.status !== "offline"
  )

  const offlineUsers = otherUsers.filter(
    (p) => p.status === "offline"
  )

  // Server mới hỗ trợ bàn 3×3: 4×4 và 5×5 vẫn hiển thị nhưng chưa cho chọn
  const handleSizeClick = (n: BoardSize) => {
    if (n !== SUPPORTED_BOARD_SIZE) {
      showToast(
        `🚧 Bàn ${n}×${n} đang được phát triển — hiện chỉ hỗ trợ bàn ${SUPPORTED_BOARD_SIZE}×${SUPPORTED_BOARD_SIZE}`
      )
      return
    }
    setSize(n)
  }

  // Server chưa có xử lý tạo phòng tùy chỉnh (CREATE_CUSTOM_ROOM) nên chưa bắt đầu được trận
  const handleStart = () => {
    if (wsService.getStatus() !== "connected") {
      showToast("Chưa kết nối tới server.")
      return
    }

    if (creatingRoom) {
      return
    }

    if (roomCode) {
      showToast(`Phòng đã được tạo. Mã phòng: ${roomCode}`)
      return
    }

    const currentUser = serverUsers.find(
      (p) => p.username === user.username
    )

    if (!currentUser) {
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
      showToast("Chưa lấy được ID tài khoản. Thử lại sau một chút.")
      return
    }

    const boardSize = `${size}x${size}`

    setCreatingRoom(true)

    wsService.sendMessage(
      `${OP.SHARE_ROOM},,${currentUser.userId};${boardSize}`
    )
  }

  return (
    <div
      className="dot-grid min-h-screen flex flex-col"
      style={{ color: "#e8eaf6" }}
    >
      {/* Header */}
      <div
        className="glass border-b flex items-center gap-3 px-5 py-4"
        style={{ borderColor: "rgba(79,142,247,0.15)" }}
      >
        <button
          className="icon-btn"
          onClick={onBack}
          style={{ width: 36, height: 36 }}
        >
          ←
        </button>
        <div>
          <h2
            className="font-bold tracking-widest text-base"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "0.08em",
            }}
          >
            TẠO PHÒNG
          </h2>
          <p
            className="text-xs"
            style={{
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Cấu hình và mời người chơi
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Room Settings ── */}
        <div
          className="w-80 flex-shrink-0 border-r flex flex-col gap-0 overflow-y-auto"
          style={{
            borderColor: "rgba(79,142,247,0.12)",
            background: "rgba(13,16,35,0.6)",
          }}
        >
          <div className="p-5 space-y-5">
            {/* Room name */}
            <div>
              <label
                className="block text-xs mb-2 uppercase tracking-widest"
                style={{
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Tên phòng
              </label>
              <input
                className="game-input text-sm"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>

            {/* Board size */}
            <div>
              <label
                className="block text-xs mb-3 uppercase tracking-widest"
                style={{
                  color: "rgba(255,255,255,0.35)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Kích thước bàn
              </label>
              <div className="space-y-2">
                {BOARD_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.n}
                    onClick={() => handleSizeClick(opt.n)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      background:
                        size === opt.n
                          ? "rgba(79,142,247,0.15)"
                          : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${
                        size === opt.n
                          ? "rgba(79,142,247,0.5)"
                          : "rgba(255,255,255,0.08)"
                      }`,
                    }}
                  >
                    {/* Mini grid preview */}
                    <MiniGrid n={opt.n} active={size === opt.n} />
                    <div className="flex-1">
                      <p
                        className="text-sm font-bold"
                        style={{
                          fontFamily: "var(--font-display)",
                          color: size === opt.n ? "#4f8ef7" : "#e8eaf6",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {opt.label} — {opt.desc}
                      </p>
                      <p
                        className="text-xs"
                        style={{
                          color: "rgba(255,255,255,0.35)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {opt.boxes} · {opt.duration}
                      </p>
                    </div>
                    {size === opt.n && (
                      <span style={{ color: "#4f8ef7", fontSize: 16 }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Start button */}
            <button
              className="btn-primary w-full py-3 text-base"
              onClick={handleStart}
              disabled={creatingRoom || !!roomCode}
            >
              {creatingRoom
                ? "ĐANG TẠO PHÒNG..."
                : roomCode
                  ? "PHÒNG ĐÃ TẠO"
                  : "▶ BẮT ĐẦU PHÒNG"}
            </button>

            {roomCode && (
              <div className="mt-3 rounded-xl p-3 border border-blue-400/30 bg-blue-400/10">
                <p className="text-xs text-blue-300 mb-1">
                  MÃ PHÒNG CỦA MÀY
                </p>

                <p className="text-xl font-bold tracking-widest text-white">
                  {roomCode}
                </p>

                <p className="text-xs text-white/50 mt-2">
                  Chia sẻ mã này với người chơi khác để họ tham gia phòng.
                </p>
              </div>
)}
          </div>
        </div>

        {/* ── Right: Friend List ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <h3
              className="text-sm font-bold tracking-widest"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "0.07em",
                color: "#e8eaf6",
              }}
            >
              DANH SÁCH NGƯỜI CHƠI
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* Online section */}
            <div className="mb-1">
              <div className="flex items-center gap-2 px-3 py-2">
                <div
                  className="w-2 h-2 rounded-full pulse"
                  style={{ background: "#4ade80" }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "#4ade80",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                >
                  ONLINE ({onlineUsers.length})
                </span>
              </div>
              {usersLoading ? (
              <p className="px-3 py-2 text-xs text-white/40">
                Đang tải danh sách người chơi...
              </p>
            ) : onlineUsers.length === 0 ? (
              <p className="px-3 py-2 text-xs text-white/40">
                Không có người chơi trực tuyến
              </p>
            ) : (
              onlineUsers.map((p) => (
                <PlayerRow
                  key={p.userId}
                  player={p}
                  onInvite={
                    p.status === "online"
                      ? () => handleInvite(p)
                      : undefined
                  }
                />
              ))
            )}
            </div>

            {/* Offline section */}
            <div className="mt-3">
              <div className="flex items-center gap-2 px-3 py-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.25)",
                    border: "1px solid rgba(255,255,255,0.25)",
                  }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                  }}
                >
                  NGOẠI TUYẾN ({offlineUsers.length})
                </span>
              </div>
              {offlineUsers.map((p) => (
                <PlayerRow key={p.userId} player={p} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="toast fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium"
          style={{
            background: "rgba(13,16,35,0.95)",
            border: "1px solid rgba(79,142,247,0.4)",
            color: "#4f8ef7",
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 24px rgba(79,142,247,0.2)",
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Mini Grid Preview ────────────────────────────────────────────────────────

function MiniGrid({ n, active }: { n: number, active: boolean }) {
  const G = 10
  const size = (n + 1) * G
  const color = active ? "#4f8ef7" : "rgba(255,255,255,0.35)"
  return (
    <svg width={size + 2} height={size + 2}>
      {Array.from({ length: n + 1 }, (_, r) =>
        Array.from({ length: n + 1 }, (_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={1 + c * G}
            cy={1 + r * G}
            r={2.5}
            fill={color}
          />
        )),
      )}
      {Array.from({ length: n + 1 }, (_, r) =>
        Array.from({ length: n }, (_, c) => (
          <line
            key={`h-${r}-${c}`}
            x1={1 + c * G + 3}
            y1={1 + r * G}
            x2={1 + (c + 1) * G - 3}
            y2={1 + r * G}
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.5}
          />
        )),
      )}
      {Array.from({ length: n }, (_, r) =>
        Array.from({ length: n + 1 }, (_, c) => (
          <line
            key={`v-${r}-${c}`}
            x1={1 + c * G}
            y1={1 + r * G + 3}
            x2={1 + c * G}
            y2={1 + (r + 1) * G - 3}
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.5}
          />
        )),
      )}
    </svg>
  )
}