// src/app/api/conversation/stop/route.ts
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
    
    conversationManager.stopConversation(sessionId)

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation stopped' 
    })

  } catch (error) {
    console.error('Error stopping conversation:', error)
    return NextResponse.json(
      { error: 'Failed to stop conversation' },
      { status: 500 }
    )
  }
}