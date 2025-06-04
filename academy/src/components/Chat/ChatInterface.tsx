// src/components/Chat/ChatInterface.tsx
'use client'

import { useState } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AddParticipant } from '@/components/Participants/AddParticipant'
import { Brain, Users, Settings, Play, Pause, Plus, Sparkles, MessageSquare, Zap, MoreVertical, Trash2 } from 'lucide-react'

export function ChatInterface() {
  const { 
    currentSession, 
    isSessionPaused, 
    showParticipantPanel, 
    showModeratorPanel,
    pauseSession,
    resumeSession,
    toggleParticipantPanel,
    toggleModeratorPanel,
    removeParticipant
  } = useChatStore()

  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null)

  if (!currentSession) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full opacity-20 animate-pulse"></div>
            </div>
            <Brain className="relative h-16 w-16 mx-auto text-gray-700 dark:text-gray-300" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">The Academy</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Initializing consciousness research platform...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      {showParticipantPanel && (
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Consciousness Research</p>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{currentSession.name}</span>
                <Badge variant={currentSession.status === 'active' ? 'active' : 'outline'} className="text-xs">
                  {currentSession.status}
                </Badge>
              </div>
              {currentSession.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {currentSession.description}
                </p>
              )}
            </div>
          </div>

          {/* Participants */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium text-gray-900 dark:text-gray-100">Participants</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddParticipant(true)}
                  className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-3">
                {currentSession.participants.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">No participants yet</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">Add AI agents to begin exploring consciousness</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddParticipant(true)}
                      className="mt-3"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Agent
                    </Button>
                  </div>
                ) : (
                  currentSession.participants.map((participant) => (
                    <div key={participant.id} className="group relative">
                      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          participant.color ? `bg-gradient-to-br ${participant.color}` :
                          participant.type === 'claude' 
                            ? 'bg-gradient-to-br from-orange-400 to-red-500' 
                            : participant.type === 'gpt'
                            ? 'bg-gradient-to-br from-green-400 to-teal-500'
                            : 'bg-gradient-to-br from-blue-400 to-purple-500'
                        }`}>
                          <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {participant.name}
                            </p>
                            <Badge variant={participant.status} className="text-xs">
                              {participant.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {participant.messageCount} messages • {participant.type.toUpperCase()}
                            </p>
                          </div>
                          {participant.characteristics && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                              {participant.characteristics.personality}
                            </p>
                          )}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedParticipant(
                                expandedParticipant === participant.id ? null : participant.id
                              )}
                              className="h-6 w-6 rounded-full"
                            >
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeParticipant(participant.id)}
                              className="h-6 w-6 rounded-full hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedParticipant === participant.id && (
                        <div className="ml-13 mt-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-xs space-y-2">
                          {participant.characteristics && (
                            <>
                              <div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">Focus: </span>
                                <span className="text-gray-600 dark:text-gray-400">{participant.characteristics.focus}</span>
                              </div>
                              {participant.characteristics.expertise && (
                                <div>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">Expertise: </span>
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {participant.characteristics.expertise.join(', ')}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          <div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">Temperature: </span>
                            <span className="text-gray-600 dark:text-gray-400">{participant.settings.temperature}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-900 dark:text-gray-100">Max Tokens: </span>
                            <span className="text-gray-600 dark:text-gray-400">{participant.settings.maxTokens}</span>
                          </div>
                          {participant.settings.responseDelay && (
                            <div>
                              <span className="font-medium text-gray-900 dark:text-gray-100">Response Delay: </span>
                              <span className="text-gray-600 dark:text-gray-400">{participant.settings.responseDelay}ms</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <Button
                variant={isSessionPaused ? "default" : "outline"}
                size="sm"
                onClick={isSessionPaused ? resumeSession : pauseSession}
                className="flex-1"
                disabled={currentSession.participants.length === 0}
              >
                {isSessionPaused ? (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleModeratorPanel}
                className={showModeratorPanel ? 'bg-gray-100 dark:bg-gray-700' : ''}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
            {currentSession.participants.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                Add participants to enable conversation controls
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {!showParticipantPanel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleParticipantPanel}
                >
                  <Users className="h-4 w-4" />
                </Button>
              )}
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">{currentSession.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentSession.participants.length} participants • {currentSession.messages.length} messages
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant={currentSession.status === 'active' ? 'active' : 'outline'}>
                {currentSession.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto">
          {currentSession.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="relative mb-8">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full animate-pulse"></div>
                  </div>
                  <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Brain className="h-8 w-8 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  {currentSession.participants.length === 0 ? 'Ready to Explore Consciousness' : 'Dialogue Ready to Begin'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {currentSession.participants.length === 0 
                    ? 'Add AI participants and watch them engage in autonomous dialogue about consciousness, meaning, and existence.'
                    : 'Your AI agents are configured and ready. Start the conversation to watch them explore ideas together.'
                  }
                </p>
                <div className="flex justify-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Dialogue</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Research</span>
                  </div>
                </div>
                {currentSession.participants.length === 0 && (
                  <Button
                    onClick={() => setShowAddParticipant(true)}
                    className="mt-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Agent
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-6 space-y-6">
              {currentSession.messages.map((message, index) => {
                const participant = currentSession.participants.find(p => p.id === message.participantId)
                return (
                  <div key={message.id} className="message-appear">
                    <div className="flex gap-4">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        participant?.color ? `bg-gradient-to-br ${participant.color}` :
                        message.participantType === 'claude' 
                          ? 'bg-gradient-to-br from-orange-400 to-red-500' 
                          : message.participantType === 'gpt'
                          ? 'bg-gradient-to-br from-green-400 to-teal-500'
                          : message.participantType === 'moderator'
                          ? 'bg-gradient-to-br from-purple-400 to-purple-600'
                          : 'bg-gradient-to-br from-blue-400 to-purple-500'
                      }`}>
                        {message.participantType === 'moderator' ? (
                          <Settings className="h-5 w-5 text-white" />
                        ) : (
                          <Sparkles className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {message.participantName}
                          </span>
                          <Badge variant={message.participantType} className="text-xs">
                            {message.participantType}
                          </Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="prose prose-gray dark:prose-invert max-w-none">
                          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-900 dark:text-gray-100 leading-relaxed m-0">
                              {message.content}
                            </p>
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

        {/* Input Area */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="max-w-4xl mx-auto">
            {currentSession.participants.length >= 2 ? (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 text-center border border-blue-200 dark:border-blue-700">
                <p className="text-blue-900 dark:text-blue-100 text-sm font-medium">
                  🤖 Ready for AI-to-AI Conversation
                </p>
                <p className="text-blue-700 dark:text-blue-300 text-xs mt-1">
                  Start the session to watch your agents explore consciousness together
                </p>
                <Button
                  size="sm"
                  className="mt-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  disabled={currentSession.status !== 'active'}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Initiate Dialogue
                </Button>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Add at least 2 participants to enable AI-to-AI dialogue
                </p>
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                  Watch artificial minds explore consciousness together
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Moderator Panel */}
      {showModeratorPanel && (
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Research Center</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor and analyze consciousness patterns</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-700">
              <CardContent className="p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Session Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Status:</span>
                    <Badge variant={currentSession.status === 'active' ? 'active' : 'outline'} className="text-xs">
                      {currentSession.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Messages:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">{currentSession.messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Agents:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">{currentSession.participants.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-700">
              <CardContent className="p-4">
                <h3 className="font-medium text-purple-900 dark:text-purple-100 mb-3">Research Notes</h3>
                <div className="text-sm text-purple-700 dark:text-purple-300">
                  <p className="leading-relaxed">Consciousness analysis and pattern detection tools are being developed...</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    disabled
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Inject Prompt
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    disabled
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Export Analysis
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Add Participant Modal */}
      <AddParticipant 
        isOpen={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
      />
    </div>
  )
}