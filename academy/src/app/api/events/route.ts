// src/app/api/events/route.ts
// Server-Sent Events endpoint for real-time updates

import { serverEvents, ServerEvent } from '@/lib/events/serverEvents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('sessionId')
  
  console.log(`📡 SSE: New connection${sessionId ? ` for session ${sessionId}` : ' (all events)'}`)

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      // Send initial connection message
      const connectMessage = `data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
      controller.enqueue(encoder.encode(connectMessage))

      // Subscribe to server events
      const unsubscribe = serverEvents.subscribe((event: ServerEvent) => {
        // Filter by sessionId if specified
        if (sessionId && event.sessionId && event.sessionId !== sessionId) {
          return
        }

        try {
          const message = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          console.error('📡 SSE: Error sending event:', error)
        }
      })

      // Keep-alive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          const ping = `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`
          controller.enqueue(encoder.encode(ping))
        } catch {
          // Connection might be closed
          clearInterval(keepAliveInterval)
        }
      }, 30000)

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log(`📡 SSE: Connection closed${sessionId ? ` for session ${sessionId}` : ''}`)
        unsubscribe()
        clearInterval(keepAliveInterval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

