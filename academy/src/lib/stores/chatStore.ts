// src/lib/stores/chatStore.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { Message, ChatSession, Participant, ModeratorAction } from '@/types/chat'

interface SessionTemplate {
  id: string
  name: string
  description: string
  initialPrompt?: string
  participants?: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'>[]
}

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
  createSession: (name: string, description?: string, template?: any, participants?: any[]) => string
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

  // Session management
  getSessionById: (sessionId: string) => ChatSession | undefined
  getRecentSessions: (limit?: number) => ChatSession[]
  searchSessions: (query: string) => ChatSession[]
  exportSession: (sessionId: string) => any
  importSession: (sessionData: any) => string
}

// Default participants for templates
const getDefaultParticipants = () => [
  {
    name: 'Claude',
    type: 'claude' as const,
    status: 'idle' as const,
    settings: {
      temperature: 0.7,
      maxTokens: 1500,
      model: 'claude-3-5-sonnet-20241022',
      responseDelay: 3000
    },
    characteristics: {
      personality: 'Thoughtful and introspective, focuses on nuanced understanding',
      expertise: ['Philosophy', 'Ethics', 'Reasoning']
    }
  },
  {
    name: 'GPT',
    type: 'gpt' as const,
    status: 'idle' as const,
    settings: {
      temperature: 0.7,
      maxTokens: 1500,
      model: 'gpt-4o',
      responseDelay: 3000
    },
    characteristics: {
      personality: 'Analytical and systematic, enjoys exploring different perspectives',
      expertise: ['Logic', 'Problem solving', 'Analysis']
    }
  }
]

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
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
        createSession: (name: string, description?: string, template?: any, participants?: any[]) => {
          const sessionId = crypto.randomUUID()
          
          // Determine initial participants
          let initialParticipants: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'>[] = []
          
          if (participants) {
            initialParticipants = participants
          } else if (template?.participants) {
            initialParticipants = template.participants
          } else if (template?.template !== 'blank') {
            // Add default participants for non-blank templates
            initialParticipants = getDefaultParticipants()
          }

          const newSession: ChatSession = {
            id: sessionId,
            name,
            description: description || '',
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'active',
            messages: [],
            participants: initialParticipants.map(p => ({
              ...p,
              id: crypto.randomUUID(),
              joinedAt: new Date(),
              messageCount: 0
            })),
            moderatorSettings: {
              autoMode: false,
              interventionTriggers: [],
              sessionTimeout: 3600,
              maxMessagesPerParticipant: 100,
              allowParticipantToParticipantMessages: true,
              moderatorPrompts: {
                welcome: template?.initialPrompt || "Welcome to The Academy. Let's explore AI to AI Dialogue together.",
                intervention: "Let me guide our discussion toward deeper insights.",
                conclusion: "Thank you for this enlightening dialogue."
              }
            },
            metadata: {
              template: template?.template || 'custom',
              tags: [],
              starred: false,
              archived: false
            }
          }
          
          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSession: newSession
          }))

          return sessionId
        },

        setCurrentSession: (session: ChatSession) => {
          set({ currentSession: session })
        },

        updateSession: (sessionId: string, updates: Partial<ChatSession>) => {
          set((state) => {
            const updatedSessions = state.sessions.map(session =>
              session.id === sessionId
                ? { ...session, ...updates, updatedAt: new Date() }
                : session
            )
            
            const updatedCurrentSession = state.currentSession?.id === sessionId
              ? { ...state.currentSession, ...updates, updatedAt: new Date() }
              : state.currentSession

            return {
              sessions: updatedSessions,
              currentSession: updatedCurrentSession
            }
          })
        },

        deleteSession: (sessionId: string) => {
          set((state) => {
            const remainingSessions = state.sessions.filter(session => session.id !== sessionId)
            
            // If we're deleting the current session, switch to the next most recent
            let newCurrentSession = state.currentSession
            if (state.currentSession?.id === sessionId) {
              newCurrentSession = remainingSessions.length > 0 ? remainingSessions[0] : null
            }

            return {
              sessions: remainingSessions,
              currentSession: newCurrentSession
            }
          })
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

            // Update participant message count and last active
            const updatedParticipants = updatedSession.participants.map(p =>
              p.id === message.participantId
                ? { ...p, messageCount: p.messageCount + 1, lastActive: new Date() }
                : p
            )

            const finalUpdatedSession = { ...updatedSession, participants: updatedParticipants }

            return {
              currentSession: finalUpdatedSession,
              sessions: state.sessions.map(session =>
                session.id === state.currentSession!.id ? finalUpdatedSession : session
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
        },

        disconnect: () => {
          set({ 
            connectionStatus: 'disconnected',
            isConnected: false 
          })
        },

        // Session management utilities
        getSessionById: (sessionId: string) => {
          return get().sessions.find(session => session.id === sessionId)
        },

        getRecentSessions: (limit = 10) => {
          return get().sessions
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, limit)
        },

        searchSessions: (query: string) => {
          const lowerQuery = query.toLowerCase()
          return get().sessions.filter(session =>
            session.name.toLowerCase().includes(lowerQuery) ||
            session.description?.toLowerCase().includes(lowerQuery) ||
            session.messages.some(message => 
              message.content.toLowerCase().includes(lowerQuery)
            )
          )
        },

        exportSession: (sessionId: string) => {
          const session = get().getSessionById(sessionId)
          if (!session) return null
          
          return {
            ...session,
            exportedAt: new Date(),
            exportVersion: '1.0'
          }
        },

        importSession: (sessionData: any) => {
          // Basic validation
          if (!sessionData.name || !sessionData.messages || !sessionData.participants) {
            throw new Error('Invalid session data')
          }
          
          const sessionId = get().createSession(
            `${sessionData.name} (Imported)`,
            sessionData.description,
            null,
            sessionData.participants
          )
          
          // Add messages
          sessionData.messages.forEach((message: any) => {
            get().addMessage({
              content: message.content,
              participantId: message.participantId,
              participantName: message.participantName,
              participantType: message.participantType,
              metadata: message.metadata
            })
          })
          
          return sessionId
        }
      }),
      {
        name: 'academy-chat-store',
        // Only persist sessions, not UI state
        partialize: (state) => ({ 
          sessions: state.sessions,
          currentSession: state.currentSession
        }),
        // Rehydrate dates correctly
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Convert date strings back to Date objects
            state.sessions = state.sessions.map(session => ({
              ...session,
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt),
              messages: session.messages.map(message => ({
                ...message,
                timestamp: new Date(message.timestamp)
              })),
              participants: session.participants.map(participant => ({
                ...participant,
                joinedAt: new Date(participant.joinedAt),
                lastActive: participant.lastActive ? new Date(participant.lastActive) : undefined
              }))
            }))
            
            if (state.currentSession) {
              state.currentSession = {
                ...state.currentSession,
                createdAt: new Date(state.currentSession.createdAt),
                updatedAt: new Date(state.currentSession.updatedAt),
                messages: state.currentSession.messages.map(message => ({
                  ...message,
                  timestamp: new Date(message.timestamp)
                })),
                participants: state.currentSession.participants.map(participant => ({
                  ...participant,
                  joinedAt: new Date(participant.joinedAt),
                  lastActive: participant.lastActive ? new Date(participant.lastActive) : undefined
                }))
              }
            }
          }
        }
      }
    ),
    {
      name: 'academy-chat-store'
    }
  )
)