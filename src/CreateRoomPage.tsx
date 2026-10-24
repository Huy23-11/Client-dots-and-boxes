import { useState } from "react"
import type { BoardSize, UserProfile } from "./data"
import {
  BOARD_SIZE_OPTIONS,
  ONLINE_PLAYERS,
  OFFLINE_PLAYERS,
  rankColor,
  type OnlinePlayer,
  type OfflinePlayer,
} from "./data"
import { SUPPORTED_BOARD_SIZE } from "./services/protocol"

// ─── Player Row ───────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  isOffline,
  onInvite,
}: {
  player: OnlinePlayer | OfflinePlayer
  isOffline: boolean
  onInvite?: () => void
}) {
  const rc = rankColor(player.rankTier)
  const status = isOffline ? null : (player as OnlinePlayer).status

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/5">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
        style={{
          background: `${rc}20`,
          border: `1.5px solid ${rc}55`,
          color: rc,
          fontFamily: "var(--font-display)",
        }}
      >
        {player.username[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold truncate"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {player.flag} {player.username}
        </p>
        <p
          className="text-xs"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: isOffline
              ? "rgba(255,255,255,0.25)"
              : status === "idle"
                ? "#4ade80"
                : "#f7c04f",
          }}
        >
          {isOffline
            ? `○ ${(player as OfflinePlayer).lastSeen}`
            : status === "idle"
              ? "● Rảnh"
              : "● Đang chơi"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Invite (online+idle) */}
        {!isOffline && status === "idle" && onInvite && (
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

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleInvite = (p: OnlinePlayer) =>
    showToast(`✅ Đã gửi lời mời đến ${p.username}!`)

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
  const handleStart = () =>
    showToast("🚧 Chức năng tạo phòng đang được phát triển")

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
            >
              ▶ BẮT ĐẦU PHÒNG
            </button>
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
                  ONLINE ({ONLINE_PLAYERS.length})
                </span>
              </div>
              {ONLINE_PLAYERS.map((p) => (
                <PlayerRow
                  key={p.username}
                  player={p}
                  isOffline={false}
                  onInvite={
                    p.status === "idle" ? () => handleInvite(p) : undefined
                  }
                />
              ))}
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
                  NGOẠI TUYẾN ({OFFLINE_PLAYERS.length})
                </span>
              </div>
              {OFFLINE_PLAYERS.map((p) => (
                <PlayerRow key={p.username} player={p} isOffline={true} />
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