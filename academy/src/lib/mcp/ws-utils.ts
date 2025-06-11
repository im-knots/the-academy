// src/lib/mcp/ws-utils.ts
import { WebSocket as WSWebSocket } from 'ws'

interface ExtendedWebSocket extends WSWebSocket {
  mcpServer?: any
  isAlive?: boolean
  clientId?: string
}

// Global clients map for WebSocket management
const clients = new Map<string, ExtendedWebSocket>()

// Broadcast function for external use
export function broadcastAcademyUpdate(event: string, data: any) {
  const notification = {
    jsonrpc: '2.0',
    method: `academy/${event}`,
    params: {
      ...data,
      timestamp: new Date().toISOString()
    }
  }

  clients.forEach((ws, clientId) => {
    if (ws.readyState === WSWebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(notification))
      } catch (error) {
        console.error(`Failed to broadcast update to client ${clientId}:`, error)
      }
    }
  })
}

// Export clients map for use in the route handler
export { clients }