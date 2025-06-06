// src/app/api/ai/claude/route.ts - With abort signal support
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Create abort controller for this request
  const abortController = new AbortController()
  
  // Listen for client disconnect
  request.signal?.addEventListener('abort', () => {
    console.log('🛑 Client disconnected, aborting Claude request')
    abortController.abort()
  })

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

    // Check if already aborted
    if (abortController.signal.aborted) {
      return NextResponse.json(
        { error: 'Request was cancelled' },
        { status: 499 }
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

    // Ensure alternating pattern and merge consecutive messages of same type
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
      system: systemPrompt || 'You are a thoughtful AI participating in a research dialogue.',
      messages: alternatingMessages
    }

    console.log('Sending to Claude:', { 
      model, 
      messageCount: alternatingMessages.length,
      temperature,
      maxTokens: requestBody.max_tokens,
      hasSystemPrompt: !!systemPrompt
    })

    const startTime = Date.now()
    
    // Check abort before making request
    if (abortController.signal.aborted) {
      return NextResponse.json(
        { error: 'Request was cancelled' },
        { status: 499 }
      )
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal // Pass abort signal to external API
    })

    const responseTime = Date.now() - startTime

    // Check if we were aborted during the request
    if (abortController.signal.aborted) {
      console.log('🛑 Claude request was aborted during API call')
      return NextResponse.json(
        { error: 'Request was cancelled' },
        { status: 499 }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: { message: errorText } }
      }

      console.error('Claude API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        requestPreview: {
          model: requestBody.model,
          messageCount: requestBody.messages.length,
          temperature: requestBody.temperature
        }
      })
      
      // Provide more specific error messages based on Claude error types
      let userFriendlyError = `Claude API error: ${response.status}`
      
      if (errorData.error?.type === 'rate_limit_error') {
        userFriendlyError = 'Rate limit exceeded. Please wait a moment and try again.'
      } else if (errorData.error?.type === 'invalid_request_error') {
        userFriendlyError = `Invalid request: ${errorData.error.message}`
      } else if (response.status === 401) {
        userFriendlyError = 'Invalid Claude API key'
      } else if (response.status === 400) {
        userFriendlyError = `Bad request: ${errorData.error?.message || 'Invalid parameters'}`
      } else if (response.status >= 500) {
        userFriendlyError = 'Claude service temporarily unavailable'
      }
      
      return NextResponse.json(
        { error: userFriendlyError },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Final abort check before returning
    if (abortController.signal.aborted) {
      console.log('🛑 Claude request was aborted after receiving response')
      return NextResponse.json(
        { error: 'Request was cancelled' },
        { status: 499 }
      )
    }
    
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
      usage: data.usage,
      stopReason: data.stop_reason
    })
    
    return NextResponse.json({ 
      content: content,
      usage: data.usage,
      model: data.model,
      responseTime,
      stopReason: data.stop_reason
    })

  } catch (error) {
    console.error('Claude API route error:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('🛑 Claude request was properly aborted')
        return NextResponse.json(
          { error: 'Request was cancelled' },
          { status: 499 }
        )
      }
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
      if (error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Claude API request timed out' },
          { status: 504 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to generate response from Claude' },
      { status: 500 }
    )
  }
}