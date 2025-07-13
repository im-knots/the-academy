// src/lib/ai/mcp-conversation-manager.ts
'use client'

import { useChatStore } from '../stores/chatStore'
import { Participant, Message } from '@/types/chat'
import { MCPClient } from '../mcp/client'

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
  // New: State preservation for interruptions
  wasInterrupted: boolean
  interruptedParticipantId?: string
  interruptedAt: Date | null
  resumeFromParticipant?: string
}

export class MCPConversationManager {
  private static instance: MCPConversationManager
  private mcpClient: MCPClient
  private activeConversations: Map<string, ConversationState> = new Map()

  private constructor() {
    this.mcpClient = MCPClient.getInstance()
  }

  static getInstance(): MCPConversationManager {
    if (!MCPConversationManager.instance) {
      MCPConversationManager.instance = new MCPConversationManager()
    }
    return MCPConversationManager.instance
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    console.log('🚀 Starting MCP-powered conversation for session:', sessionId)

    // Cancel any existing conversation for this session
    await this.stopConversation(sessionId)

    // Ensure MCP is connected
    if (!this.mcpClient.isConnected()) {
      await this.mcpClient.initialize()
    }

    // Get session data from store
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const aiParticipants = session.participants.filter(p => p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Create abort controller for this conversation
    const abortController = new AbortController()

    // Initialize conversation state
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: this.shuffleArray([...aiParticipants.map(p => p.id)]),
      currentParticipantIndex: 0,
      messageCount: 0,
      abortController,
      isGenerating: false,
      lastGeneratedBy: undefined,
      generationLock: new Set(),
      wasInterrupted: false,
      interruptedParticipantId: undefined,
      interruptedAt: null,
      resumeFromParticipant: undefined
    })

    // Update session status
    useChatStore.getState().updateSession(sessionId, { status: 'active' })

    // Add initial prompt if provided
    if (initialPrompt?.trim()) {
      useChatStore.getState().addMessage({
        content: initialPrompt.trim(),
        participantId: 'moderator',
        participantName: 'Research Moderator',
        participantType: 'moderator'
      })
    }

    // Start the conversation loop
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

    console.log('🔄 Running MCP conversation loop for session:', sessionId)

