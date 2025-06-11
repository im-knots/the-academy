// src/lib/ai/openai.ts
import { AIProvider, ConversationContext } from '../mcp/types'

export class OpenAIProvider implements AIProvider {
  type = 'gpt' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateResponse(context: ConversationContext): Promise<string> {
    try {
      const messages = [
        ...(context.systemPrompt ? [{ role: 'system' as const, content: context.systemPrompt }] : []),
        ...context.messageHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ]

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: messages,
          max_tokens: context.settings.maxTokens,
          temperature: context.settings.temperature
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      console.error('OpenAI provider error:', error)
      throw new Error('Failed to generate response from GPT')
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }
}