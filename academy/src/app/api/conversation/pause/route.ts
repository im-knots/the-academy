// src/app/api/conversation/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const { ConversationManager } = await import('@/lib/ai/conversation-manager')
    const conversationManager = ConversationManager.getInstance()
    
    conversationManager.pauseConversation(sessionId)

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation paused' 
    })

  } catch (error) {
    console.error('Error pausing conversation:', error)
    return NextResponse.json(
      { error: 'Failed to pause conversation' },
      { status: 500 }
    )
  }
}