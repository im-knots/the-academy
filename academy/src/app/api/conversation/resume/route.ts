// src/app/api/conversation/resume/route.ts
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
    
    conversationManager.resumeConversation(sessionId)

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation resumed' 
    })

  } catch (error) {
    console.error('Error resuming conversation:', error)
    return NextResponse.json(
      { error: 'Failed to resume conversation' },
      { status: 500 }
    )
  }
}