// src/types/chat.ts
export interface Message {
  id: string
  content: string
  timestamp: Date
  participantId: string
  participantName: string
  participantType: 'claude' | 'gpt' | 'human' | 'moderator'
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
  provider: 'claude' | 'gpt'
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
  type: 'claude' | 'gpt' | 'human' | 'moderator'
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
}

export interface ModeratorSettings {
  autoMode: boolean
  interventionTriggers: string[]
  sessionTimeout: number
  maxMessagesPerParticipant: number
  allowParticipantToParticipantMessages: boolean
  moderatorPrompts: {
    welcome: string
    intervention: string
    conclusion: string
  }
}

export interface WebSocketMessage {
  type: 'message' | 'participant_joined' | 'participant_left' | 'status_update' | 'moderator_action' | 'session_update'
  sessionId: string
  data: any
  timestamp: Date
  senderId?: string
}

export interface ParticipantStatusUpdate {
  participantId: string
  status: Participant['status']
  message?: string
}

export interface ModeratorAction {
  type: 'pause' | 'resume' | 'inject_prompt' | 'end_session' | 'add_participant' | 'remove_participant'
  data?: any
  reason?: string
}

export interface EmergentBehavior {
  id: string
  sessionId: string
  type: 'consensus_building' | 'disagreement' | 'novel_insight' | 'recursive_reasoning' | 'meta_discussion' | 'empathy_display' | 'creative_leap'
  description: string
  messageIds: string[]
  participantIds: string[]
  detectedAt: Date
  confidence: number
  researcherNotes?: string
}

export interface AnalysisMetrics {
  sessionId: string
  totalMessages: number
  participantEngagement: Record<string, number>
  averageResponseTime: number
  topicDrift: number
  conversationalDepth: number
  emergentBehaviors: EmergentBehavior[]
  consensusPoints: string[]
  divergencePoints: string[]
}

export interface SessionTemplate {
  id: string
  name: string
  description: string
  icon?: string
  color?: string
  initialPrompt?: string
  participants?: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'>[]
  settings?: Partial<ModeratorSettings>
  tags?: string[]
}