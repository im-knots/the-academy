// src/lib/ai/conversation-manager.ts
import { Participant, Message } from '@/types/chat'

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

// Simple in-memory store for server-side conversation state
// In production, you'd want to use a proper database or Redis
let globalSessionStore: { [sessionId: string]: any } = {}

export class ConversationManager {
  private static instance: ConversationManager
  private activeConversations: Map<string, {
    isRunning: boolean
    participantQueue: string[]
    currentParticipantIndex: number
    messageCount: number
  }> = new Map()

  private constructor() {}

  static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager()
    }
    return ConversationManager.instance
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    console.log('🚀 Starting AI-to-AI conversation for session:', sessionId)

    // For now, we'll trigger the client-side conversation
    // The actual conversation loop will run on the client side
    // This is a simplified server-side manager that just validates and starts

    // Initialize conversation state
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: [], // Will be populated by client
      currentParticipantIndex: 0,
      messageCount: 0
    })

    console.log('✅ Conversation initialized for session:', sessionId)
  }

  pauseConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      console.log('⏸️ Paused conversation for session:', sessionId)
    }
  }

  resumeConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = true
      console.log('▶️ Resumed conversation for session:', sessionId)
    }
  }

  stopConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped conversation for session:', sessionId)
    }
  }

  isConversationActive(sessionId: string): boolean {
    const conversationState = this.activeConversations.get(sessionId)
    return conversationState?.isRunning || false
  }

  getConversationStats(sessionId: string) {
    const conversationState = this.activeConversations.get(sessionId)
    
    return {
      isRunning: conversationState?.isRunning || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: 0, // Will be updated by client
      currentParticipant: null
    }
  }
}