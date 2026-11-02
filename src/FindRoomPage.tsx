import { useEffect, useState } from "react"
import type { UserProfile } from "./data"
import {
  OP,
  splitServerMessage,
  parseUsersList,
  type ServerUser,
} from "./services/protocol"
import { wsService } from "./services/websocket"

interface FindRoomPageProps {
  user: UserProfile
  onBack: () => void
}

export default function FindRoomPage({
  user,
  onBack,
}: FindRoomPageProps) {
  const [roomCode, setRoomCode] = useState("")
  const [serverUsers, setServerUsers] = useState<ServerUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<"error" | "success">("error")

  const showMessage = (
    text: string,
    type: "error" | "success" = "error"
  ) => {
    setMessage(text)
    setMessageType(type)
  }

  useEffect(() => {
    const off = wsService.subscribe((response) => {
      if (response?.type !== "message") return

      const msg = splitServerMessage(response.data)
      if (!msg) return

      // Nhận danh sách tài khoản để lấy userId của người đang đăng nhập
      if (msg.opcode === OP.REPLY_USERS_AVAILABLE_LIST) {
        setServerUsers(parseUsersList(msg.params))
        setUsersLoading(false)
        return
      }

      // Nhận kết quả tìm phòng từ Java Server
      if (msg.opcode === OP.REPLY_FIND_ROOM) {
        const status = msg.params.trim().toUpperCase()

        switch (status) {
            case "SUCCESS":
            setJoining(false)
            showMessage("Tham gia phòng thành công! Đang chuyển vào trận...", "success")
            // App.tsx nhận MATCH_FOUND và tự chuyển sang GamePage.
            break

            case "INVALID_CODE":
            setJoining(false)
            showMessage("Mã phòng không tồn tại hoặc đã hết hạn.")
            break

            case "CANNOT_JOIN_OWN_ROOM":
            setJoining(false)
            showMessage("Mày không thể tham gia phòng do chính mình tạo.")
            break

            case "IS_FULL":
            setJoining(false)
            showMessage("Phòng này đã có người tham gia.")
            break

            case "OWNER_BUSY":
            setJoining(false)
            showMessage("Chủ phòng hiện không thể tham gia trận đấu.")
            break

            case "ALREADY_BUSY":
            setJoining(false)
            showMessage("Tài khoản của mày đang ở trong phòng hoặc trận đấu khác.")
            break

            case "FAIL":
            setJoining(false)
            showMessage("Không thể tham gia phòng. Hãy kiểm tra lại trạng thái chủ phòng.")
            break

            default:
            setJoining(false)
            showMessage(`Lỗi tham gia phòng: ${status}`)
            break
        }
      }
    })

    // Lấy userId giống cách CreateRoomPage đang thực hiện
    wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)

    return off
  }, [])

  const handleJoinRoom = () => {
    if (joining) return

    if (wsService.getStatus() !== "connected") {
      showMessage("Chưa kết nối tới server.")
      return
    }

    const code = roomCode.trim()

    if (!code) {
      showMessage("Hãy nhập mã phòng.")
      return
    }

    const currentUser = serverUsers.find(
      (p) => p.username === user.username
    )

    if (!currentUser) {
      setUsersLoading(true)
      wsService.sendMessage(`${OP.GET_USERS_AVAILABLE_LIST},,`)
      showMessage("Chưa lấy được ID tài khoản. Hãy thử lại sau.")
      return
    }

    setJoining(true)
    setMessage(null)

    // Định dạng Java đang yêu cầu: userId;roomCode
    wsService.sendMessage(
      `${OP.FIND_ROOM},,${currentUser.userId};${code}`
    )
  }

  return (
    <div
      className="dot-grid min-h-screen flex items-center justify-center p-6"
      style={{ color: "#e8eaf6" }}
    >
      <div
        className="glass rounded-2xl p-8 w-full"
        style={{
          maxWidth: 440,
          border: "1px solid rgba(79,142,247,0.2)",
        }}
      >
        <button
          className="btn-ghost px-4 py-2 mb-6"
          onClick={onBack}
          disabled={joining}
        >
          ← Quay lại
        </button>

        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1
            className="text-2xl font-black tracking-widest"
            style={{ fontFamily: "var(--font-display)" }}
          >
            THAM GIA PHÒNG
          </h1>
          <p className="text-sm mt-2 text-white/50">
            Nhập mã phòng được chia sẻ để tham gia trận đấu.
          </p>
        </div>

        <label className="block text-sm mb-2 text-white/70">
          Mã phòng
        </label>

        <input
          type="text"
          value={roomCode}
          onChange={(e) => {
            setRoomCode(e.target.value)
            setMessage(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleJoinRoom()
          }}
          placeholder="Nhập mã phòng..."
          disabled={joining}
          autoComplete="off"
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(79,142,247,0.25)",
            color: "#fff",
          }}
        />

        {message && (
          <p
            className="text-sm mt-3"
            style={{
              color: messageType === "success" ? "#4ade80" : "#f87171",
            }}
          >
            {message}
          </p>
        )}

        <button
          className="btn-primary w-full py-3 mt-6"
          onClick={handleJoinRoom}
          disabled={joining || usersLoading}
        >
          {joining
            ? "ĐANG TÌM PHÒNG..."
            : usersLoading
              ? "ĐANG KẾT NỐI..."
              : "THAM GIA PHÒNG"}
        </button>
      </div>
    </div>
  )
}