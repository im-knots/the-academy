// src/app/page.tsx
'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { ChatInterface } from '@/components/Chat/ChatInterface'

export default function Home() {
  const { 
    createSession, 
    currentSession, 
    sessions, 
    hasHydrated,
    ensureCurrentSession 
  } = useChatStore()

  useEffect(() => {
    // Only run session logic after the store has hydrated from localStorage
    if (!hasHydrated) {
      console.log('Store not yet hydrated, waiting...')
      return
    }

    console.log('Store hydrated. Sessions:', sessions.length, 'Current:', !!currentSession)

    // Handle initial session creation for brand new users
    if (sessions.length === 0) {
      console.log('No sessions found, creating initial blank session')
      // Create a blank session for new users
      createSession(
        "New Session", 
        "Start your research dialogue",
        { template: 'blank' }
      )
    } else {
      // For existing users, ensure we have a current session
      // This is also handled in the store's rehydration logic, but double-check
      console.log('Existing sessions found, ensuring current session')
      ensureCurrentSession()
    }
  }, [hasHydrated, createSession, currentSession, sessions, ensureCurrentSession])

  // Show loading state until hydrated
  if (!hasHydrated) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen overflow-hidden">
      <ChatInterface />
    </main>
  )
}