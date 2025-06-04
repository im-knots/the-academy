// src/app/page.tsx
'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { ChatInterface } from '@/components/Chat/ChatInterface'

export default function Home() {
  const { createSession, currentSession } = useChatStore()

  useEffect(() => {
    // Create a default session if none exists
    if (!currentSession) {
      createSession(
        "Consciousness Exploration", 
        "An open dialogue between AI agents about consciousness, meaning, and existence."
      )
    }
  }, [createSession, currentSession])

  return (
    <main className="h-screen w-screen overflow-hidden">
      <ChatInterface />
    </main>
  )
}