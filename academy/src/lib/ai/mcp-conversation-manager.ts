// src/lib/ai/mcp-conversation-manager.ts
'use client'

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

    // Get session data via MCP
    const sessionResult = await this.mcpClient.callTool('get_session', { sessionId })
    if (!sessionResult.success || !sessionResult.session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    const session = sessionResult.session

    const aiParticipants = session.participants.filter((p: any) => p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Create abort controller for this conversation
    const abortController = new AbortController()

    // Sort participants by creation order (when they were added) for sequential conversation
    const sortedParticipants = aiParticipants.sort((a: any, b: any) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    // Initialize conversation state with sequential order
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: sortedParticipants.map((p: any) => p.id), // Sequential, not shuffled
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

    console.log('📋 Sequential participant order:', sortedParticipants.map((p: any) => `${p.name} (${p.type})`).join(' → '))

    // Update session status via MCP
    await this.mcpClient.updateSessionViaMCP(sessionId, undefined, undefined, { status: 'active' })

    // Add initial prompt if provided
    if (initialPrompt?.trim()) {
      await this.mcpClient.sendMessageViaMCP(
        sessionId,
        initialPrompt.trim(),
        'moderator',
        'Research Moderator',
        'moderator'
      )
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

        // Get current session state via MCP
        const sessionResult = await this.mcpClient.callTool('get_session', { sessionId })
        if (!sessionResult.success || !sessionResult.session) {
          console.log('❌ Session not found, stopping conversation')
          break
        }
        const session = sessionResult.session

        if (session.status === 'paused' || session.status === 'completed') {
          console.log('⏸️ Session paused or completed, waiting...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        // Check if we have enough participants
        const activeAIParticipants = session.participants.filter((p: any) => 
          p.type !== 'moderator' && p.status !== 'error'
        )
        
        if (activeAIParticipants.length < 2) {
          console.log('❌ Not enough active AI participants')
          break
        }

        // Update participant queue if participants changed, but keep sequential order
        const sortedParticipants = activeAIParticipants.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        const currentQueue = sortedParticipants.map((p: any) => p.id)
        
        if (JSON.stringify(conversationState.participantQueue) !== JSON.stringify(currentQueue)) {
          const previousParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
          conversationState.participantQueue = currentQueue
          
          // Try to maintain position for the same participant
          const newIndex = conversationState.participantQueue.indexOf(previousParticipantId)
          if (newIndex !== -1) {
            conversationState.currentParticipantIndex = newIndex
          } else {
            conversationState.currentParticipantIndex = 0
          }
          
          console.log('📋 Updated sequential order:', sortedParticipants.map((p: any) => `${p.name} (${p.type})`).join(' → '))
        }

        // Get current participant (strict sequential order)
        const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
        const currentParticipant = session.participants.find((p: any) => p.id === currentParticipantId)

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
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // For sequential conversation, we're more permissive about back-to-back responses
        // Only prevent immediate back-to-back (within 2 seconds)
        if (conversationState.lastGeneratedBy === currentParticipantId && session.messages.length > 0) {
          const lastMessage = session.messages[session.messages.length - 1]
          const timeSinceLastMessage = Date.now() - new Date(lastMessage.timestamp).getTime()
          if (timeSinceLastMessage < 2000) { // Reduced from 5 seconds
            console.log(`⏭️ Brief pause for ${currentParticipant.name} - just generated`)
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
        }

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking via MCP... [Position ${conversationState.currentParticipantIndex + 1}/${conversationState.participantQueue.length}]`)

        // Mark as generating and add to lock
        conversationState.isGenerating = true
        conversationState.generationLock.add(currentParticipantId)
        
        // Update participant status via MCP
        await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'thinking')

        try {
          // Generate response via MCP tools with abort signal
          const response = await this.generateAIResponseViaMCP(
            sessionId, 
            currentParticipant, 
            conversationState.abortController?.signal
          )

          if (response && conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
            // Add message to session via MCP
            await this.mcpClient.sendMessageViaMCP(
              sessionId,
              response,
              currentParticipant.id,
              currentParticipant.name,
              currentParticipant.type
            )

            conversationState.messageCount++
            conversationState.lastGeneratedBy = currentParticipantId
            console.log(`💬 ${currentParticipant.name}: ${response.substring(0, 100)}...`)

            // Update participant status back to active via MCP
            await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'active')

            // Always move to next participant in sequential order
            this.moveToNextParticipant(sessionId)

          } else {
            console.log('❌ Failed to generate response or conversation stopped')
            
            // If aborted, don't mark as error - preserve the participant's turn
            if (conversationState.abortController?.signal.aborted) {
              console.log(`🛑 Generation aborted for ${currentParticipant.name}, preserving turn`)
              conversationState.wasInterrupted = true
              conversationState.interruptedParticipantId = currentParticipantId
              conversationState.interruptedAt = new Date()
              await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'idle')
            } else {
              await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'error')
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
              await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'idle')
              break // Exit the loop gracefully
            }
          }
          
          await this.mcpClient.updateParticipantStatusViaMCP(sessionId, currentParticipantId, 'error')
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
      const context = await this.buildConversationContext(sessionId, participant)
      
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
          ollamaUrl: participant.settings.ollamaUrl || 'http://localhost:11434' 
        }),
        sessionId: sessionId,
        participantId: participant.id
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

  private async buildConversationContext(sessionId: string, participant: Participant): Promise<ConversationContext> {
    // Get session via MCP
    const sessionResult = await this.mcpClient.callTool('get_session', { sessionId })
    if (!sessionResult.success || !sessionResult.session) {
      throw new Error('Session not found')
    }
    const session = sessionResult.session

    // Get recent message history (last 10 messages)
    const recentMessages = session.messages.slice(-10)
    
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
        // For context, prefix with participant name
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
        temperature: participant.settings.temperature,
        maxTokens: participant.settings.maxTokens,
        model: participant.settings.model,
        responseDelay: participant.settings.responseDelay
      }
    }
  }

  private async buildSystemPrompt(participant: Participant, context: ConversationContext): Promise<string> {
    // Get session via MCP
    const sessionResult = await this.mcpClient.callTool('get_session', { sessionId: context.sessionId })
    if (!sessionResult.success || !sessionResult.session) {
      return ''
    }
    const session = sessionResult.session

    // Get other participants for context
    const otherParticipants = session.participants
      .filter((p: any) => p.id !== participant.id && p.type !== 'moderator')
      .map((p: any) => `${p.name} (${p.type})`)
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

  async pauseConversation(sessionId: string): Promise<void> {
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
    
    // Update session status via MCP
    await this.mcpClient.updateSessionViaMCP(sessionId, undefined, undefined, { status: 'paused' })
  }

  async resumeConversation(sessionId: string): Promise<void> {
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
    
    // Update session status via MCP
    await this.mcpClient.updateSessionViaMCP(sessionId, undefined, undefined, { status: 'active' })
  }

  async stopConversation(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      conversationState.abortController?.abort()
      conversationState.generationLock.clear()
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped MCP conversation for session:', sessionId)
    }
    
    // Update session status via MCP
    await this.mcpClient.updateSessionViaMCP(sessionId, undefined, undefined, { status: 'completed' })
  }

  isConversationActive(sessionId: string): boolean {
    const conversationState = this.activeConversations.get(sessionId)
    return conversationState?.isRunning || false
  }

  async getConversationStats(sessionId: string) {
    const conversationState = this.activeConversations.get(sessionId)
    
    // Get session via MCP
    const sessionResult = await this.mcpClient.callTool('get_session', { sessionId })
    const session = sessionResult.success ? sessionResult.session : null
    
    return {
      isRunning: conversationState?.isRunning || false,
      isGenerating: conversationState?.isGenerating || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.length || 0,
      currentParticipant: conversationState && session ? 
        session.participants.find((p: any) => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null,
      lastGeneratedBy: conversationState?.lastGeneratedBy && session ? 
        session.participants.find((p: any) => p.id === conversationState.lastGeneratedBy)?.name 
        : null,
      generationLockSize: conversationState?.generationLock.size || 0,
      mcpConnected: this.mcpClient.isConnected(),
      wasInterrupted: conversationState?.wasInterrupted || false,
      interruptedParticipant: conversationState?.interruptedParticipantId && session ? 
        session.participants.find((p: any) => p.id === conversationState.interruptedParticipantId)?.name 
        : null
    }
  }
}