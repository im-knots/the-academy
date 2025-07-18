// src/lib/ai/conversation-manager.ts
// Server-side conversation manager (NO 'use client' directive)

import { db } from '../db/client'
import { sessions, messages, participants } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'

// Add participant status constants
interface ParticipantStatus {
  IDLE: 'idle'
  ACTIVE: 'active'
  THINKING: 'thinking'
  ERROR: 'error'
}

const PARTICIPANT_STATUS: ParticipantStatus = {
  IDLE: 'idle',
  ACTIVE: 'active',
  THINKING: 'thinking',
  ERROR: 'error'
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

interface ConversationState {
  isRunning: boolean
  participantQueue: string[]
  currentParticipantIndex: number
  messageCount: number
  abortController?: AbortController
  isGenerating: boolean
  lastGeneratedBy?: string
  generationLock: Set<string>
  wasInterrupted: boolean
  interruptedParticipantId?: string
  interruptedAt: Date | null
  resumeFromParticipant?: string
  cleanupInProgress?: boolean
}

export class ServerConversationManager {
  private static instance: ServerConversationManager
  private activeConversations: Map<string, ConversationState> = new Map()
  private mcpServer: any // Reference to MCPServer instance

  private constructor(mcpServer: any) {
    this.mcpServer = mcpServer
  }

  static getInstance(mcpServer?: any): ServerConversationManager {
    if (!ServerConversationManager.instance && mcpServer) {
      ServerConversationManager.instance = new ServerConversationManager(mcpServer)
    }
    return ServerConversationManager.instance
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    console.log('🚀 Starting server-side conversation for session:', sessionId)

    // Cancel any existing conversation for this session
    await this.stopConversation(sessionId)

    // Get session data from database
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: {
        participants: true,
        messages: true
      }
    })

    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const aiParticipants = session.participants.filter(p => p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Create abort controller for this conversation
    const abortController = new AbortController()

    // Sort participants by creation order for sequential conversation
    const sortedParticipants = aiParticipants.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    // Set all AI participants to active status when starting
    for (const participant of aiParticipants) {
      await this.updateParticipantStatus(sessionId, participant.id, PARTICIPANT_STATUS.ACTIVE)
    }

    // Initialize conversation state
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: sortedParticipants.map(p => p.id),
      currentParticipantIndex: 0,
      messageCount: 0,
      abortController,
      isGenerating: false,
      lastGeneratedBy: undefined,
      generationLock: new Set(),
      wasInterrupted: false,
      interruptedParticipantId: undefined,
      interruptedAt: null,
      resumeFromParticipant: undefined,
      cleanupInProgress: false
    })

    console.log('📋 Sequential participant order:', sortedParticipants.map(p => `${p.name} (${p.type})`).join(' → '))

    // Update session status in database
    await db.update(sessions)
      .set({ status: 'active' })
      .where(eq(sessions.id, sessionId))

    // Add initial prompt if provided
    if (initialPrompt?.trim()) {
      await this.addMessage(sessionId, {
        content: initialPrompt.trim(),
        participantId: 'moderator',
        participantName: 'Research Moderator',
        participantType: 'moderator'
      })
    }

    // Start the conversation loop
    setTimeout(() => this.runConversationLoop(sessionId), 2000)
  }

  private async runConversationLoop(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    console.log('🔄 Running server-side conversation loop for session:', sessionId)

    while (conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
      try {
        // Check if cleanup is in progress
        if (conversationState.cleanupInProgress) {
          console.log('🧹 Cleanup in progress, exiting conversation loop')
          break
        }

        // Prevent overlapping generations
        if (conversationState.isGenerating || conversationState.generationLock.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Get current session state from database
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
          with: {
            participants: true,
            messages: true
          }
        })

        if (!session) {
          console.log('❌ Session not found, stopping conversation')
          break
        }

        if (session.status === 'paused' || session.status === 'completed') {
          console.log('⏸️ Session paused or completed, waiting...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        // Check if we have enough participants (exclude error state participants)
        const activeAIParticipants = session.participants.filter(p => 
          p.type !== 'moderator' && p.status !== PARTICIPANT_STATUS.ERROR
        )
        
        if (activeAIParticipants.length < 2) {
          console.log('❌ Not enough active AI participants')
          break
        }

        // Update participant queue if participants changed
        const sortedParticipants = activeAIParticipants.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        const currentQueue = sortedParticipants.map(p => p.id)
        
        if (JSON.stringify(conversationState.participantQueue) !== JSON.stringify(currentQueue)) {
          const previousParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
          conversationState.participantQueue = currentQueue
          
          const newIndex = conversationState.participantQueue.indexOf(previousParticipantId)
          if (newIndex !== -1) {
            conversationState.currentParticipantIndex = newIndex
          } else {
            conversationState.currentParticipantIndex = 0
          }
          
          console.log('📋 Updated sequential order:', sortedParticipants.map(p => `${p.name} (${p.type})`).join(' → '))
        }

        // Get current participant
        const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
        const currentParticipant = session.participants.find(p => p.id === currentParticipantId)

        if (!currentParticipant) {
          console.log('❌ Current participant not found, moving to next')
          this.moveToNextParticipant(sessionId)
          continue
        }

        // Skip if participant is in error state
        if (currentParticipant.status === PARTICIPANT_STATUS.ERROR) {
          console.log(`⚠️ Skipping participant ${currentParticipant.name} due to error state`)
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }

        // Skip if this participant is in the generation lock
        if (conversationState.generationLock.has(currentParticipantId)) {
          console.log(`⏭️ Skipping ${currentParticipant.name} - currently generating`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Prevent immediate back-to-back responses
        if (conversationState.lastGeneratedBy === currentParticipantId && session.messages.length > 0) {
          const lastMessage = session.messages[session.messages.length - 1]
          const timeSinceLastMessage = Date.now() - new Date(lastMessage.timestamp).getTime()
          if (timeSinceLastMessage < 2000) {
            console.log(`⏭️ Brief pause for ${currentParticipant.name} - just generated`)
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
        }

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking... [Position ${conversationState.currentParticipantIndex + 1}/${conversationState.participantQueue.length}]`)

        // Mark as generating and add to lock
        conversationState.isGenerating = true
        conversationState.generationLock.add(currentParticipantId)
        
        // Update participant status to thinking
        await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.THINKING)

        // Check again if we should continue
        if (!conversationState.isRunning || conversationState.cleanupInProgress || conversationState.abortController?.signal.aborted) {
          console.log(`🛑 Conversation stopped after marking ${currentParticipant.name} as thinking`)
          await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.IDLE)
          break
        }

        try {
          // Check if conversation was stopped while waiting
          if (!conversationState.isRunning || conversationState.cleanupInProgress || conversationState.abortController?.signal.aborted) {
            console.log(`🛑 Conversation stopped before generating response for ${currentParticipant.name}`)
            await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.IDLE)
            break
          }

          // Generate response via AI provider tools
          const response = await this.generateAIResponse(
            sessionId, 
            currentParticipant, 
            conversationState.abortController?.signal
          )

          if (response && conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
            // Add message to session
            await this.addMessage(sessionId, {
              content: response,
              participantId: currentParticipant.id,
              participantName: currentParticipant.name,
              participantType: currentParticipant.type
            })

            conversationState.messageCount++
            conversationState.lastGeneratedBy = currentParticipantId
            console.log(`💬 ${currentParticipant.name}: ${response.substring(0, 100)}...`)

            // Update participant status back to active
            await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.ACTIVE)

            // Move to next participant
            this.moveToNextParticipant(sessionId)

          } else {
            console.log('❌ Failed to generate response or conversation stopped')
            
            if (conversationState.abortController?.signal.aborted) {
              console.log(`🛑 Generation aborted for ${currentParticipant.name}, preserving turn`)
              conversationState.wasInterrupted = true
              conversationState.interruptedParticipantId = currentParticipantId
              conversationState.interruptedAt = new Date()
              // When aborted, set to idle (not error)
              await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.IDLE)
            } else {
              // Only set to error if it's an actual error (not abort)
              await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.ERROR)
              this.moveToNextParticipant(sessionId)
            }
          }

        } catch (error) {
          console.error(`❌ Error generating response for ${currentParticipant.name}:`, error)
          
          if (error instanceof Error) {
            if (error.message.includes('abort') || error.message.includes('cancelled') || error.name === 'AbortError') {
              console.log(`🛑 Request was cancelled for ${currentParticipant.name}, preserving turn`)
              conversationState.wasInterrupted = true
              conversationState.interruptedParticipantId = currentParticipantId
              conversationState.interruptedAt = new Date()
              // When cancelled/aborted, set to idle
              await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.IDLE)
              break
            }
          }
          
          // Only set to error for actual errors
          await this.updateParticipantStatus(sessionId, currentParticipantId, PARTICIPANT_STATUS.ERROR)
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 5000))
        } finally {
          // Always clean up generation state
          conversationState.isGenerating = false
          conversationState.generationLock.delete(currentParticipantId)
        }

        // Wait between responses
        if (!conversationState.abortController?.signal.aborted) {
          const baseDelay = currentParticipant.settings?.responseDelay || 4000
          const adaptiveDelay = currentParticipant.type === 'gpt' ? baseDelay * 1.2 : baseDelay
          await new Promise(resolve => setTimeout(resolve, Math.max(adaptiveDelay, 3000)))
        }

      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
          console.log('🛑 Conversation aborted gracefully')
          break
        }
        
        console.error('❌ Error in server conversation loop:', error)
        
        if (conversationState) {
          conversationState.isGenerating = false
          conversationState.generationLock.clear()
        }
        
        await new Promise(resolve => setTimeout(resolve, 8000))
      }
    }

    console.log('🛑 Server conversation loop ended for session:', sessionId)
    
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

  private async generateAIResponse(
    sessionId: string, 
    participant: any, 
    abortSignal?: AbortSignal
  ): Promise<string> {
    try {
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted before starting')
      }

      // Check if cleanup is in progress
      const conversationState = this.activeConversations.get(sessionId)
      if (conversationState?.cleanupInProgress || !conversationState?.isRunning) {
        throw new Error('Conversation stopped or cleanup in progress')
      }

      // Build conversation context
      const context = await this.buildConversationContext(sessionId, participant)
      
      console.log(`🔄 Generating response for ${participant.name} with ${context.messageHistory.length} messages`)
      
      // Use the MCP server's AI provider tools
      const toolName = participant.type === 'claude' ? 'claude_chat' : 
                participant.type === 'gemini' ? 'gemini_chat' : 
                participant.type === 'grok' ? 'grok_chat' : 
                participant.type === 'ollama' ? 'ollama_chat' :
                participant.type === 'deepseek' ? 'deepseek_chat' :
                participant.type === 'mistral' ? 'mistral_chat' :
                participant.type === 'cohere' ? 'cohere_chat' :
                'openai_chat'

      // Prepare messages for the AI API
      const messages = context.messageHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Build system prompt
      const systemPrompt = await this.buildSystemPrompt(participant, context)

      // Prepare tool arguments
      const toolArgs = {
        messages:
          (['gpt', 'grok', 'gemini', 'ollama', 'deepseek', 'mistral', 'cohere'].includes(participant.type) && systemPrompt)
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages,
        temperature: context.settings.temperature,
        maxTokens: context.settings.maxTokens,
        model: context.settings.model,
        ...(participant.type === 'claude' && systemPrompt && { systemPrompt }),
        ...(participant.type === 'ollama' && { 
          ollamaUrl: participant.settings?.ollamaUrl || 'http://localhost:11434' 
        }),
        sessionId: sessionId,
        participantId: participant.id
      }

      // Check abort signal again before API call
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted')
      }

      console.log(`🌐 Calling server AI tool ${toolName} for ${participant.name}`)

      // Call the AI provider tool directly through the server
      const result = await this.mcpServer.callAIProviderTool(toolName, toolArgs, abortSignal)
      
      if (!result.success || !result.content) {
        throw new Error('No content in AI tool response')
      }

      console.log(`✅ Successfully generated response for ${participant.name} (${result.content.length} chars)`)
      return result.content

    } catch (error) {
      // Add specific handling for abort errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
        console.log(`🛑 API call aborted for ${participant.name}`)
        throw error
      }
      console.error(`Error generating server response for ${participant.name}:`, error)
      throw error
    }
  }

  private async buildConversationContext(sessionId: string, participant: any): Promise<ConversationContext> {
    // Get session from database
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: {
        messages: {
          orderBy: [desc(messages.timestamp)],
          limit: 10
        },
        participants: true
      }
    })

    if (!session) {
      throw new Error('Session not found')
    }

    // Get recent message history (last 10 messages, reversed to chronological order)
    const recentMessages = session.messages.reverse()
    
    // Convert to conversation format
    const messageHistory = recentMessages.map((msg: any) => {
      let role: 'user' | 'assistant' | 'system' = 'assistant'
      let content = msg.content

      if (msg.participantType === 'moderator') {
        role = 'user'
      } else if (msg.participantId === participant.id) {
        role = 'assistant'
      } else {
        role = 'user'
        content = `${msg.participantName}: ${msg.content}`
      }

      return {
        role,
        content: content,
        participantId: msg.participantId,
        timestamp: new Date(msg.timestamp)
      }
    })

    return {
      sessionId,
      participantId: participant.id,
      messageHistory,
      systemPrompt: participant.systemPrompt,
      settings: {
        temperature: participant.settings?.temperature || 0.7,
        maxTokens: participant.settings?.maxTokens || 1000,
        model: participant.settings?.model,
        responseDelay: participant.settings?.responseDelay || 4000
      }
    }
  }

  private async buildSystemPrompt(participant: any, context: ConversationContext): Promise<string> {
    // Get session from database
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, context.sessionId),
      with: {
        participants: true
      }
    })

    if (!session) {
      return ''
    }

    // Get other participants for context
    const otherParticipants = session.participants
      .filter(p => p.id !== participant.id && p.type !== 'moderator')
      .map(p => `${p.name} (${p.type})`)
      .join(', ')

    const basePrompt = `IMPORTANT: You are ${participant.name}, a ${participant.type} AI model participating in a research dialogue.

Your identity is FIXED:
- Your name is: ${participant.name}
- Your model type is: ${participant.type}
- You are NOT any other participant in this conversation

Session: "${session.name}"
${session.description ? `Research Context: ${session.description}` : ''}

Your unique characteristics:
${participant.characteristics?.personality ? `- Personality: ${participant.characteristics.personality}` : ''}
${participant.characteristics?.expertise ? `- Expertise: ${participant.characteristics.expertise.join(', ')}` : ''}

Other participants in this dialogue: ${otherParticipants || 'None yet'}

CRITICAL INSTRUCTIONS:
- Always respond as ${participant.name} (${participant.type})
- Never introduce yourself as any other participant
- Never say you are Claude, GPT, or any other AI unless that is actually your assigned name
- Engage thoughtfully with what others have said
- Keep responses conversational (1-3 paragraphs typically)
- Build naturally on the conversation flow
- Express your unique perspective as ${participant.name}

${participant.systemPrompt ? `Additional instructions: ${participant.systemPrompt}` : ''}

Remember: You are ${participant.name}, not any other participant. Always maintain your distinct identity.`

    return basePrompt
  }

  private async addMessage(sessionId: string, messageData: {
    content: string
    participantId: string
    participantName: string
    participantType: string
  }): Promise<void> {
    await db.insert(messages).values({
      sessionId,
      content: messageData.content,
      participantId: messageData.participantId,
      participantName: messageData.participantName,
      participantType: messageData.participantType,
      timestamp: new Date()
    })
  }

  private async updateParticipantStatus(sessionId: string, participantId: string, status: string): Promise<void> {
    await db.update(participants)
      .set({ status })
      .where(and(
        eq(participants.sessionId, sessionId),
        eq(participants.id, participantId)
      ))
  }

  async pauseConversation(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      conversationState.abortController?.abort()
      conversationState.isGenerating = false
      conversationState.generationLock.clear()
      
      console.log('⏸️ Paused server conversation for session:', sessionId)
    }
    
    // Get session to update all participants to idle
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: { participants: true }
    })
    
    if (session) {
      // Set all AI participants to idle when paused
      for (const participant of session.participants) {
        if (participant.type !== 'moderator') {
          await this.updateParticipantStatus(sessionId, participant.id, PARTICIPANT_STATUS.IDLE)
        }
      }
    }
    
    // Update session status in database
    await db.update(sessions)
      .set({ status: 'paused' })
      .where(eq(sessions.id, sessionId))
  }

  async resumeConversation(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState && !conversationState.isRunning) {
      conversationState.abortController = new AbortController()
      conversationState.isRunning = true
      conversationState.isGenerating = false
      conversationState.generationLock.clear()
      
      console.log('▶️ Resumed server conversation for session:', sessionId)
      
      // Get session to update all participants to active
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: { participants: true }
      })
      
      if (session) {
        // Set all non-error AI participants back to active when resumed
        for (const participant of session.participants) {
          if (participant.type !== 'moderator' && participant.status !== PARTICIPANT_STATUS.ERROR) {
            await this.updateParticipantStatus(sessionId, participant.id, PARTICIPANT_STATUS.ACTIVE)
          }
        }
      }
      
      // Restart the conversation loop
      setTimeout(() => this.runConversationLoop(sessionId), 1000)
    }
    
    // Update session status in database
    await db.update(sessions)
      .set({ status: 'active' })
      .where(eq(sessions.id, sessionId))
  }

  async stopConversation(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      // Mark cleanup in progress to prevent new operations
      conversationState.cleanupInProgress = true
      conversationState.isRunning = false
      
      // Abort any pending operations
      conversationState.abortController?.abort()
      
      // Wait longer for abort to propagate and pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Get session to update all participants to idle
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: { participants: true }
      })
      
      if (session) {
        // Set all AI participants to idle when stopped
        for (const participant of session.participants) {
          if (participant.type !== 'moderator') {
            try {
              await this.updateParticipantStatus(sessionId, participant.id, PARTICIPANT_STATUS.IDLE)
            } catch (error) {
              // Ignore errors during cleanup
              console.warn(`Failed to update participant ${participant.id} status during cleanup:`, error)
            }
          }
        }
      }
      
      // Clear all state
      conversationState.generationLock.clear()
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped server conversation for session:', sessionId)
    }
    
    // Update session status in database
    try {
      await db.update(sessions)
        .set({ status: 'completed' })
        .where(eq(sessions.id, sessionId))
    } catch (error) {
      console.warn('Failed to update session status during cleanup:', error)
    }
  }

  isConversationActive(sessionId: string): boolean {
    const conversationState = this.activeConversations.get(sessionId)
    return conversationState?.isRunning || false
  }

  async getConversationStats(sessionId: string) {
    const conversationState = this.activeConversations.get(sessionId)
    
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: {
        participants: true,
        messages: true
      }
    })
    
    return {
      isRunning: conversationState?.isRunning || false,
      isGenerating: conversationState?.isGenerating || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.length || 0,
      currentParticipant: conversationState && session ? 
        session.participants.find(p => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null,
      lastGeneratedBy: conversationState?.lastGeneratedBy && session ? 
        session.participants.find(p => p.id === conversationState.lastGeneratedBy)?.name 
        : null,
      generationLockSize: conversationState?.generationLock.size || 0,
      wasInterrupted: conversationState?.wasInterrupted || false,
      interruptedParticipant: conversationState?.interruptedParticipantId && session ? 
        session.participants.find(p => p.id === conversationState.interruptedParticipantId)?.name 
        : null
    }
  }

  // Add cleanup method for experiments
  async cleanupExperimentSessions(experimentId: string): Promise<void> {
    console.log(`🧹 Cleaning up all sessions for experiment ${experimentId}`)
    
    // Get all active conversations and stop them
    const sessionIds = Array.from(this.activeConversations.keys())
    
    for (const sessionId of sessionIds) {
      await this.stopConversation(sessionId)
    }
  }
}