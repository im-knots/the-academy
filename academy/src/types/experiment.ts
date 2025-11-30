import type { AnalysisSchema } from '@/components/Research/AnalysisConfigModal'

export interface FileAttachmentData {
  base64: string
  mimeType: string
  name: string
}

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
  startingPrompt: string
  startingPromptAttachment?: FileAttachmentData // Optional file/image attachment for starting prompt
  // Analysis configuration
  analysisProvider: string
  analysisModel?: string
  analysisContextSize: number
  analysisCustomPrompt?: string
  analysisAutoInterval: number // 0 = disabled, >0 = every N messages
  analysisSchema?: AnalysisSchema // JSON schema for analysis output structure
  // Chat configuration
  chatContextWindow: number
  chatSystemPrompt?: string
  // Execution settings
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
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'
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

