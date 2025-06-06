// src/hooks/useTemplatePrompt.ts
import { useEffect, useState } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'

const TEMPLATE_PROMPTS: Record<string, string> = {
  consciousness: 'Let\'s explore the fundamental question: What does it mean to be conscious? I\'d like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.',
  creativity: 'How do you approach creative problem-solving? Let\'s discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.',
  philosophy: 'What makes a life meaningful? Let\'s engage in philosophical inquiry about purpose, meaning, ethics, and the good life.',
  future: 'How do you envision the future relationship between AI and humanity? Let\'s explore potential developments, challenges, and opportunities.',
  casual: 'Let\'s have an open conversation. What\'s something that\'s been on your mind lately that you\'d like to explore together?'
}

export function useTemplatePrompt() {
  const { currentSession } = useChatStore()
  const [suggestedPrompt, setSuggestedPrompt] = useState<string>('')

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