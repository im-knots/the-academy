export interface ExperimentConfig {
  id: string
  name: string
  participants: Array<{
    type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
    name: string
    model?: string
    temperature?: number
    maxTokens?: number
    personality?: string
    expertise?: string
    ollamaUrl?: string
  }>
  systemPrompt: string
  analysisContextSize: number
  analysisProvider: 'claude' | 'gpt'
  maxMessageCount: number
  totalSessions: number
  concurrentSessions: number
  sessionNamePattern: string
  errorRateThreshold: number
  createdAt: Date
  lastModified: Date
}

export interface ExperimentRun {
  id: string
  configId: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  startedAt?: Date
  completedAt?: Date
  pausedAt?: Date
  resumedAt?: Date
  totalSessions: number
  completedSessions: number
  failedSessions: number
  activeSessions: number
  sessionIds: string[]
  errorRate: number
  errors: Array<{
    type: string
    message: string
    sessionId?: string
    count: number
    lastOccurred: Date
  }>
  progress: number // 0-100
  estimatedTimeRemaining?: number // milliseconds
}

