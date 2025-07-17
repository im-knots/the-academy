// src/hooks/useTemplatePrompt.ts - Updated with Event-Driven Polling
import { useEffect, useState, useCallback, useRef } from 'react'
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
  const mcpClientRef = useRef(MCPClient.getInstance())

  // EVENT-DRIVEN: Fetch current session function
  const fetchCurrentSession = useCallback(async () => {
    try {
      // Get current session ID
      const sessionIdResult = await mcpClientRef.current.callTool('get_current_session_id', {})
      if (sessionIdResult.success && sessionIdResult.sessionId) {
        // Get session details
        const sessionResult = await mcpClientRef.current.callTool('get_session', {
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
  }, [])

  // EVENT-DRIVEN: Register data refresh callbacks for session updates
  useEffect(() => {
    console.log('🎯 useTemplatePrompt: Setting up event-driven refresh')

    // Initial fetch
    fetchCurrentSession()

    // Register for current session updates via event-driven system
    const unsubscribeCurrentSession = mcpClientRef.current.registerDataRefreshCallback(
      'current-session', 
      fetchCurrentSession
    )
    
    // Also register for session data updates (in case session content changes)
    const unsubscribeSessionData = mcpClientRef.current.registerDataRefreshCallback(
      'session-data', 
      fetchCurrentSession
    )
    
    // Register for sessions list updates (switching sessions)
    const unsubscribeSessionsList = mcpClientRef.current.registerDataRefreshCallback(
      'sessions-list', 
      fetchCurrentSession
    )

    return () => {
      console.log('🎯 useTemplatePrompt: Cleaning up event-driven callbacks')
      unsubscribeCurrentSession()
      unsubscribeSessionData()
      unsubscribeSessionsList()
    }
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