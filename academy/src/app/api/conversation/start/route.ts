// src/app/api/conversation/start/route.ts
import { NextRequest, NextResponse } from 'next/server'

interface StartConversationRequest {
  sessionId: string
  initialPrompt?: string
}

// In-memory conversation managers (in production, you'd want proper state management)
const activeConversations = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const { sessionId, initialPrompt }: StartConversationRequest = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Import conversation manager dynamically to avoid SSR issues
    const { conversationManager } = await import('@/lib/ai/conversation-manager')

    // Start the conversation
    await conversationManager.startConversation(sessionId, initialPrompt)
    activeConversations.set(sessionId, { status: 'active', startedAt: new Date() })

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation started',
      sessionId 
    })

  } catch (error) {
    console.error('Error starting conversation:', error)
    return NextResponse.json(
      { error: 'Failed to start conversation' },
      { status: 500 }
    )
  }
}

// src/app/api/conversation/pause/route.ts
import { NextRequest, NextResponse } from 'next/server'

interface PauseConversationRequest {
  sessionId: string
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId }: PauseConversationRequest = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const { conversationManager } = await import('@/lib/ai/conversation-manager')
    conversationManager.pauseConversation()

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

// src/app/api/conversation/resume/route.ts
import { NextRequest, NextResponse } from 'next/server'

interface ResumeConversationRequest {
  sessionId: string
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId }: ResumeConversationRequest = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const { conversationManager } = await import('@/lib/ai/conversation-manager')
    conversationManager.resumeConversation()

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

// src/app/api/conversation/stop/route.ts
import { NextRequest, NextResponse } from 'next/server'

interface StopConversationRequest {
  sessionId: string
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId }: StopConversationRequest = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const { conversationManager } = await import('@/lib/ai/conversation-manager')
    conversationManager.stopConversation()

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

// src/app/api/ai/claude/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, temperature = 0.7, maxTokens = 1000, systemPrompt } = await request.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt,
        messages: messages
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: `Claude API error: ${error}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ 
      content: data.content[0].text,
      usage: data.usage 
    })

  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response from Claude' },
      { status: 500 }
    )
  }
}

// src/app/api/ai/openai/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, temperature = 0.7, maxTokens = 1000, systemPrompt } = await request.json()

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const messagesWithSystem = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: messagesWithSystem,
        max_tokens: maxTokens,
        temperature: temperature
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: `OpenAI API error: ${error}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ 
      content: data.choices[0].message.content,
      usage: data.usage 
    })

  } catch (error) {
    console.error('OpenAI API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response from GPT' },
      { status: 500 }
    )
  }
}

// src/lib/api/conversation.ts (Client-side API helpers)
export class ConversationAPI {
  static async startConversation(sessionId: string, initialPrompt?: string) {
    const response = await fetch('/api/conversation/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, initialPrompt }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to start conversation')
    }

    return response.json()
  }

  static async pauseConversation(sessionId: string) {
    const response = await fetch('/api/conversation/pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to pause conversation')
    }

    return response.json()
  }

  static async resumeConversation(sessionId: string) {
    const response = await fetch('/api/conversation/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to resume conversation')
    }

    return response.json()
  }

  static async stopConversation(sessionId: string) {
    const response = await fetch('/api/conversation/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to stop conversation')
    }

    return response.json()
  }
}