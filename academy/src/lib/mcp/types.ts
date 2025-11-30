// src/lib/mcp/types.ts - Updated with Grok and Gemini support
export interface MCPMessage {
  id: string
  type: 'request' | 'response' | 'notification'
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// JSON-RPC 2.0 interfaces
export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface JSONRPCError {
  code: number
  message: string
  data?: unknown
}

// Conversation context interface
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
  type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
  generateResponse(context: ConversationContext): Promise<string>
  isAvailable(): boolean
}

export interface APIError {
  id: string;
  timestamp: Date;
  provider: 'claude' | 'openai' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere';
  operation: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  sessionId?: string;
  participantId?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryCondition?: (error: Error) => boolean;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'markdown';
  includeMetadata: boolean;
  includeParticipantInfo: boolean;
  includeSystemPrompts: boolean;
  includeAnalysisHistory: boolean;
  includeErrors: boolean;
}