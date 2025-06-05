// src/app/api/ai/openai/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt, temperature = 0.7, maxTokens = 1000, model = 'gpt-4o' } = await request.json()

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Prepare messages with system prompt
    const gptMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages
    ]

    console.log('Sending to OpenAI:', { model, messages: gptMessages.length })

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: gptMessages,
        max_tokens: maxTokens,
        temperature: temperature
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      return NextResponse.json(
        { error: `OpenAI API error: ${response.status} - ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json({ 
      content: data.choices[0].message.content,
      usage: data.usage,
      model: data.model
    })

  } catch (error) {
    console.error('OpenAI API route error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response from GPT' },
      { status: 500 }
    )
  }
}