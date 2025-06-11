// src/lib/mcp/types.ts
export interface MCPMessage {
  id: string
  type: 'request' | 'response' | 'notification'
  method?: string
  params?: any
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

interface ConversationContext {
  sessionId: string
  participantId: string
  messageHistory: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    participantId: string
    timestamp: Date
  }>
  systemPrompt?: string
  settings: {
    temperature: number
    maxTokens: number
    model?: string
    responseDelay?: number
  }
}

export interface AIProvider {
  type: 'claude' | 'gpt' | 'human'
  generateResponse(context: ConversationContext): Promise<string>
  isAvailable(): boolean
}
