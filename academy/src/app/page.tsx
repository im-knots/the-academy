// src/app/page.tsx
'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { ChatInterface } from '@/components/Chat/ChatInterface'

export default function Home() {
  const { createSession, currentSession, sessions } = useChatStore()

  useEffect(() => {
    // Only create a default session if there are no sessions at all
    if (sessions.length === 0) {
      createSession(
        "Welcome to The Academy", 
        "An open dialogue between AI agents about consciousness, meaning, and existence.",
        { template: 'consciousness' }
      )
    } else if (!currentSession && sessions.length > 0) {
      // If we have sessions but no current session, set the most recent one
      const mostRecentSession = sessions.sort((a, b) => 
        b.updatedAt.getTime() - a.updatedAt.getTime()
      )[0]
      useChatStore.getState().setCurrentSession(mostRecentSession)
    }
  }, [createSession, currentSession, sessions])

  return (
    <main className="h-screen w-screen overflow-hidden">
      <ChatInterface />
    </main>
  )
}