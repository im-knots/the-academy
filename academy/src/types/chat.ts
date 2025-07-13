// src/types/chat.ts
export interface Message {
  id: string
  content: string
  timestamp: Date
  participantId: string
  participantName: string
  type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere' | 'moderator'
  isThinking?: boolean
  metadata?: {
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
    responseTime?: number
    model?: string
    usage?: any
  }
}

export interface AnalysisSnapshot {
  id: string
  timestamp: Date
  messageCountAtAnalysis: number
  participantCountAtAnalysis: number
  provider: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
  conversationPhase: string
  analysis: {
    mainTopics: string[]
    keyInsights: string[]
    currentDirection: string
    participantDynamics: Record<string, {
      perspective: string
      contribution: string
      style: string
    }>
    emergentThemes: string[]
    conversationPhase: string
    tensions: string[]
    convergences: string[]
    nextLikelyDirections: string[]
    philosophicalDepth: 'surface' | 'moderate' | 'deep' | 'profound'
  }
  conversationContext: {
    recentMessages: number
    activeParticipants: string[]
    sessionStatus: string
    moderatorInterventions: number
  }
}

export interface ChatSession {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  status: 'active' | 'paused' | 'completed' | 'error'
  messages: Message[]
  participants: Participant[]
  moderatorSettings: ModeratorSettings
  researchNotes?: string
  analysisHistory?: AnalysisSnapshot[]
  metadata?: {
    template?: string
    tags?: string[]
    starred?: boolean
    archived?: boolean
    lastViewedAt?: Date
    totalDuration?: number
    messageCount?: number
    participantCount?: number
  }
}

export interface ConversationThread {
  id: string
  sessionId: string
  title: string
  messages: Message[]
  startedAt: Date
  participantIds: string[]
}

export interface Participant {
  id: string
  name: string
  type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere' | 'moderator'
  status: 'active' | 'thinking' | 'idle' | 'error' | 'disconnected'
  systemPrompt?: string
  settings: AISettings
  avatar?: string
  color?: string
  joinedAt: Date
  lastActive?: Date
  messageCount: number
  characteristics?: {
    personality?: string
    focus?: string
    expertise?: string[]
  }
}

export interface AISettings {
  temperature: number
  maxTokens: number
  model?: string
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  responseDelay?: number
  customInstructions?: string
  ollamaUrl?: string
}

export interface ModeratorSettings {
  autoModeration: boolean
  interventionThreshold: number
  conversationTimeout: number
  maxRounds: number
  pauseOnError: boolean
  requireApproval: boolean
}

export interface SystemTemplate {
  id: string
  name: string
  description: string
  category: 'consciousness' | 'creativity' | 'philosophy' | 'analysis' | 'custom'
  prompt: string
  suggestedParticipants: Array<{
    type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
    name?: string
    settings?: Partial<AISettings>
  }>
  metadata: {
    difficulty: 'beginner' | 'intermediate' | 'advanced'
    estimatedDuration: number
    tags: string[]
  }
}