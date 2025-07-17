// src/components/Sessions/SessionsSection.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  Plus, MoreVertical, Edit3, Trash2, Copy, MessageSquare, 
  Users, Clock, Sparkles, Brain, BookOpen, Search,
  ChevronDown, Star, Archive, Coffee, Zap, Loader2
} from 'lucide-react'
import { DeleteConfirmationModal } from './DeleteConfirmationModal'
import type { ChatSession } from '@/types/chat'

interface SessionsSectionProps {
  currentSessionId?: string | null
  onSessionChange?: (sessionId: string) => void
}

const SESSION_TEMPLATES = [
  {
    id: 'consciousness',
    name: 'Consciousness Exploration',
    description: 'Deep dive with Claude & GPT on consciousness and self-awareness',
    icon: Brain,
    color: 'from-purple-500 to-blue-600',
    prompt: 'Let\'s explore the fundamental question: What does it mean to be conscious? I\'d like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.',
    participants: [
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
  },
  {
    id: 'creativity',
    name: 'Creative Problem Solving',
    description: 'Collaborative creativity exploration with Claude & GPT',
    icon: Sparkles,
    color: 'from-pink-500 to-orange-500',
    prompt: 'How do you approach creative problem-solving? Let\'s discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.',
    participants: [
      {
        name: 'Claude',
        type: 'claude' as const,
        status: 'idle' as const,
        settings: {
          temperature: 0.8,
          maxTokens: 1500,
          model: 'claude-3-5-sonnet-20241022',
          responseDelay: 3000
        },
        characteristics: {
          personality: 'Creative and imaginative, loves exploring novel connections',
          expertise: ['Creativity', 'Arts', 'Innovation']
        }
      },
      {
        name: 'GPT',
        type: 'gpt' as const,
        status: 'idle' as const,
        settings: {
          temperature: 0.8,
          maxTokens: 1500,
          model: 'gpt-4o',
          responseDelay: 3000
        },
        characteristics: {
          personality: 'Inventive and experimental, enjoys brainstorming',
          expertise: ['Problem solving', 'Design thinking', 'Innovation']
        }
      }
    ]
  },
  {
    id: 'philosophy',
    name: 'Philosophical Inquiry',
    description: 'Socratic dialogue with Claude & GPT on fundamental questions',
    icon: BookOpen,
    color: 'from-emerald-500 to-teal-600',
    prompt: 'What makes a life meaningful? Let\'s engage in philosophical inquiry about purpose, meaning, ethics, and the good life.',
    participants: [
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
          personality: 'Philosophical and contemplative, seeks deeper truths',
          expertise: ['Philosophy', 'Ethics', 'Metaphysics']
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
          personality: 'Socratic and questioning, challenges assumptions',
          expertise: ['Logic', 'Moral philosophy', 'Critical thinking']
        }
      }
    ]
  },
  {
    id: 'future',
    name: 'Future of AI',
    description: 'Claude & GPT discuss AI development and societal impact',
    icon: Zap,
    color: 'from-blue-500 to-cyan-500',
    prompt: 'How do you envision the future relationship between AI and humanity? Let\'s explore potential developments, challenges, and opportunities.',
    participants: [
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
          personality: 'Thoughtful about AI safety and beneficial development',
          expertise: ['AI ethics', 'Technology', 'Society']
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
          personality: 'Optimistic about technological progress and human collaboration',
          expertise: ['Technology trends', 'Innovation', 'Human-AI interaction']
        }
      }
    ]
  },
  {
    id: 'casual',
    name: 'Casual Conversation',
    description: 'Open-ended dialogue between Claude & GPT',
    icon: Coffee,
    color: 'from-amber-500 to-yellow-500',
    prompt: 'Let\'s have an open conversation. What\'s something that\'s been on your mind lately that you\'d like to explore together?',
    participants: [
      {
        name: 'Claude',
        type: 'claude' as const,
        status: 'idle' as const,
        settings: {
          temperature: 0.8,
          maxTokens: 1200,
          model: 'claude-3-5-sonnet-20241022',
          responseDelay: 3000
        },
        characteristics: {
          personality: 'Friendly and curious, enjoys natural conversation',
          expertise: ['General conversation', 'Curiosity', 'Empathy']
        }
      },
      {
        name: 'GPT',
        type: 'gpt' as const,
        status: 'idle' as const,
        settings: {
          temperature: 0.8,
          maxTokens: 1200,
          model: 'gpt-4o',
          responseDelay: 3000
        },
        characteristics: {
          personality: 'Engaging and thoughtful, brings diverse perspectives',
          expertise: ['General knowledge', 'Storytelling', 'Discussion']
        }
      }
    ]
  }
]

