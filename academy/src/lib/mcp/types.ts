// src/lib/mcp/types.ts - Updated with missing JSON-RPC exports
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

// JSON-RPC 2.0 interfaces (MISSING EXPORTS - ADD THESE)
export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: any
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface JSONRPCError {
  code: number
  message: string
  data?: any
}

// Conversation context interface (previously not exported)
export interface ConversationContext {
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