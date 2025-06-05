// src/components/Sessions/SessionsSection.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  Plus, MoreVertical, Edit3, Trash2, Copy, MessageSquare, 
  Users, Clock, Sparkles, Brain, BookOpen, Search,
  ChevronDown, Star, Archive, Coffee, Zap
} from 'lucide-react'

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

export function SessionsSection() {
  const { 
    currentSession, 
    sessions, 
    createSession, 
    setCurrentSession, 
    deleteSession,
    updateSession
  } = useChatStore()
  
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  const dropdownRef = useRef<HTMLDivElement>(null)
  const templatesRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSelectedSessionId(null)
      }
      if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCreateFromTemplate = (template: any) => {
    const sessionId = createSession(template.name, template.description, {
      initialPrompt: template.prompt,
      template: template.id
    }, template.participants) // Pass participants from template
    
    setShowTemplates(false)
    
    // Auto-fill the moderator input with the template prompt
    if (template.prompt) {
      // This could be handled by passing the prompt to the parent component
      // For now, the prompt is stored in the session metadata
    }
  }

  const handleQuickCreate = () => {
    const sessionNumber = sessions.length + 1
    createSession(
      `Session ${sessionNumber}`,
      "New research dialogue",
      { template: 'blank' }
    )
  }

  const handleSessionClick = (session: any) => {
    if (editingSessionId === session.id) return
    setCurrentSession(session)
  }

  const handleStartEdit = (session: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingName(session.name)
    setSelectedSessionId(null)
  }

  const handleSaveEdit = () => {
    if (editingSessionId && editingName.trim()) {
      updateSession(editingSessionId, { name: editingName.trim() })
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

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (sessions.length <= 1) {
      alert("You must have at least one session")
      return
    }
    if (confirm('Are you sure you want to delete this session?')) {
      deleteSession(sessionId)
    }
    setSelectedSessionId(null)
  }

  const handleDuplicateSession = (session: any, e: React.MouseEvent) => {
    e.stopPropagation()
    createSession(
      `${session.name} (Copy)`,
      session.description,
      { 
        template: 'duplicate',
        participants: session.participants.map((p: any) => ({ 
          ...p, 
          id: undefined, 
          joinedAt: undefined, 
          messageCount: 0 
        }))
      }
    )
    setSelectedSessionId(null)
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

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900 dark:text-gray-100">Sessions</h2>
          <div className="flex items-center gap-1">
            <div className="relative" ref={templatesRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates(!showTemplates)}
                className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
              </Button>
              
              {/* Templates Dropdown */}
              {showTemplates && (
                <div className="absolute right-0 top-10 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3">
                  <div className="mb-3">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Session Templates</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pre-configured with Claude & GPT participants</p>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {SESSION_TEMPLATES.map((template) => {
                      const IconComponent = template.icon
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleCreateFromTemplate(template)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
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
                  
                  <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3">
                    <button
                      onClick={handleQuickCreate}
                      className="w-full text-left p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          <Plus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">Blank Session</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Start from scratch</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleQuickCreate}
              className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              <Plus className="h-4 w-4" />
            </Button>
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
              const isActive = currentSession?.id === session.id
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
                            className="w-full px-2 py-1 text-sm font-medium bg-white dark:bg-gray-700 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                              {session.messages.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {session.participants.length}
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
                        {sessions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Delete session"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        
                        {/* More Options Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSessionId(selectedSessionId === session.id ? null : session.id)
                            }}
                            className="h-7 w-7 p-0 hover:bg-gray-200 dark:hover:bg-gray-600"
                          >
                            <MoreVertical className="h-3 w-3" />
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
    </div>
  )
}