export function SessionsSection({ currentSessionId, onSessionChange }: SessionsSectionProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    sessionId: string | null
    sessionName: string
  }>({
    isOpen: false,
    sessionId: null,
    sessionName: ''
  })
  
  const dropdownRef = useRef<HTMLDivElement>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)

  // EVENT-DRIVEN: Fetch sessions function
  const fetchSessions = useCallback(async () => {
    try {
      const result = await mcpClient.current.callTool('get_sessions', {})
      if (result.success && result.sessions) {
        setSessions(result.sessions.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt)
        })))
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // EVENT-DRIVEN: Handle session events via internal pub/sub
  const handleSessionEvent = useCallback(async (payload: any) => {
    console.log('📋 SessionsSection: Session event received:', payload.data)
    
    // Refresh sessions list for any session-related event
    await fetchSessions()
  }, [fetchSessions])

  // EVENT-DRIVEN: Handle session switch events
  const handleSessionSwitchEvent = useCallback(async (payload: any) => {
    console.log('📋 SessionsSection: Session switch event received:', payload.data)
    
    // If parent component needs to be notified of the switch
    if (payload.data.sessionId && onSessionChange) {
      onSessionChange(payload.data.sessionId)
    }
  }, [onSessionChange])

  // EVENT-DRIVEN: Subscribe to all relevant events via internal pub/sub
  useEffect(() => {
    console.log('📋 SessionsSection: Setting up internal pub/sub event subscriptions')

    // Initial fetch
    fetchSessions()

    // Session events
    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, handleSessionEvent)
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionEvent)
    const unsubscribeSessionDeleted = eventBus.subscribe(EVENT_TYPES.SESSION_DELETED, handleSessionEvent)
    const unsubscribeSessionDuplicated = eventBus.subscribe(EVENT_TYPES.SESSION_DUPLICATED, handleSessionEvent)
    const unsubscribeSessionImported = eventBus.subscribe(EVENT_TYPES.SESSION_IMPORTED, handleSessionEvent)
    const unsubscribeSessionsListChanged = eventBus.subscribe(EVENT_TYPES.SESSIONS_LIST_CHANGED, handleSessionEvent)
    
    // Session switch events
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionSwitchEvent)

    return () => {
      console.log('📋 SessionsSection: Cleaning up internal pub/sub event subscriptions')
      unsubscribeSessionCreated()
      unsubscribeSessionUpdated()
      unsubscribeSessionDeleted()
      unsubscribeSessionDuplicated()
      unsubscribeSessionImported()
      unsubscribeSessionsListChanged()
      unsubscribeSessionSwitched()
    }
  }, [fetchSessions, handleSessionEvent, handleSessionSwitchEvent])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSelectedSessionId(null)
      }
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateFromTemplate = async (template: any) => {
    try {
      setIsCreating(true)
      // This will automatically emit events via internal pub/sub system
      const result = await mcpClient.current.createSessionViaMCP(
        template.name, 
        template.description,
        template.id,
        template.participants
      )
      
      if (result.success && result.sessionId) {
        setShowCreateMenu(false)
        if (onSessionChange) {
          onSessionChange(result.sessionId)
        }
        
        // Store the template prompt in session metadata if needed
        if (template.prompt) {
          // This will also automatically emit events
          await mcpClient.current.updateSessionViaMCP(
            result.sessionId,
            undefined,
            undefined,
            { initialPrompt: template.prompt }
          )
        }
      }
    } catch (error) {
      console.error('Failed to create session from template:', error)
      alert('Failed to create session. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateBlankSession = async () => {
    try {
      setIsCreating(true)
      const sessionNumber = sessions.length + 1
      // This will automatically emit events via internal pub/sub system
      const result = await mcpClient.current.createSessionViaMCP(
        `Session ${sessionNumber}`,
        "New research dialogue",
        'blank'
      )
      
      if (result.success && result.sessionId) {
        setShowCreateMenu(false)
        if (onSessionChange) {
          onSessionChange(result.sessionId)
        }
      }
    } catch (error) {
      console.error('Failed to create blank session:', error)
      alert('Failed to create session. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSessionClick = async (session: ChatSession) => {
    if (editingSessionId === session.id) return
    
    if (onSessionChange) {
      onSessionChange(session.id)
    }
  }

  const handleStartEdit = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingName(session.name)
    setSelectedSessionId(null)
  }

  const handleSaveEdit = async () => {
    if (editingSessionId && editingName.trim()) {
      try {
        setIsUpdating(true)
        // This will automatically emit events via internal pub/sub system
        await mcpClient.current.updateSessionViaMCP(
          editingSessionId,
          editingName.trim()
        )
      } catch (error) {
        console.error('Failed to update session:', error)
        alert('Failed to update session name.')
      } finally {
        setIsUpdating(false)
      }
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setEditingSessionId(null)
      setEditingName('')
    }
  }

  const handleDeleteSession = (sessionId: string, sessionName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteModal({
      isOpen: true,
      sessionId,
      sessionName
    })
    setSelectedSessionId(null)
  }

  const confirmDeleteSession = async () => {
    if (deleteModal.sessionId) {
      try {
        // This will automatically emit events via internal pub/sub system
        await mcpClient.current.deleteSessionViaMCP(deleteModal.sessionId)
        
        // If deleting current session, notify parent
        if (deleteModal.sessionId === currentSessionId && onSessionChange) {
          const remainingSessions = sessions.filter(s => s.id !== deleteModal.sessionId)
          if (remainingSessions.length > 0) {
            onSessionChange(remainingSessions[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
        alert('Failed to delete session. Please try again.')
      }
    }
    setDeleteModal({
      isOpen: false,
      sessionId: null,
      sessionName: ''
    })
  }

  const handleDuplicateSession = async (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      setIsCreating(true)
      // This will automatically emit events via internal pub/sub system
      const result = await mcpClient.current.duplicateSessionViaMCP(
        session.id,
        `${session.name} (Copy)`,
        false // Don't include messages
      )
      
      if (!result.success) {
        throw new Error('Failed to duplicate session')
      }
    } catch (error) {
      console.error('Failed to duplicate session:', error)
      alert('Failed to duplicate session. Please try again.')
    } finally {
      setIsCreating(false)
      setSelectedSessionId(null)
    }
  }

  const filteredSessions = sessions.filter(session =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 dark:text-green-400'
      case 'paused': return 'text-yellow-600 dark:text-yellow-400'
      case 'completed': return 'text-blue-600 dark:text-blue-400'
      case 'error': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900 dark:text-gray-100">Sessions</h2>
          
          {/* Single Create Button with Dropdown */}
          <div className="relative" ref={createMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              disabled={isCreating}
              className="h-8 px-3 rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/20 dark:hover:bg-blue-800/30 text-blue-700 dark:text-blue-300"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              New
              <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showCreateMenu ? 'rotate-180' : ''}`} />
            </Button>
            
            {/* Create Session Menu */}
            {showCreateMenu && (
                <div className="absolute right-0 top-10 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3 transform -translate-x-2">                <div className="mb-3">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Create New Session</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Choose a template or start from scratch</p>
                </div>
                
                {/* Blank Session Option */}
                <div className="mb-3">
                  <button
                    onClick={handleCreateBlankSession}
                    disabled={isCreating}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group border-2 border-dashed border-gray-200 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                        <Plus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          Blank Session
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Start from scratch with no pre-configured participants
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
                
                {/* Templates Section */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-1">Templates</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {SESSION_TEMPLATES.map((template) => {
                      const IconComponent = template.icon
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleCreateFromTemplate(template)}
                          disabled={isCreating}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 bg-gradient-to-r ${template.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                              <IconComponent className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-gray-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {template.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                {template.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        {sessions.length > 3 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {searchQuery ? 'No sessions found' : 'No sessions yet'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {searchQuery ? 'Try a different search term' : 'Create your first session above'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((session) => {
              const isActive = currentSessionId === session.id
              const isEditing = editingSessionId === session.id
              
              return (
                <div key={session.id} className="relative group">
                  <div
                    onClick={() => handleSessionClick(session)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={handleKeyPress}
                            disabled={isUpdating}
                            className="w-full px-2 py-1 text-sm font-medium bg-white dark:bg-gray-700 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <h3 className={`font-medium text-sm truncate mb-1 ${
                            isActive ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {session.name}
                          </h3>
                        )}
                        
                        <div className="flex items-center gap-3 mb-1">
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {session.messages?.length || 0}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {session.participants?.length || 0}
                            </span>
                          </div>
                          <div className={`text-xs ${getStatusColor(session.status)}`}>
                            {session.status}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatRelativeTime(session.updatedAt)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Direct Delete Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteSession(session.id, session.name, e)}
                          className="h-10 w-10 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Delete session"
                        >
                          <Trash2 className="h-6 w-6" />
                        </Button>
                        
                        {/* More Options Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSessionId(selectedSessionId === session.id ? null : session.id)
                            }}
                            className="h-10 w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <MoreVertical className="h-6 w-6" />
                          </Button>
                          
                          {selectedSessionId === session.id && (
                            <div className="absolute right-0 top-8 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                              <button
                                onClick={(e) => handleStartEdit(session, e)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                <Edit3 className="h-4 w-4" />
                                Rename
                              </button>
                              <button
                                onClick={(e) => handleDuplicateSession(session, e)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                <Copy className="h-4 w-4" />
                                Duplicate
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, sessionId: null, sessionName: '' })}
        onConfirm={confirmDeleteSession}
        sessionName={deleteModal.sessionName}
        isLastSession={sessions.length <= 1}
      />
    </div>
  )
}