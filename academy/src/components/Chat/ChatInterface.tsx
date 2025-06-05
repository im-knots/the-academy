// src/components/Chat/ChatInterface.tsx
'use client'

import { useState } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AddParticipant } from '@/components/Participants/AddParticipant'
import { Brain, Users, Settings, Play, Pause, Plus, Sparkles, MessageSquare, Zap, Send, Hand } from 'lucide-react'

export function ChatInterface() {
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [moderatorInput, setModeratorInput] = useState('')
  const [isInterjecting, setIsInterjecting] = useState(false)
  
  const { 
    currentSession, 
    isSessionPaused, 
    showParticipantPanel, 
    showModeratorPanel,
    pauseSession,
    resumeSession,
    toggleParticipantPanel,
    toggleModeratorPanel,
    addMessage,
    injectPrompt
  } = useChatStore()

  const hasMessages = currentSession?.messages && currentSession.messages.length > 0
  const hasParticipants = currentSession?.participants && currentSession.participants.length > 0

  const handleSendOpeningPrompt = () => {
    if (!moderatorInput.trim() || !hasParticipants) return
    
    addMessage({
      content: moderatorInput.trim(),
      participantId: 'moderator',
      participantName: 'Debate Moderator',
      participantType: 'moderator'
    })
    
    setModeratorInput('')
    // Auto-resume if paused
    if (isSessionPaused) {
      resumeSession()
    }
  }

  const handleInterject = () => {
    if (isInterjecting) {
      // Send the interjection
      if (moderatorInput.trim()) {
        injectPrompt(moderatorInput.trim())
        setModeratorInput('')
      }
      setIsInterjecting(false)
      resumeSession()
    } else {
      // Start interjecting
      pauseSession()
      setIsInterjecting(true)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasMessages) {
        handleInterject()
      } else {
        handleSendOpeningPrompt()
      }
    }
  }

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
                  className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
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
                    <p className="text-xs text-gray-500 dark:text-gray-500">Add AI agents to begin</p>
                  </div>
                ) : (
                  currentSession.participants.map((participant) => (
                    <div key={participant.id} className="group relative">
                      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
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
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {participant.messageCount} messages • {participant.type.toUpperCase()}
                          </p>
                        </div>
                      </div>
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
                  Ready to Explore Consciousness
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {hasParticipants 
                    ? "Send an opening prompt below to begin the AI-to-AI conversation."
                    : "Add AI participants and then send an opening prompt to begin the dialogue."
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
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-6 space-y-6">
              {currentSession.messages.map((message, index) => (
                <div key={message.id} className="message-appear">
                  <div className="flex gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
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
              ))}
            </div>
          )}
        </div>

        {/* Moderator Input Area */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="w-full max-w-6xl mx-auto">
            {isInterjecting && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Hand className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Conversation paused for moderation. Send your interjection below.
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <div className="flex-1">
                <textarea
                  value={moderatorInput}
                  onChange={(e) => setModeratorInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={
                    !hasParticipants 
                      ? "Add participants first..."
                      : hasMessages 
                        ? (isInterjecting ? "Enter your interjection..." : "Interject with guidance...")
                        : "Enter an opening prompt to begin the AI conversation..."
                  }
                  disabled={!hasParticipants}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[60px] max-h-[200px]"
                  rows={3}
                />
              </div>
              
              <div className="flex flex-col gap-2 flex-shrink-0">
                {hasMessages ? (
                  <Button
                    onClick={handleInterject}
                    disabled={!hasParticipants || (!moderatorInput.trim() && isInterjecting)}
                    variant={isInterjecting ? "default" : "outline"}
                    className="min-h-[60px] px-6"
                  >
                    {isInterjecting ? (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        Send
                      </>
                    ) : (
                      <>
                        <Hand className="h-5 w-5 mr-2" />
                        Interject
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendOpeningPrompt}
                    disabled={!hasParticipants || !moderatorInput.trim()}
                    className="min-h-[60px] px-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  >
                    <Send className="h-5 w-5 mr-2" />
                    Begin
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {hasMessages ? "Press Enter to interject, Shift+Enter for new line" : "Press Enter to begin conversation, Shift+Enter for new line"}
              </span>
              <span>
                {moderatorInput.length} characters
              </span>
            </div>
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
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Mode:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      {isInterjecting ? 'Interjecting' : isSessionPaused ? 'Paused' : 'Active'}
                    </span>
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
                    onClick={() => setIsInterjecting(true)}
                    disabled={!hasMessages || isInterjecting}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Quick Interject
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