// src/app/api/ai/claude/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt, temperature = 0.7, maxTokens = 1000, model = 'claude-3-5-sonnet-20241022' } = await request.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('Anthropic API key not configured')
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Filter out any empty messages and ensure proper format
    const validMessages = messages.filter(msg => 
      msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
    )

    if (validMessages.length === 0) {
      return NextResponse.json(
        { error: 'No valid messages provided' },
        { status: 400 }
      )
    }

    // Transform messages to Claude format - Claude doesn't support system role in messages
    const claudeMessages = validMessages.map((msg: any) => {
      let role = msg.role
      let content = msg.content

      // Handle system messages by converting to user messages
      if (role === 'system') {
        role = 'user'
        content = `[System Context] ${content}`
      }

      // Ensure alternating user/assistant pattern for Claude
      return {
        role: role === 'user' ? 'user' : 'assistant',
        content: content.trim()
      }
    })

    // Ensure the conversation starts with a user message
    if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
      claudeMessages.unshift({
        role: 'user',
        content: 'Please respond to the following conversation:'
      })
    }

    // Ensure alternating pattern
    const alternatingMessages = []
    let expectedRole = 'user'

    for (const msg of claudeMessages) {
      if (msg.role === expectedRole) {
        alternatingMessages.push(msg)
        expectedRole = expectedRole === 'user' ? 'assistant' : 'user'
      } else if (alternatingMessages.length > 0) {
        // If roles don't alternate, combine with previous message of same type
        const lastMsg = alternatingMessages[alternatingMessages.length - 1]
        if (lastMsg.role === msg.role) {
          lastMsg.content += '\n\n' + msg.content
        } else {
          alternatingMessages.push(msg)
          expectedRole = expectedRole === 'user' ? 'assistant' : 'user'
        }
      }
    }

    const requestBody = {
      model: model,
      max_tokens: Math.min(maxTokens, 4000), // Claude has limits
      temperature: Math.max(0, Math.min(1, temperature)), // Ensure valid range
      system: systemPrompt || 'You are a thoughtful AI participating in a Socratic dialogue.',
      messages: alternatingMessages
    }

    console.log('Sending to Claude:', { 
      model, 
      messageCount: alternatingMessages.length,
      temperature,
      maxTokens: requestBody.max_tokens
    })

    const startTime = Date.now()
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    })

    const responseTime = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        requestBody: JSON.stringify(requestBody, null, 2)
      })
      
      return NextResponse.json(
        { error: `Claude API error: ${response.status} - ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      console.error('Invalid Claude response format:', data)
      return NextResponse.json(
        { error: 'Invalid response format from Claude' },
        { status: 500 }
      )
    }

    const content = data.content[0]?.text
    if (!content) {
      console.error('No text content in Claude response:', data)
      return NextResponse.json(
        { error: 'No text content in Claude response' },
        { status: 500 }
      )
    }

    console.log('Claude response success:', {
      model: data.model,
      responseTime: `${responseTime}ms`,
      contentLength: content.length,
      usage: data.usage
    })
    
    return NextResponse.json({ 
      content: content,
      usage: data.usage,
      model: data.model,
      responseTime
    })

  } catch (error) {
    console.error('Claude API route error:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return NextResponse.json(
          { error: 'Network error connecting to Claude API' },
          { status: 503 }
        )
      }
      if (error.message.includes('JSON')) {
        return NextResponse.json(
          { error: 'Invalid request format' },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to generate response from Claude' },
      { status: 500 }
    )
  }
}