// src/app/api/conversation/start/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, initialPrompt } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    console.log('Conversation start requested for session:', sessionId)

    // Simple acknowledgment - the actual conversation will run client-side
    return NextResponse.json({ 
      success: true, 
      message: 'Conversation start acknowledged',
      sessionId 
    })

  } catch (error) {
    console.error('Error in conversation start route:', error)
    return NextResponse.json(
      { error: 'Failed to start conversation' },
      { status: 500 }
    )
  }
}