// src/lib/stores/chatStore.ts
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Message, ChatSession, Participant, ModeratorAction } from '@/types/chat'

interface ChatState {
  // Session state
  currentSession: ChatSession | null
  sessions: ChatSession[]
  
  // Real-time state
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  
  // UI state
  isSessionPaused: boolean
  showParticipantPanel: boolean
  showModeratorPanel: boolean
  selectedMessageId: string | null
  
  // Actions
  createSession: (name: string, description?: string) => void
  setCurrentSession: (session: ChatSession) => void
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  deleteSession: (sessionId: string) => void
  
  // Message actions
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  updateMessage: (messageId: string, updates: Partial<Message>) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
  
  // Participant actions
  addParticipant: (participant: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'>) => void
  removeParticipant: (participantId: string) => void
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void
  updateParticipantStatus: (participantId: string, status: Participant['status']) => void
  
  // Session control
  pauseSession: () => void
  resumeSession: () => void
  endSession: () => void
  
  // Moderator actions
  injectPrompt: (prompt: string) => void
  executeModeratorAction: (action: ModeratorAction) => void
  
  // UI actions
  toggleParticipantPanel: () => void
  toggleModeratorPanel: () => void
  selectMessage: (messageId: string | null) => void
  
  // Connection actions
  setConnectionStatus: (status: ChatState['connectionStatus']) => void
  connect: () => void
  disconnect: () => void
}

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentSession: null,
      sessions: [],
      isConnected: false,
      connectionStatus: 'disconnected',
      isSessionPaused: false,
      showParticipantPanel: true,
      showModeratorPanel: true,
      selectedMessageId: null,

      // Session actions
      createSession: (name: string, description?: string) => {
        const newSession: ChatSession = {
          id: crypto.randomUUID(),
          name,
          description,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'active',
          messages: [],
          participants: [],
          moderatorSettings: {
            autoMode: false,
            interventionTriggers: [],
            sessionTimeout: 3600, // 1 hour
            maxMessagesPerParticipant: 100,
            allowParticipantToParticipantMessages: true,
            moderatorPrompts: {
              welcome: "Welcome to The Academy. Let's explore consciousness together.",
              intervention: "Let me guide our discussion toward deeper insights.",
              conclusion: "Thank you for this enlightening dialogue."
            }
          }
        }
        
        set((state) => ({
          sessions: [...state.sessions, newSession],
          currentSession: newSession
        }))
      },

      setCurrentSession: (session: ChatSession) => {
        set({ currentSession: session })
      },

      updateSession: (sessionId: string, updates: Partial<ChatSession>) => {
        set((state) => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, ...updates, updatedAt: new Date() }
              : session
          ),
          currentSession: state.currentSession?.id === sessionId
            ? { ...state.currentSession, ...updates, updatedAt: new Date() }
            : state.currentSession
        }))
      },

      deleteSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.filter(session => session.id !== sessionId),
          currentSession: state.currentSession?.id === sessionId ? null : state.currentSession
        }))
      },

      // Message actions
      addMessage: (messageData) => {
        const message: Message = {
          ...messageData,
          id: crypto.randomUUID(),
          timestamp: new Date()
        }

        set((state) => {
          if (!state.currentSession) return state

          const updatedSession = {
            ...state.currentSession,
            messages: [...state.currentSession.messages, message],
            updatedAt: new Date()
          }

          // Update participant message count
          const updatedParticipants = updatedSession.participants.map(p =>
            p.id === message.participantId
              ? { ...p, messageCount: p.messageCount + 1, lastActive: new Date() }
              : p
          )

          return {
            currentSession: { ...updatedSession, participants: updatedParticipants },
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? { ...updatedSession, participants: updatedParticipants } : session
            )
          }
        })
      },

      updateMessage: (messageId: string, updates: Partial<Message>) => {
        set((state) => {
          if (!state.currentSession) return state

          const updatedMessages = state.currentSession.messages.map(message =>
            message.id === messageId ? { ...message, ...updates } : message
          )

          const updatedSession = {
            ...state.currentSession,
            messages: updatedMessages,
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      removeMessage: (messageId: string) => {
        set((state) => {
          if (!state.currentSession) return state

          const updatedMessages = state.currentSession.messages.filter(message => message.id !== messageId)
          const updatedSession = {
            ...state.currentSession,
            messages: updatedMessages,
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      clearMessages: () => {
        set((state) => {
          if (!state.currentSession) return state

          const updatedSession = {
            ...state.currentSession,
            messages: [],
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      // Participant actions
      addParticipant: (participantData) => {
        const participant: Participant = {
          ...participantData,
          id: crypto.randomUUID(),
          joinedAt: new Date(),
          messageCount: 0
        }

        set((state) => {
          if (!state.currentSession) return state

          const updatedSession = {
            ...state.currentSession,
            participants: [...state.currentSession.participants, participant],
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      removeParticipant: (participantId: string) => {
        set((state) => {
          if (!state.currentSession) return state

          const updatedSession = {
            ...state.currentSession,
            participants: state.currentSession.participants.filter(p => p.id !== participantId),
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      updateParticipant: (participantId: string, updates: Partial<Participant>) => {
        set((state) => {
          if (!state.currentSession) return state

          const updatedParticipants = state.currentSession.participants.map(p =>
            p.id === participantId ? { ...p, ...updates } : p
          )

          const updatedSession = {
            ...state.currentSession,
            participants: updatedParticipants,
            updatedAt: new Date()
          }

          return {
            currentSession: updatedSession,
            sessions: state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )
          }
        })
      },

      updateParticipantStatus: (participantId: string, status: Participant['status']) => {
        get().updateParticipant(participantId, { status, lastActive: new Date() })
      },

      // Session control
      pauseSession: () => {
        set({ isSessionPaused: true })
        get().updateSession(get().currentSession?.id || '', { status: 'paused' })
      },

      resumeSession: () => {
        set({ isSessionPaused: false })
        get().updateSession(get().currentSession?.id || '', { status: 'active' })
      },

      endSession: () => {
        set({ isSessionPaused: false })
        get().updateSession(get().currentSession?.id || '', { status: 'completed' })
      },

      // Moderator actions
      injectPrompt: (prompt: string) => {
        get().addMessage({
          content: prompt,
          participantId: 'moderator',
          participantName: 'Moderator',
          participantType: 'moderator'
        })
      },

      executeModeratorAction: (action: ModeratorAction) => {
        switch (action.type) {
          case 'pause':
            get().pauseSession()
            break
          case 'resume':
            get().resumeSession()
            break
          case 'end_session':
            get().endSession()
            break
          case 'inject_prompt':
            if (action.data?.prompt) {
              get().injectPrompt(action.data.prompt)
            }
            break
        }
      },

      // UI actions
      toggleParticipantPanel: () => {
        set((state) => ({ showParticipantPanel: !state.showParticipantPanel }))
      },

      toggleModeratorPanel: () => {
        set((state) => ({ showModeratorPanel: !state.showModeratorPanel }))
      },

      selectMessage: (messageId: string | null) => {
        set({ selectedMessageId: messageId })
      },

      // Connection actions
      setConnectionStatus: (status: ChatState['connectionStatus']) => {
        set({ 
          connectionStatus: status,
          isConnected: status === 'connected'
        })
      },

      connect: () => {
        set({ connectionStatus: 'connecting' })
        // WebSocket connection logic will be implemented separately
      },

      disconnect: () => {
        set({ 
          connectionStatus: 'disconnected',
          isConnected: false 
        })
      }
    }),
    {
      name: 'academy-chat-store'
    }
  )
)