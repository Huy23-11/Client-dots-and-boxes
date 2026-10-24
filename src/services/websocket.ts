// src/services/websocket.ts
//
// WebSocket service dùng chung cho toàn bộ app (singleton `wsService`).
// Kết nối tới bridge (bridge-server/bridge.js, cổng 8443); bridge chuyển WebSocket <-> TCP của Java server.
//
// Mọi message từ server tới React có dạng JSON:
//   { type: "message", data: "OPCODE,,payload" }   // gói tin của game server
//   { type: "connected" | "disconnected" | "error", ... }  // trạng thái của bridge

export type WsStatus = "connecting" | "connected" | "error"
export type WsMessageListener = (data: any) => void

export class WebSocketBridge {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000
  private isConnecting = false
  private manualClose = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private status: WsStatus = "connecting"
  private messageListeners = new Set<WsMessageListener>()
  private statusListeners = new Set<(s: WsStatus) => void>()

  getStatus() {
    return this.status
  }

  private setStatus(s: WsStatus) {
    this.status = s
    this.statusListeners.forEach((fn) => fn(s))
  }

  // Đăng ký nhận message từ server. Trả về hàm huỷ đăng ký.
  subscribe(fn: WsMessageListener) {
    this.messageListeners.add(fn)
    return () => {
      this.messageListeners.delete(fn)
    }
  }

  // Đăng ký nhận thay đổi trạng thái kết nối. Trả về hàm huỷ đăng ký.
  onStatusChange(fn: (s: WsStatus) => void) {
    this.statusListeners.add(fn)
    return () => {
      this.statusListeners.delete(fn)
    }
  }

  connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.manualClose = false
    this.isConnecting = true
    this.setStatus("connecting")
    try {
      // ✅ Connect to Bridge WebSocket
      const socket = new WebSocket("ws://localhost:8443")
      this.ws = socket

      socket.onopen = () => {
        if (this.ws !== socket) return
        console.log("✅ Connected to WebSocket Bridge")
        this.reconnectAttempts = 0
        this.isConnecting = false
        this.setStatus("connected")
      }

      socket.onmessage = (event) => {
        if (this.ws !== socket) return
        try {
          const response = JSON.parse(event.data)
          console.log("📥 Response from server:", response)
          this.messageListeners.forEach((fn) => fn(response))
        } catch (e) {
          console.error("Failed to parse message:", e)
        }
      }

      socket.onerror = (error) => {
        if (this.ws !== socket) return
        console.error("❌ WebSocket error:", error)
        this.isConnecting = false
        this.setStatus("error")
      }

      socket.onclose = () => {
        if (this.ws !== socket) return
        console.log("🔌 Disconnected from bridge")
        this.ws = null
        this.isConnecting = false
        if (!this.manualClose) this.attemptReconnect()
      }
    } catch (error) {
      console.error("Failed to create WebSocket:", error)
      this.isConnecting = false
      this.setStatus("error")
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(
        `🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      )
      this.setStatus("connecting")
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay)
    } else {
      this.setStatus("error")
    }
  }

  sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("📤 Sending to server:", message)
      this.ws.send(message)
    } else {
      console.warn("⚠️ WebSocket not connected")
    }
  }

  login(username: string, password: string) {
    // Format: LOGIN,,username;password
    const loginMsg = `LOGIN,,${username};${password}`
    this.sendMessage(loginMsg)
  }

  disconnect() {
    this.manualClose = true
    this.isConnecting = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const socket = this.ws
    this.ws = null
    if (socket) socket.close()
  }
}

// Export singleton
export const wsService = new WebSocketBridge()