// src/app/api/ai/openai/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt, temperature = 0.7, maxTokens = 1000, model = 'gpt-4o' } = await request.json()

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OpenAI API key not configured')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
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

    // Transform messages to proper OpenAI format
    const openaiMessages = validMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content.trim()
    }))

    // Add system prompt as first message if provided
    const finalMessages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...openaiMessages
    ]

    // Validate message sequence for OpenAI
    const validatedMessages = validateMessageSequence(finalMessages)

    const requestBody = {
      model: model,
      messages: validatedMessages,
      max_tokens: Math.min(maxTokens, 4000), // OpenAI has limits
      temperature: Math.max(0, Math.min(1, temperature)), // Ensure valid range
    }

    console.log('Sending to OpenAI:', { 
      model, 
      messageCount: validatedMessages.length,
      temperature,
      maxTokens: requestBody.max_tokens,
      hasSystemPrompt: !!systemPrompt
    })

    const startTime = Date.now()
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    const responseTime = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: { message: errorText } }
      }

      console.error('OpenAI API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        requestPreview: {
          model: requestBody.model,
          messageCount: requestBody.messages.length,
          temperature: requestBody.temperature
        }
      })
      
      // Provide more specific error messages based on OpenAI error types
      let userFriendlyError = `OpenAI API error: ${response.status}`
      
      if (errorData.error?.code === 'rate_limit_exceeded') {
        userFriendlyError = 'Rate limit exceeded. Please wait a moment and try again.'
      } else if (errorData.error?.code === 'insufficient_quota') {
        userFriendlyError = 'OpenAI quota exceeded. Please check your API usage.'
      } else if (errorData.error?.code === 'invalid_request_error') {
        userFriendlyError = `Invalid request: ${errorData.error.message}`
      } else if (response.status === 401) {
        userFriendlyError = 'Invalid OpenAI API key'
      } else if (response.status >= 500) {
        userFriendlyError = 'OpenAI service temporarily unavailable'
      }
      
      return NextResponse.json(
        { error: userFriendlyError },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid OpenAI response format:', data)
      return NextResponse.json(
        { error: 'Invalid response format from OpenAI' },
        { status: 500 }
      )
    }

    const content = data.choices[0]?.message?.content
    if (!content) {
      console.error('No content in OpenAI response:', data)
      return NextResponse.json(
        { error: 'No content in OpenAI response' },
        { status: 500 }
      )
    }

    console.log('OpenAI response success:', {
      model: data.model,
      responseTime: `${responseTime}ms`,
      contentLength: content.length,
      usage: data.usage,
      finishReason: data.choices[0]?.finish_reason
    })
    
    return NextResponse.json({ 
      content: content,
      usage: data.usage,
      model: data.model,
      responseTime,
      finishReason: data.choices[0]?.finish_reason
    })

  } catch (error) {
    console.error('OpenAI API route error:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return NextResponse.json(
          { error: 'Network error connecting to OpenAI API' },
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
          { error: 'OpenAI API request timed out' },
          { status: 504 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to generate response from GPT' },
      { status: 500 }
    )
  }
}

// Helper function to validate and clean up message sequence
function validateMessageSequence(messages: any[]) {
  const validatedMessages = []
  let lastRole = null

  for (const msg of messages) {
    // Skip duplicate consecutive messages from same role (except system)
    if (msg.role === lastRole && msg.role !== 'system') {
      // Merge with previous message instead of skipping
      if (validatedMessages.length > 0) {
        const lastMessage = validatedMessages[validatedMessages.length - 1]
        lastMessage.content += '\n\n' + msg.content
      }
      continue
    }

    // Ensure we don't have system messages in the middle
    if (msg.role === 'system' && validatedMessages.length > 0) {
      // Convert to user message if system message appears after other messages
      validatedMessages.push({
        role: 'user',
        content: `[System Context] ${msg.content}`
      })
    } else {
      validatedMessages.push({
        role: msg.role,
        content: msg.content
      })
    }

    lastRole = msg.role
  }

  return validatedMessages
}