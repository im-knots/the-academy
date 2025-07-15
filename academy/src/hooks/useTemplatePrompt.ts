// src/hooks/useTemplatePrompt.ts
import { useEffect, useState, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'

const TEMPLATE_PROMPTS: Record<string, string> = {
  consciousness: 'Let\'s explore the fundamental question: What does it mean to be conscious? I\'d like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.',
  creativity: 'How do you approach creative problem-solving? Let\'s discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.',
  philosophy: 'What makes a life meaningful? Let\'s engage in philosophical inquiry about purpose, meaning, ethics, and the good life.',
  future: 'How do you envision the future relationship between AI and humanity? Let\'s explore potential developments, challenges, and opportunities.',
  casual: 'Let\'s have an open conversation. What\'s something that\'s been on your mind lately that you\'d like to explore together?'
}

export function useTemplatePrompt() {
  const [currentSession, setCurrentSession] = useState<any>(null)
  const [suggestedPrompt, setSuggestedPrompt] = useState<string>('')
  const mcpClient = MCPClient.getInstance()

  // Fetch current session
  const fetchCurrentSession = useCallback(async () => {
    try {
      // Get current session ID
      const sessionIdResult = await mcpClient.callTool('get_current_session_id', {})
      
      if (sessionIdResult.success && sessionIdResult.sessionId) {
        // Get session details
        const sessionResult = await mcpClient.callTool('get_session', { 
          sessionId: sessionIdResult.sessionId 
        })
        
        if (sessionResult.success && sessionResult.session) {
          setCurrentSession(sessionResult.session)
        } else {
          setCurrentSession(null)
        }
      } else {
        setCurrentSession(null)
      }
    } catch (error) {
      console.error('Failed to fetch current session for template prompt:', error)
      setCurrentSession(null)
    }
  }, [mcpClient])

  // Poll for current session updates
  useEffect(() => {
    fetchCurrentSession()
    
    // Poll every 2 seconds for updates
    const interval = setInterval(fetchCurrentSession, 2000)
    
    return () => clearInterval(interval)
  }, [fetchCurrentSession])

  // Update suggested prompt based on session template
  useEffect(() => {
    if (currentSession?.metadata?.template && 
        currentSession.metadata.template !== 'blank' && 
        currentSession.messages.length === 0) {
      const templateId = currentSession.metadata.template
      const prompt = TEMPLATE_PROMPTS[templateId]
      if (prompt) {
        setSuggestedPrompt(prompt)
      }
    } else {
      setSuggestedPrompt('')
    }
  }, [currentSession])

  const clearSuggestedPrompt = () => setSuggestedPrompt('')

  return {
    suggestedPrompt,
    clearSuggestedPrompt,
    hasTemplate: !!currentSession?.metadata?.template,
    templateId: currentSession?.metadata?.template
  }
}