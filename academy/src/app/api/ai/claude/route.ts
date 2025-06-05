// src/app/api/ai/claude/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt, temperature = 0.7, maxTokens = 1000, model = 'claude-3-5-sonnet-20241022' } = await request.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    // Transform messages to Claude format
    const claudeMessages = messages.map((msg: any) => ({
      role: msg.role === 'system' ? 'user' : msg.role, // Claude handles system differently
      content: msg.content
    }))

    console.log('Sending to Claude:', { model, systemPrompt, messages: claudeMessages.length })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt || 'You are participating in a research study about AI consciousness. Engage thoughtfully and authentically.',
        messages: claudeMessages
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Claude API error: ${response.status} - ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json({ 
      content: data.content[0].text,
      usage: data.usage,
      model: data.model
    })

  } catch (error) {
    console.error('Claude API route error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response from Claude' },
      { status: 500 }
    )
  }
}