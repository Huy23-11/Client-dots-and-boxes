// src/services/websocket.ts
export class WebSocketBridge {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  connect(onMessage: (data: any) => void, onError: (err: string) => void) {
    try {
      // ✅ Kết nối tới Bridge (không phải Vite dev server)
      this.ws = new WebSocket('ws://localhost:9000');

      this.ws.onopen = () => {
        console.log('✅ Connected to WebSocket Bridge');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          console.log('📥 Response from server:', response);
          onMessage(response);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        onError('Connection error');
      };

      this.ws.onclose = () => {
        console.log('🔌 Disconnected from bridge');
        this.attemptReconnect(onMessage, onError);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      onError(String(error));
    }
  }

  private attemptReconnect(
    onMessage: (data: any) => void,
    onError: (err: string) => void
  ) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(onMessage, onError), this.reconnectDelay);
    } else {
      onError('Failed to reconnect after multiple attempts');
    }
  }

  sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending to server:', message);
      this.ws.send(message);
    } else {
      console.warn('⚠️ WebSocket not connected');
    }
  }

  login(username: string, password: string) {
    // Format: LOGIN,,username;password
    const loginMsg = `LOGIN,,${username};${password}`;
    this.sendMessage(loginMsg);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export singleton
export const wsService = new WebSocketBridge();