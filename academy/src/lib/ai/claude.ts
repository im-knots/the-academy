// src/lib/ai/claude.ts
import { AIProvider, ConversationContext } from '../mcp/types'

export class ClaudeProvider implements AIProvider {
  type = 'claude' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateResponse(context: ConversationContext): Promise<string> {
    try {
      const messages = context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: context.settings.maxTokens,
          temperature: context.settings.temperature,
          system: context.systemPrompt,
          messages: messages
        })
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.content[0].text
    } catch (error) {
      console.error('Claude provider error:', error)
      throw new Error('Failed to generate response from Claude')
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }
}