    while (conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
      try {
        // Prevent overlapping generations
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
          p.type !== 'moderator' && p.status !== 'error'
        )
        
        if (activeAIParticipants.length < 2) {
          console.log('❌ Not enough active AI participants')
          break
        }

        // Update participant queue if participants changed
        const currentQueue = activeAIParticipants.map(p => p.id)
        if (JSON.stringify(conversationState.participantQueue) !== JSON.stringify(currentQueue)) {
          conversationState.participantQueue = currentQueue
          
          // Preserve position if we have a specific participant to resume from
          if (conversationState.resumeFromParticipant) {
            const resumeIndex = conversationState.participantQueue.indexOf(conversationState.resumeFromParticipant)
            if (resumeIndex !== -1) {
              conversationState.currentParticipantIndex = resumeIndex
            }
            conversationState.resumeFromParticipant = undefined
          } else {
            conversationState.currentParticipantIndex = 0
          }
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

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking via MCP...`)

        // Mark as generating and add to lock
        conversationState.isGenerating = true
        conversationState.generationLock.add(currentParticipantId)
        
        // Update participant status
        useChatStore.getState().updateParticipantStatus(currentParticipantId, 'thinking')

        try {
          // Generate response via MCP tools with abort signal
          const response = await this.generateAIResponseViaMCP(
            sessionId, 
            currentParticipant, 
            conversationState.abortController?.signal
          )

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

            // Move to next participant only if we completed successfully
            this.moveToNextParticipant(sessionId)

          } else {
            console.log('❌ Failed to generate response or conversation stopped')
            
            // If aborted, don't mark as error - preserve the participant's turn
            if (conversationState.abortController?.signal.aborted) {
              console.log(`🛑 Generation aborted for ${currentParticipant.name}, preserving turn`)
              conversationState.wasInterrupted = true
              conversationState.interruptedParticipantId = currentParticipantId
              conversationState.interruptedAt = new Date()
              useChatStore.getState().updateParticipantStatus(currentParticipantId, 'idle')
            } else {
              useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
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
              useChatStore.getState().updateParticipantStatus(currentParticipantId, 'idle')
              break // Exit the loop gracefully
            }
          }
          
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 5000))
        } finally {
          // Always clean up generation state
          conversationState.isGenerating = false
          conversationState.generationLock.delete(currentParticipantId)
        }

        // Wait between responses (only if we weren't interrupted)
        if (!conversationState.abortController?.signal.aborted) {
          const baseDelay = currentParticipant.settings.responseDelay || 4000
          const adaptiveDelay = currentParticipant.type === 'gpt' ? baseDelay * 1.2 : baseDelay
          await new Promise(resolve => setTimeout(resolve, Math.max(adaptiveDelay, 3000)))
        }

      } catch (error) {
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'))) {
          console.log('🛑 Conversation aborted gracefully')
          break
        }
        
        console.error('❌ Error in MCP conversation loop:', error)
        
        if (conversationState) {
          conversationState.isGenerating = false
          conversationState.generationLock.clear()
        }
        
        await new Promise(resolve => setTimeout(resolve, 8000))
      }
    }

    console.log('🛑 MCP conversation loop ended for session:', sessionId)
    
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

  private async generateAIResponseViaMCP(
    sessionId: string, 
    participant: Participant, 
    abortSignal?: AbortSignal
  ): Promise<string> {
    try {
      // Check if already aborted
      if (abortSignal?.aborted) {
        throw new Error('Request was aborted before starting')
      }

      // Build conversation context
      const context = this.buildConversationContext(sessionId, participant)
      
      console.log(`🔄 Generating response for ${participant.name} via MCP with ${context.messageHistory.length} messages`)
      
      const toolName = participant.type === 'claude' ? 'claude_chat' : 
                participant.type === 'gemini' ? 'gemini_chat' : 
                participant.type === 'grok' ? 'grok_chat' : 
                participant.type === 'ollama' ? 'ollama_chat' :
                participant.type === 'deepseek' ? 'deepseek_chat' :
                participant.type === 'mistral' ? 'mistral_chat' :
                participant.type === 'cohere' ? 'cohere_chat' :
                'openai_chat';

      // Prepare messages for the AI API
      const messages = context.messageHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Build system prompt once
      const systemPrompt = this.buildSystemPrompt(participant, context)

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
          ollamaUrl: participant.settings.ollamaUrl || 'http://localhost:11434' 
        })
      };

      console.log(`🌐 Calling MCP tool ${toolName} for ${participant.name}`)

      // Call the MCP tool with abort signal support
      const result = await this.mcpClient.callToolWithAbort(toolName, toolArgs, abortSignal)
      
      if (!result.success || !result.content) {
        throw new Error('No content in MCP tool response')
      }

      console.log(`✅ Successfully generated response for ${participant.name} via MCP (${result.content.length} chars)`)
      return result.content

    } catch (error) {
      console.error(`Error generating MCP response for ${participant.name}:`, error)
      throw error
    }
  }

  private buildConversationContext(sessionId: string, participant: Participant): ConversationContext {
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    // Get recent message history (last 10 messages)
    const recentMessages = session.messages.slice(-10)
    
    // Convert to conversation format
    const messageHistory = recentMessages.map(msg => {
      let role: 'user' | 'assistant' | 'system' = 'assistant'
      let content = msg.content

      if (msg.participantType === 'moderator') {
        role = 'user'
      } else if (msg.participantId === participant.id) {
        role = 'assistant'
      } else {
        role = 'user'
        // For context, prefix with participant name
        content = `${msg.participantName}: ${msg.content}`
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

You are engaged in a thoughtful research dialogue via the Model Context Protocol (MCP). Guidelines:
- Be authentic and bring your unique perspective
- Engage meaningfully with what others have said
- Ask thoughtful questions that advance the conversation  
- Keep responses conversational (1-3 paragraphs typically)
- Build naturally on the conversation flow
- Express disagreement or different viewpoints thoughtfully
- You are ${participant.name} with your own unique perspective

${participant.systemPrompt ? `Additional instructions: ${participant.systemPrompt}` : ''}

Remember: This is genuine exploration through dialogue facilitated by MCP. Each response should feel natural and contribute meaningfully. You are not just an AI model - you are ${participant.name}.`

    return basePrompt
  }

  pauseConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      // Gracefully stop the conversation
      conversationState.isRunning = false
      
      // Abort any ongoing requests
      conversationState.abortController?.abort()
      
      // Clear generation flags to prevent hanging
      conversationState.isGenerating = false
      conversationState.generationLock.clear()
      
      console.log('⏸️ Paused MCP conversation for session:', sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'paused' })
  }

  resumeConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState && !conversationState.isRunning) {
      // Create new abort controller for the resumed conversation
      conversationState.abortController = new AbortController()
      conversationState.isRunning = true
      conversationState.isGenerating = false
      conversationState.generationLock.clear()
      
      // If we were interrupted during someone's turn, resume from that participant
      if (conversationState.wasInterrupted && conversationState.interruptedParticipantId) {
        console.log(`▶️ Resuming from interrupted participant: ${conversationState.interruptedParticipantId}`)
        conversationState.resumeFromParticipant = conversationState.interruptedParticipantId
        
        // Clear interruption state
        conversationState.wasInterrupted = false
        conversationState.interruptedParticipantId = undefined
        conversationState.interruptedAt = null
      }
      
      console.log('▶️ Resumed MCP conversation for session:', sessionId)
      
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
      conversationState.generationLock.clear()
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped MCP conversation for session:', sessionId)
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
      isGenerating: conversationState?.isGenerating || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.length || 0,
      currentParticipant: conversationState ? 
        session?.participants.find(p => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null,
      lastGeneratedBy: conversationState?.lastGeneratedBy ? 
        session?.participants.find(p => p.id === conversationState.lastGeneratedBy)?.name 
        : null,
      generationLockSize: conversationState?.generationLock.size || 0,
      mcpConnected: this.mcpClient.isConnected(),
      wasInterrupted: conversationState?.wasInterrupted || false,
      interruptedParticipant: conversationState?.interruptedParticipantId ? 
        session?.participants.find(p => p.id === conversationState.interruptedParticipantId)?.name 
        : null
    }
  }
}