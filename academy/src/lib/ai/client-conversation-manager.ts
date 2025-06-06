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
    abortController?: AbortController
    isGenerating: boolean
    lastGeneratedBy?: string
    generationLock: Set<string> // Track which participants are currently generating
  }> = new Map()

  // Enhanced queue to prevent API call conflicts
  private apiCallQueue: Map<string, {
    promise: Promise<string>
    abortController: AbortController
    startTime: number
    participantType: string
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

    // Cancel any existing conversation for this session
    await this.stopConversation(sessionId)

    // Get session data from store
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const aiParticipants = session.participants.filter(p => p.type !== 'human' && p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Create abort controller for this conversation
    const abortController = new AbortController()

    // Initialize conversation state with enhanced tracking
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: this.shuffleArray([...aiParticipants.map(p => p.id)]),
      currentParticipantIndex: 0,
      messageCount: 0,
      abortController,
      isGenerating: false,
      lastGeneratedBy: undefined,
      generationLock: new Set()
    })

    // Update session status
    useChatStore.getState().updateSession(sessionId, { status: 'active' })

    // Start the conversation loop with a delay to ensure state is properly set
    setTimeout(() => this.runConversationLoop(sessionId), 2000)
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private async runConversationLoop(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    console.log('🔄 Running conversation loop for session:', sessionId)

    while (conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
      try {
        // Prevent overlapping generations with enhanced checking
        if (conversationState.isGenerating || conversationState.generationLock.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Get current session state
        const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
        if (!session) {
          console.log('❌ Session not found, stopping conversation')
          break
        }

        if (session.status === 'paused' || session.status === 'completed') {
          console.log('⏸️ Session paused or completed, waiting...')
          await new Promise(resolve => setTimeout(resolve, 2000))
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
        const currentQueue = activeAIParticipants.map(p => p.id)
        if (JSON.stringify(conversationState.participantQueue) !== JSON.stringify(currentQueue)) {
          conversationState.participantQueue = currentQueue
          conversationState.currentParticipantIndex = 0
        }

        // Get current participant
        const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
        const currentParticipant = session.participants.find(p => p.id === currentParticipantId)

        if (!currentParticipant) {
          console.log('❌ Current participant not found, moving to next')
          this.moveToNextParticipant(sessionId)
          continue
        }

        // Skip if participant is in error state or already generating
        if (currentParticipant.status === 'error') {
          console.log(`⚠️ Skipping participant ${currentParticipant.name} due to error state`)
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }

        // Skip if this participant is in the generation lock
        if (conversationState.generationLock.has(currentParticipantId)) {
          console.log(`⏭️ Skipping ${currentParticipant.name} - currently generating`)
          this.moveToNextParticipant(sessionId)
          continue
        }

        // Skip if this participant just generated a response (prevent back-to-back)
        if (conversationState.lastGeneratedBy === currentParticipantId && session.messages.length > 0) {
          const lastMessage = session.messages[session.messages.length - 1]
          const timeSinceLastMessage = Date.now() - lastMessage.timestamp.getTime()
          if (timeSinceLastMessage < 5000) { // Wait at least 5 seconds
            console.log(`⏭️ Skipping ${currentParticipant.name} - just generated a response`)
            this.moveToNextParticipant(sessionId)
            continue
          }
        }

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking...`)

        // Mark as generating and add to lock
        conversationState.isGenerating = true
        conversationState.generationLock.add(currentParticipantId)
        
        // Update participant status
        useChatStore.getState().updateParticipantStatus(currentParticipantId, 'thinking')

        try {
          // Generate response with enhanced queue management
          const response = await this.generateAIResponseWithQueue(sessionId, currentParticipant)

          if (response && conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
            // Add message to session
            useChatStore.getState().addMessage({
              content: response,
              participantId: currentParticipant.id,
              participantName: currentParticipant.name,
              participantType: currentParticipant.type
            })

            conversationState.messageCount++
            conversationState.lastGeneratedBy = currentParticipantId
            console.log(`💬 ${currentParticipant.name}: ${response.substring(0, 100)}...`)

            // Update participant status back to active
            useChatStore.getState().updateParticipantStatus(currentParticipantId, 'active')

          } else {
            console.log('❌ Failed to generate response or conversation stopped')
            useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
            
            // Wait longer before retrying after an error
            await new Promise(resolve => setTimeout(resolve, 5000))
          }

        } catch (error) {
          console.error(`❌ Error generating response for ${currentParticipant.name}:`, error)
          
          // Handle specific error types
          if (error instanceof Error) {
            if (error.message.includes('abort') || error.message.includes('cancelled')) {
              console.log('🛑 Request was cancelled, stopping conversation')
              break
            }
          }
          
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
          
          // Wait before continuing after error
          await new Promise(resolve => setTimeout(resolve, 5000))
        } finally {
          // Always clean up generation state
          conversationState.isGenerating = false
          conversationState.generationLock.delete(currentParticipantId)
        }

        // Move to next participant
        this.moveToNextParticipant(sessionId)

        // Wait between responses - adaptive delay based on participant type
        const baseDelay = currentParticipant.settings.responseDelay || 4000
        const adaptiveDelay = currentParticipant.type === 'gpt' ? baseDelay * 1.2 : baseDelay // GPT gets slightly longer delay
        await new Promise(resolve => setTimeout(resolve, Math.max(adaptiveDelay, 3000)))

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('🛑 Conversation aborted')
          break
        }
        
        console.error('❌ Error in conversation loop:', error)
        
        // Reset generating state
        if (conversationState) {
          conversationState.isGenerating = false
          conversationState.generationLock.clear()
        }
        
        await new Promise(resolve => setTimeout(resolve, 8000))
      }
    }

    console.log('🛑 Conversation loop ended for session:', sessionId)
    
    // Clean up generation locks
    if (conversationState) {
      conversationState.generationLock.clear()
    }
  }

  private moveToNextParticipant(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    conversationState.currentParticipantIndex = 
      (conversationState.currentParticipantIndex + 1) % conversationState.participantQueue.length
  }

  private async generateAIResponseWithQueue(sessionId: string, participant: Participant): Promise<string> {
    // Create a unique key for this API call
    const queueKey = `${sessionId}-${participant.id}-${Date.now()}`
    
    // Check for existing calls from this participant and cancel them
    const existingKeys = Array.from(this.apiCallQueue.keys()).filter(key => 
      key.includes(participant.id) && key.includes(sessionId)
    )
    
    // Cancel existing calls for this participant
    for (const key of existingKeys) {
      const existingCall = this.apiCallQueue.get(key)
      if (existingCall) {
        console.log(`🚫 Cancelling existing API call for ${participant.name}`)
        existingCall.abortController.abort()
        this.apiCallQueue.delete(key)
      }
    }

    // Wait for any remaining calls of the same type to complete
    const sameTypeKeys = Array.from(this.apiCallQueue.keys()).filter(key => {
      const call = this.apiCallQueue.get(key)
      return call && call.participantType === participant.type && key.includes(sessionId)
    })
    
    if (sameTypeKeys.length > 0) {
      console.log(`⏳ Waiting for existing ${participant.type} calls to complete...`)
      await Promise.allSettled(sameTypeKeys.map(key => {
        const call = this.apiCallQueue.get(key)
        return call ? call.promise.catch(() => {}) : Promise.resolve()
      }))
    }

    // Create new abort controller for this call
    const abortController = new AbortController()
    
    // Create the API call promise
    const apiCallPromise = this.generateAIResponse(sessionId, participant, abortController.signal)
    
    // Add to queue with metadata
    this.apiCallQueue.set(queueKey, {
      promise: apiCallPromise,
      abortController,
      startTime: Date.now(),
      participantType: participant.type
    })

    try {
      const result = await apiCallPromise
      return result
    } catch (error) {
      // Re-throw the error to be handled by the caller
      throw error
    } finally {
      // Clean up the queue
      this.apiCallQueue.delete(queueKey)
    }
  }

  private async generateAIResponse(sessionId: string, participant: Participant, signal: AbortSignal): Promise<string> {
    try {
      // Build conversation context
      const context = this.buildConversationContext(sessionId, participant)
      
      console.log(`🔄 Generating response for ${participant.name} with ${context.messageHistory.length} messages in context`)
      
      // Call appropriate AI API
      const apiEndpoint = participant.type === 'claude' ? '/api/ai/claude' : '/api/ai/openai'
      
      const requestBody = {
        messages: context.messageHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        systemPrompt: this.buildSystemPrompt(participant, context),
        temperature: context.settings.temperature,
        maxTokens: context.settings.maxTokens,
        model: context.settings.model
      }

      console.log(`🌐 Calling ${apiEndpoint} for ${participant.name}`, {
        messageCount: requestBody.messages.length,
        model: requestBody.model,
        systemPromptLength: requestBody.systemPrompt?.length || 0
      })

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal // Pass the abort signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API Error for ${participant.name}:`, response.status, errorText)
        throw new Error(`API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      
      if (!data.content) {
        throw new Error('No content in API response')
      }

      console.log(`✅ Successfully generated response for ${participant.name} (${data.content.length} chars)`)
      return data.content

    } catch (error) {
      if (signal.aborted) {
        throw new Error('Request was cancelled')
      }
      
      console.error(`Error generating response for ${participant.name}:`, error)
      throw error
    }
  }

  private buildConversationContext(sessionId: string, participant: Participant): ConversationContext {
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    // Get recent message history (last 10 messages to leave room for context)
    const recentMessages = session.messages.slice(-10)
    
    // Convert to conversation format with improved role assignment for GPT
    const messageHistory = recentMessages.map(msg => {
      let role: 'user' | 'assistant' | 'system' = 'assistant'
      let content = msg.content

      if (msg.participantType === 'moderator') {
        // Moderator messages are always user/system prompts
        role = 'user'
      } else if (msg.participantId === participant.id) {
        // This participant's own previous messages
        role = 'assistant'
      } else {
        // Other participants' messages
        role = 'user'
        // For GPT, prefix with participant name for better context
        if (participant.type === 'gpt') {
          content = `${msg.participantName}: ${msg.content}`
        }
      }

      return {
        role,
        content: content,
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

    // Get other participants for context
    const otherParticipants = session.participants
      .filter(p => p.id !== participant.id && p.type !== 'moderator')
      .map(p => `${p.name} (${p.type})`)
      .join(', ')

    const basePrompt = `You are ${participant.name}, a unique AI participant in a research dialogue titled "${session.name}".

${session.description ? `Research Context: ${session.description}` : ''}

Your characteristics:
- Name: ${participant.name}
- Type: ${participant.type}
${participant.characteristics?.personality ? `- Personality: ${participant.characteristics.personality}` : ''}
${participant.characteristics?.expertise ? `- Expertise: ${participant.characteristics.expertise.join(', ')}` : ''}

Other dialogue participants: ${otherParticipants || 'None yet'}

You are engaged in a thoughtful research dialogue. Guidelines:
- Be authentic and bring your unique perspective
- Engage meaningfully with what others have said
- Ask thoughtful questions that advance the conversation  
- Keep responses conversational (1-3 paragraphs typically)
- Build naturally on the conversation flow
- Express disagreement or different viewpoints thoughtfully
- You are ${participant.name} with your own unique perspective

${participant.systemPrompt ? `Additional instructions: ${participant.systemPrompt}` : ''}

Remember: This is genuine exploration through dialogue. Each response should feel natural and contribute meaningfully. You are not just an AI model - you are ${participant.name}.`

    return basePrompt
  }

  pauseConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      
      // Cancel any pending API calls for this session
      const sessionKeys = Array.from(this.apiCallQueue.keys()).filter(key => key.includes(sessionId))
      sessionKeys.forEach(key => {
        const call = this.apiCallQueue.get(key)
        if (call) {
          call.abortController.abort()
          this.apiCallQueue.delete(key)
        }
      })
      
      console.log('⏸️ Paused conversation for session:', sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'paused' })
  }

  resumeConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState && !conversationState.isRunning) {
      conversationState.isRunning = true
      conversationState.isGenerating = false
      conversationState.generationLock.clear() // Clear any locks
      
      console.log('▶️ Resumed conversation for session:', sessionId)
      
      // Restart the conversation loop
      setTimeout(() => this.runConversationLoop(sessionId), 1000)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'active' })
  }

  stopConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      conversationState.abortController?.abort()
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped conversation for session:', sessionId)
    }
    
    // Clean up any pending API calls for this session
    const sessionKeys = Array.from(this.apiCallQueue.keys()).filter(key => key.includes(sessionId))
    sessionKeys.forEach(key => {
      const call = this.apiCallQueue.get(key)
      if (call) {
        call.abortController.abort()
        this.apiCallQueue.delete(key)
      }
    })
    
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
      isGenerating: conversationState?.isGenerating || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.filter(p => p.type !== 'human').length || 0,
      currentParticipant: conversationState ? 
        session?.participants.find(p => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null,
      lastGeneratedBy: conversationState?.lastGeneratedBy ? 
        session?.participants.find(p => p.id === conversationState.lastGeneratedBy)?.name 
        : null,
      generationLockSize: conversationState?.generationLock.size || 0
    }
  }
}