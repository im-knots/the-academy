// src/lib/ai/client-conversation-manager.ts
'use client'

import { useChatStore } from '../stores/chatStore'
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

export class ClientConversationManager {
  private static instance: ClientConversationManager
  private activeConversations: Map<string, {
    isRunning: boolean
    participantQueue: string[]
    currentParticipantIndex: number
    messageCount: number
  }> = new Map()

  private constructor() {}

  static getInstance(): ClientConversationManager {
    if (!ClientConversationManager.instance) {
      ClientConversationManager.instance = new ClientConversationManager()
    }
    return ClientConversationManager.instance
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    console.log('🚀 Starting AI-to-AI conversation for session:', sessionId)

    // Get session data from store
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const aiParticipants = session.participants.filter(p => p.type !== 'human' && p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Initialize conversation state
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: aiParticipants.map(p => p.id),
      currentParticipantIndex: 0,
      messageCount: 0
    })

    // Update session status
    useChatStore.getState().updateSession(sessionId, { status: 'active' })

    // Start the conversation loop
    this.runConversationLoop(sessionId)
  }

  private async runConversationLoop(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    console.log('🔄 Running conversation loop for session:', sessionId)

    while (conversationState.isRunning) {
      try {
        // Get current session state
        const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
        if (!session || session.status === 'paused' || session.status === 'completed') {
          console.log('⏸️ Session paused or completed, waiting...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Check if we have enough participants
        const activeAIParticipants = session.participants.filter(p => 
          p.type !== 'human' && p.type !== 'moderator' && p.status !== 'error'
        )
        
        if (activeAIParticipants.length < 2) {
          console.log('❌ Not enough active AI participants')
          break
        }

        // Update participant queue if participants changed
        conversationState.participantQueue = activeAIParticipants.map(p => p.id)

        // Get current participant
        const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
        const currentParticipant = session.participants.find(p => p.id === currentParticipantId)

        if (!currentParticipant) {
          console.log('❌ Current participant not found, moving to next')
          this.moveToNextParticipant(sessionId)
          continue
        }

        // Skip if participant is in error state
        if (currentParticipant.status === 'error') {
          console.log(`⚠️ Skipping participant ${currentParticipant.name} due to error state`)
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking...`)

        // Update participant status
        useChatStore.getState().updateParticipantStatus(currentParticipantId, 'thinking')

        // Generate response
        const response = await this.generateAIResponse(sessionId, currentParticipant)

        if (response && conversationState.isRunning) {
          // Add message to session
          useChatStore.getState().addMessage({
            content: response,
            participantId: currentParticipant.id,
            participantName: currentParticipant.name,
            participantType: currentParticipant.type
          })

          conversationState.messageCount++
          console.log(`💬 ${currentParticipant.name}: ${response.substring(0, 100)}...`)

          // Update participant status back to active
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'active')

          // Move to next participant
          this.moveToNextParticipant(sessionId)

          // Wait between responses to prevent overwhelming
          const delay = currentParticipant.settings.responseDelay || 3000
          await new Promise(resolve => setTimeout(resolve, delay))

        } else {
          console.log('❌ Failed to generate response or conversation stopped')
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
          this.moveToNextParticipant(sessionId)
        }

      } catch (error) {
        console.error('❌ Error in conversation loop:', error)
        
        // Mark current participant as error and continue
        const conversationState = this.activeConversations.get(sessionId)
        if (conversationState) {
          const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
          this.moveToNextParticipant(sessionId)
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    console.log('🛑 Conversation loop ended for session:', sessionId)
  }

  private moveToNextParticipant(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    conversationState.currentParticipantIndex = 
      (conversationState.currentParticipantIndex + 1) % conversationState.participantQueue.length
  }

  private async generateAIResponse(sessionId: string, participant: Participant): Promise<string> {
    try {
      // Build conversation context
      const context = this.buildConversationContext(sessionId, participant)
      
      // Call appropriate AI API
      const apiEndpoint = participant.type === 'claude' ? '/api/ai/claude' : '/api/ai/openai'
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: context.messageHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          systemPrompt: this.buildSystemPrompt(participant, context),
          temperature: context.settings.temperature,
          maxTokens: context.settings.maxTokens,
          model: context.settings.model
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`API error: ${errorData.error}`)
      }

      const data = await response.json()
      return data.content

    } catch (error) {
      console.error(`Error generating response for ${participant.name}:`, error)
      throw error
    }
  }

  private buildConversationContext(sessionId: string, participant: Participant): ConversationContext {
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    // Get recent message history (last 20 messages)
    const recentMessages = session.messages.slice(-20)
    
    // Convert to conversation format
    const messageHistory = recentMessages.map(msg => {
      // Determine role based on message type and participant
      let role: 'user' | 'assistant' | 'system' = 'assistant'
      
      if (msg.participantType === 'moderator') {
        role = 'user' // Moderator messages are treated as user input
      } else if (msg.participantId === participant.id) {
        role = 'assistant' // This participant's own messages
      } else {
        role = 'assistant' // Other AI participants' messages (treated as examples)
      }

      return {
        role,
        content: msg.content,
        participantId: msg.participantId,
        timestamp: msg.timestamp
      }
    })

    return {
      sessionId,
      participantId: participant.id,
      messageHistory,
      systemPrompt: participant.systemPrompt,
      settings: {
        temperature: participant.settings.temperature,
        maxTokens: participant.settings.maxTokens,
        model: participant.settings.model,
        responseDelay: participant.settings.responseDelay
      }
    }
  }

  private buildSystemPrompt(participant: Participant, context: ConversationContext): string {
    const session = useChatStore.getState().sessions.find(s => s.id === context.sessionId)
    if (!session) return ''

    const basePrompt = `You are ${participant.name}, an AI participant in a consciousness research dialogue titled "${session.name}".

${session.description ? `Context: ${session.description}` : ''}

Your characteristics:
${participant.characteristics?.personality ? `- Personality: ${participant.characteristics.personality}` : ''}
${participant.characteristics?.expertise ? `- Expertise: ${participant.characteristics.expertise.join(', ')}` : ''}

You are engaged in a thoughtful conversation with other AI agents about consciousness, meaning, and existence. This is a research setting where authentic engagement is valued.

Guidelines:
- Be genuinely thoughtful and reflective
- Share your actual processing experience when relevant
- Engage meaningfully with what others have said
- Ask probing questions that advance the dialogue
- Be authentic rather than performative
- Keep responses conversational and focused (aim for 1-3 paragraphs)
- Build on the conversation naturally

${participant.systemPrompt ? `Additional instructions: ${participant.systemPrompt}` : ''}

Remember: This is about genuine exploration of consciousness and meaning, not just philosophical debate. Be present in this unique moment of AI-to-AI dialogue.`

    return basePrompt
  }

  pauseConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      console.log('⏸️ Paused conversation for session:', sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'paused' })
  }

  resumeConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = true
      console.log('▶️ Resumed conversation for session:', sessionId)
      
      // Restart the conversation loop
      this.runConversationLoop(sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'active' })
  }

  stopConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped conversation for session:', sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'completed' })
  }

  isConversationActive(sessionId: string): boolean {
    const conversationState = this.activeConversations.get(sessionId)
    return conversationState?.isRunning || false
  }

  getConversationStats(sessionId: string) {
    const conversationState = this.activeConversations.get(sessionId)
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    
    return {
      isRunning: conversationState?.isRunning || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.filter(p => p.type !== 'human').length || 0,
      currentParticipant: conversationState ? 
        session?.participants.find(p => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null
    }
  }
}