// src/lib/stores/chatStore.ts - Analysis Snapshot Fix
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { Message, ChatSession, Participant, ModeratorAction, AnalysisSnapshot, APIError } from '@/types/chat'

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
  
  // Error tracking
  apiErrors: APIError[]

  
  // Hydration state
  hasHydrated: boolean
  
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
  
  // Analysis actions
  addAnalysisSnapshot: (analysis: Omit<AnalysisSnapshot, 'id' | 'timestamp'>) => void
  getAnalysisHistory: (sessionId?: string) => AnalysisSnapshot[]
  clearAnalysisHistory: (sessionId?: string) => void
  
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

  // Hydration action
  setHasHydrated: (state: boolean) => void

  // Session management
  getSessionById: (sessionId: string) => ChatSession | undefined
  getRecentSessions: (limit?: number) => ChatSession[]
  searchSessions: (query: string) => ChatSession[]
  exportSession: (sessionId: string) => any
  importSession: (sessionData: any) => string

  // Internal helper
  ensureCurrentSession: () => void

  addAPIError: (error: APIError) => void;
  clearAPIErrors: () => void;
  getSessionErrors: (sessionId: string) => APIError[];
  getErrorStats: () => {
    total: number;
    byProvider: Record<string, number>;
    bySession: Record<string, number>;
    recent: APIError[];
  };
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
        hasHydrated: false,
        isConnected: false,
        connectionStatus: 'disconnected',
        isSessionPaused: false,
        showParticipantPanel: true,
        showModeratorPanel: true,
        selectedMessageId: null,
        apiErrors: [],

        // Helper function to ensure we always have a current session
        ensureCurrentSession: () => {
          const state = get()
          if (!state.currentSession && state.sessions.length > 0) {
            // Set the most recently updated session as current
            const mostRecentSession = [...state.sessions].sort((a, b) => 
              b.updatedAt.getTime() - a.updatedAt.getTime()
            )[0]
            set({ currentSession: mostRecentSession })
          }
        },

        // Error management methods
        addAPIError: (error: APIError) => {
          set((state) => ({
            apiErrors: [...state.apiErrors, error]
          }));
          console.log(`🚨 API Error logged: ${error.provider} ${error.operation} (attempt ${error.attempt}/${error.maxAttempts})`);
        },

        clearAPIErrors: () => {
          set({ apiErrors: [] });
          console.log('🧹 API errors cleared');
        },

        getSessionErrors: (sessionId: string) => {
          return get().apiErrors.filter(error => error.sessionId === sessionId);
        },

        getErrorStats: () => {
          const errors = get().apiErrors;
          const byProvider: Record<string, number> = {};
          const bySession: Record<string, number> = {};
          
          errors.forEach(error => {
            byProvider[error.provider] = (byProvider[error.provider] || 0) + 1;
            if (error.sessionId) {
              bySession[error.sessionId] = (bySession[error.sessionId] || 0) + 1;
            }
          });

          // Get recent errors (last 24 hours)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const recent = errors.filter(error => error.timestamp > oneDayAgo);

          return {
            total: errors.length,
            byProvider,
            bySession,
            recent
          };
        },

        // Session actions
        createSession: (name: string, description?: string, template?: any, participants?: any[]) => {
          const sessionId = crypto.randomUUID()
          
          // Determine initial participants
          let initialParticipants: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'>[] = []
          
          if (participants) {
            initialParticipants = participants
          } else if (template?.participants) {
            initialParticipants = template.participants
          } else if (template?.template && template.template !== 'blank') {
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
                welcome: template?.initialPrompt || "Welcome to The Academy. Let's explore together.",
                intervention: "Let me guide our discussion toward deeper insights.",
                conclusion: "Thank you for this enlightening dialogue."
              }
            },
            analysisHistory: [],
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
              newCurrentSession = remainingSessions.length > 0 ? 
                [...remainingSessions].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] : 
                null
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
              analysisHistory: [], // Clear analysis history when clearing messages
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

        // Analysis actions - COMPLETELY FIXED
        addAnalysisSnapshot: (analysisData) => {
          const snapshot: AnalysisSnapshot = {
            ...analysisData,
            id: crypto.randomUUID(),
            timestamp: new Date()
          }

          set((state) => {
            if (!state.currentSession) {
              console.warn('⚠️ No current session to add analysis snapshot to')
              return state
            }

            // Ensure analysisHistory exists
            const currentAnalysisHistory = state.currentSession.analysisHistory || []
            
            // Create updated session with new snapshot
            const updatedSession = {
              ...state.currentSession,
              analysisHistory: [...currentAnalysisHistory, snapshot],
              updatedAt: new Date()
            }

            console.log(`📊 Added analysis snapshot to session ${state.currentSession.id}. Total snapshots: ${updatedSession.analysisHistory.length}`)

            // Update both currentSession and the corresponding session in sessions array
            const updatedSessions = state.sessions.map(session =>
              session.id === state.currentSession!.id ? updatedSession : session
            )

            // Force a complete state update to ensure reactivity
            return {
              ...state,
              currentSession: updatedSession,
              sessions: updatedSessions
            }
          })
        },

        getAnalysisHistory: (sessionId?: string) => {
          const state = get()
          
          if (sessionId) {
            // Get analysis history for a specific session
            const targetSession = state.sessions.find(s => s.id === sessionId)
            const history = targetSession?.analysisHistory || []
            console.log(`📊 Retrieved ${history.length} analysis snapshots for session ${sessionId}`)
            return history
          } else if (state.currentSession) {
            // Get analysis history for current session
            const history = state.currentSession.analysisHistory || []
            console.log(`📊 Retrieved ${history.length} analysis snapshots for current session ${state.currentSession.id}`)
            return history
          }
          
          console.log('📊 No session found for analysis history retrieval')
          return []
        },

        clearAnalysisHistory: (sessionId?: string) => {
          const targetSessionId = sessionId || get().currentSession?.id
          if (!targetSessionId) return

          get().updateSession(targetSessionId, { analysisHistory: [] })
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

        // Hydration action
        setHasHydrated: (state: boolean) => {
          set({ hasHydrated: state })
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
          const sessionErrors = get().getSessionErrors(sessionId);
          return {
            ...session,
            errors: sessionErrors, 
            exportedAt: new Date(),
            exportVersion: '1.1'
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
          
          // Import errors if they exist
          if (sessionData.errors && Array.isArray(sessionData.errors)) {
            sessionData.errors.forEach((error: APIError) => {
              get().addAPIError({
                ...error,
                sessionId: sessionId // Update to new session ID
              });
            });
          }

          // Add analysis history if it exists
          if (sessionData.analysisHistory) {
            sessionData.analysisHistory.forEach((analysis: any) => {
              get().addAnalysisSnapshot({
                messageCountAtAnalysis: analysis.messageCountAtAnalysis,
                participantCountAtAnalysis: analysis.participantCountAtAnalysis,
                provider: analysis.provider,
                conversationPhase: analysis.conversationPhase,
                analysis: analysis.analysis,
                conversationContext: analysis.conversationContext
              })
            })
          }
          
          return sessionId
        }
      }),
      {
        name: 'academy-chat-store',
        // Only persist sessions, not UI state
        partialize: (state) => ({ 
          sessions: state.sessions,
          currentSession: state.currentSession,
          apiErrors: state.apiErrors.slice(-50)
        }),
        // Rehydrate dates correctly and ensure current session
        onRehydrateStorage: () => (state) => {
          if (state) {
            console.log(`🔄 Rehydrating store with ${state.sessions.length} sessions`)
            
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
              })),
              analysisHistory: (session.analysisHistory || []).map(analysis => ({
                ...analysis,
                timestamp: new Date(analysis.timestamp)
              }))
            }))

            if (state.apiErrors) {
              state.apiErrors = state.apiErrors.map(error => ({
                ...error,
                timestamp: new Date(error.timestamp)
              }))
              console.log(`🚨 Rehydrated ${state.apiErrors.length} API errors`)
            }
            
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
                })),
                analysisHistory: (state.currentSession.analysisHistory || []).map(analysis => ({
                  ...analysis,
                  timestamp: new Date(analysis.timestamp)
                }))
              }
              
              console.log(`📊 Rehydrated current session with ${state.currentSession.analysisHistory?.length || 0} analysis snapshots`)
            }

            // Ensure we have a current session if we have any sessions
            if (!state.currentSession && state.sessions.length > 0) {
              const mostRecentSession = [...state.sessions].sort((a, b) => 
                b.updatedAt.getTime() - a.updatedAt.getTime()
              )[0]
              state.currentSession = mostRecentSession
              console.log(`🔄 Set current session to most recent: ${mostRecentSession.name}`)
            }

            // Mark as hydrated
            state.hasHydrated = true
          }
          // Even if there's no stored state (first time user), mark as hydrated
          return (state: ChatState | undefined) => {
            if (state) {
              state.hasHydrated = true
              console.log('🔄 Store hydration complete')
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