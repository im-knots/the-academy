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
      console.error('Invalid messages format:', messages)
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Filter and validate messages more thoroughly
    const validMessages = messages.filter(msg => {
      if (!msg || typeof msg !== 'object') {
        console.warn('Skipping non-object message:', msg)
        return false
      }
      if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) {
        console.warn('Skipping message with invalid content:', msg)
        return false
      }
      if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
        console.warn('Skipping message with invalid role:', msg)
        return false
      }
      return true
    })

    if (validMessages.length === 0) {
      console.error('No valid messages after filtering')
      return NextResponse.json(
        { error: 'No valid messages provided' },
        { status: 400 }
      )
    }

    // Build messages array with proper formatting for OpenAI
    const openaiMessages = []
    
    // Add system prompt as a system message if provided
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
      openaiMessages.push({
        role: 'system',
        content: systemPrompt.trim()
      })
    }

    // Process and clean up messages
    for (const msg of validMessages) {
      let role = msg.role
      let content = msg.content.trim()

      // Skip empty content after trimming
      if (!content) continue

      // Ensure valid roles for OpenAI
      if (role === 'system' && systemPrompt) {
        // If we already have a system prompt, convert system messages to user messages
        role = 'user'
        content = `[Context] ${content}`
      }

      // Ensure role is valid
      if (!['user', 'assistant', 'system'].includes(role)) {
        role = 'user' // Default to user for safety
      }

      openaiMessages.push({
        role: role,
        content: content
      })
    }

    // Ensure we have at least one message
    if (openaiMessages.length === 0) {
      console.error('No messages to send after processing')
      return NextResponse.json(
        { error: 'No valid messages to send' },
        { status: 400 }
      )
    }

    // Ensure conversation starts with a non-assistant message for OpenAI
    if (openaiMessages[0].role === 'assistant') {
      openaiMessages.unshift({
        role: 'user',
        content: 'Please continue the conversation.'
      })
    }

    // Validate final message array
    for (let i = 0; i < openaiMessages.length; i++) {
      const msg = openaiMessages[i]
      if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
        console.error(`Invalid message at index ${i}:`, msg)
        return NextResponse.json(
          { error: `Invalid message format at index ${i}` },
          { status: 400 }
        )
      }
    }

    const requestBody = {
      model: model,
      messages: openaiMessages,
      max_tokens: Math.min(maxTokens, 4000), // OpenAI has limits
      temperature: Math.max(0, Math.min(2, temperature)), // OpenAI allows 0-2
      stream: false
    }

    console.log('Sending to OpenAI:', { 
      model, 
      messageCount: openaiMessages.length,
      temperature: requestBody.temperature,
      maxTokens: requestBody.max_tokens,
      firstMessage: openaiMessages[0]?.role,
      lastMessage: openaiMessages[openaiMessages.length - 1]?.role
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
        errorData = { message: errorText }
      }

      console.error('OpenAI API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        requestBody: JSON.stringify(requestBody, null, 2)
      })
      
      // Provide more specific error messages
      let errorMessage = `OpenAI API error: ${response.status}`
      if (errorData?.error?.message) {
        errorMessage += ` - ${errorData.error.message}`
      }
      
      return NextResponse.json(
        { error: errorMessage },
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

    const choice = data.choices[0]
    if (!choice?.message?.content) {
      console.error('No message content in OpenAI response:', data)
      return NextResponse.json(
        { error: 'No content in OpenAI response' },
        { status: 500 }
      )
    }

    const content = choice.message.content
    if (typeof content !== 'string' || content.trim() === '') {
      console.error('Invalid content type in OpenAI response:', typeof content, content)
      return NextResponse.json(
        { error: 'Invalid content in OpenAI response' },
        { status: 500 }
      )
    }

    console.log('OpenAI response success:', {
      model: data.model,
      responseTime: `${responseTime}ms`,
      contentLength: content.length,
      usage: data.usage,
      finishReason: choice.finish_reason
    })
    
    return NextResponse.json({ 
      content: content.trim(),
      usage: data.usage,
      model: data.model,
      responseTime,
      finishReason: choice.finish_reason
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
      if (error.message.includes('abort')) {
        return NextResponse.json(
          { error: 'Request was cancelled' },
          { status: 499 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to generate response from GPT' },
      { status: 500 }
    )
  }
}