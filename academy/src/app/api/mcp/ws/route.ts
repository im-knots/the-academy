// src/app/api/mcp/ws/route.ts
import { NextRequest } from 'next/server'
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws'
import { MCPServer, setMCPStoreReference } from '@/lib/mcp/server'
import { clients } from '@/lib/mcp/ws-utils'

interface ExtendedWebSocket extends WSWebSocket {
  mcpServer?: MCPServer
  isAlive?: boolean
  clientId?: string
}

// Global WebSocket server instance
let wss: WebSocketServer | null = null

// Initialize WebSocket server on first request
function initializeWebSocketServer() {
  if (wss) return wss

  wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: ExtendedWebSocket, request) => {
    const clientId = generateClientId()
    ws.clientId = clientId
    ws.isAlive = true
    clients.set(clientId, ws)

    console.log(`MCP WebSocket client connected: ${clientId}`)

    // Initialize MCP server for this connection
    ws.mcpServer = new MCPServer()

    // Set up ping/pong for connection health
    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(`MCP WebSocket received from ${clientId}:`, message.method || message.id)

        if (ws.mcpServer) {
          const response = await ws.mcpServer.handleRequest(message)
          
          // Send response back to client
          if (ws.readyState === WSWebSocket.OPEN) {
            ws.send(JSON.stringify(response))
          }

          // Handle notifications that should be broadcast
          if (message.method && shouldBroadcast(message.method)) {
            broadcastNotification(message.method, message.params, clientId)
          }
        }
      } catch (error) {
        console.error(`Error handling MCP WebSocket message from ${clientId}:`, error)
        
        // Send error response
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error'
          }
        }
        
        if (ws.readyState === WSWebSocket.OPEN) {
          ws.send(JSON.stringify(errorResponse))
        }
      }
    })

    ws.on('close', () => {
      console.log(`MCP WebSocket client disconnected: ${clientId}`)
      clients.delete(clientId)
    })

    ws.on('error', (error: Error) => {
      console.error(`MCP WebSocket error for client ${clientId}:`, error)
      clients.delete(clientId)
    })

    // Send welcome message
    const welcomeMessage = {
      jsonrpc: '2.0',
      method: 'academy/welcome',
      params: {
        clientId,
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.0.0',
          capabilities: ['real-time-updates', 'conversation-control', 'analysis']
        }
      }
    }

    if (ws.readyState === WSWebSocket.OPEN) {
      ws.send(JSON.stringify(welcomeMessage))
    }
  })

  // Set up periodic ping to check connection health
  const pingInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const extendedWs = ws as ExtendedWebSocket
      if (!extendedWs.isAlive) {
        extendedWs.terminate()
        if (extendedWs.clientId) {
          clients.delete(extendedWs.clientId)
        }
        return
      }

      extendedWs.isAlive = false
      extendedWs.ping()
    })
  }, 30000) // 30 seconds

  wss.on('close', () => {
    clearInterval(pingInterval)
  })

  return wss
}

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function shouldBroadcast(method: string): boolean {
  const broadcastMethods = [
    'call_tool', // Tool calls that modify state
    'send_message',
    'start_conversation',
    'pause_conversation',
    'resume_conversation',
    'stop_conversation',
    'inject_prompt',
    'create_session',
    'add_participant'
  ]
  
  return broadcastMethods.includes(method)
}

function broadcastNotification(method: string, params: any, excludeClientId?: string) {
  const notification = {
    jsonrpc: '2.0',
    method: `academy/${method}_notification`,
    params: {
      ...params,
      timestamp: new Date().toISOString(),
      fromClient: excludeClientId
    }
  }

  clients.forEach((ws, clientId) => {
    if (clientId !== excludeClientId && ws.readyState === WSWebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(notification))
      } catch (error) {
        console.error(`Failed to send notification to client ${clientId}:`, error)
      }
    }
  })
}

// Handle HTTP upgrade to WebSocket
export async function GET(request: NextRequest) {
  const upgradeHeader = request.headers.get('upgrade')
  
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 })
  }

  try {
    // Initialize WebSocket server
    const server = initializeWebSocketServer()
    
    // This is a simplified example - in a real Next.js environment,
    // you would need to handle the WebSocket upgrade differently
    // The actual implementation depends on your deployment environment
    
    return new Response('WebSocket upgrade not handled in this context', {
      status: 501,
      headers: {
        'Content-Type': 'text/plain'
      }
    })
  } catch (error) {
    console.error('Error upgrading to WebSocket:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

// For environments that support it, handle the upgrade event
export const dynamic = 'force-dynamic'