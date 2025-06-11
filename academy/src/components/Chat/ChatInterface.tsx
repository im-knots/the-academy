// src/components/Chat/ChatInterface.tsx - Updated with Prompt Customization
'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { useTemplatePrompt } from '@/hooks/useTemplatePrompt'
import { useMCP } from '@/hooks/useMCP'
import { MCPConversationManager } from '@/lib/ai/mcp-conversation-manager'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { AddParticipant } from '@/components/Participants/AddParticipant'
import { ExportModal } from '@/components/Export/ExportModal'
import { MCPModal } from '@/components/MCP/MCPModal'
import { PromptCustomizer } from '@/components/Prompts/PromptCustomizer'
import { LiveSummary } from '@/components/Research/LiveSummary'
import { SessionsSection } from '@/components/Sessions/SessionsSection'
import { 
  Brain, Users, Settings, Play, Pause, Plus, Sparkles, MessageSquare, 
  Zap, Send, Hand, Square, AlertCircle, Clock, CheckCircle2, Loader2,
  Download, FileDown, ChevronLeft, History, FileText,
  Wifi, WifiOff, Terminal, Monitor
} from 'lucide-react'

export function ChatInterface() {
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showMCPModal, setShowMCPModal] = useState(false)
  const [showPromptCustomizer, setShowPromptCustomizer] = useState(false)
  const [moderatorInput, setModeratorInput] = useState('')
  const [isInterjecting, setIsInterjecting] = useState(false)
  const [conversationState, setConversationState] = useState<'idle' | 'starting' | 'running' | 'pausing' | 'stopping'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [wasRunningBeforeInterjection, setWasRunningBeforeInterjection] = useState(false)
  
  // Combined left panel state
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  
  // Template prompt hook
  const { suggestedPrompt, clearSuggestedPrompt } = useTemplatePrompt()
  
  // MCP integration
  const mcp = useMCP()
  
  const { 
    currentSession, 
    isSessionPaused, 
    showModeratorPanel,
    pauseSession,
    resumeSession,
    endSession,
    toggleModeratorPanel,
    addMessage,
    injectPrompt
  } = useChatStore()

  const hasMessages = currentSession?.messages && currentSession.messages.length > 0
  const hasParticipants = currentSession?.participants && currentSession.participants.length > 0
  const hasAIParticipants = (currentSession?.participants || []).filter(p => p.type !== 'human' && p.type !== 'moderator').length >= 2

  // Get the conversation manager instance
  const conversationManager = MCPConversationManager.getInstance()

  // Auto-populate moderator input from template prompt
  const messageCount = currentSession?.messages?.length || 0
  useEffect(() => {
    if (suggestedPrompt && messageCount === 0) {
      setModeratorInput(suggestedPrompt)
    }
  }, [suggestedPrompt, messageCount])

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleStartConversation = async () => {
    if (!currentSession || !hasAIParticipants || !moderatorInput.trim()) return
    
    try {
      setConversationState('starting')
      setError(null)
      
      // Start the AI-to-AI conversation using the client-side manager
      await conversationManager.startConversation(currentSession.id, moderatorInput.trim())
      
      setModeratorInput('')
      setConversationState('running')
      
      // Update session status to active
      resumeSession()
      
    } catch (error) {
      console.error('Failed to start conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to start conversation')
      setConversationState('idle')
    }
  }

  const handlePauseConversation = async () => {
    if (!currentSession) return
    
    try {
      setConversationState('pausing')
      setError(null)
      
      conversationManager.pauseConversation(currentSession.id)
      pauseSession()
      setConversationState('idle')
      
    } catch (error) {
      console.error('Failed to pause conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to pause conversation')
      setConversationState('running')
    }
  }

  const handleResumeConversation = async () => {
    if (!currentSession) return
    
    try {
      setConversationState('starting')
      setError(null)
      
      conversationManager.resumeConversation(currentSession.id)
      resumeSession()
      setConversationState('running')
      
    } catch (error) {
      console.error('Failed to resume conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to resume conversation')
      setConversationState('idle')
    }
  }

  const handleStopConversation = async () => {
    if (!currentSession) return
    
    try {
      setConversationState('stopping')
      setError(null)
      
      conversationManager.stopConversation(currentSession.id)
      endSession()
      setConversationState('idle')
      
    } catch (error) {
      console.error('Failed to stop conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to stop conversation')
    }
  }

  const handleInterject = async () => {
    if (!currentSession) return
    
    if (isInterjecting) {
      // Send the interjection
      if (moderatorInput.trim()) {
        injectPrompt(moderatorInput.trim())
        setModeratorInput('')
      }
      setIsInterjecting(false)
      
      // Resume conversation if it was running before interjection
      if (wasRunningBeforeInterjection) {
        await handleResumeConversation()
        setWasRunningBeforeInterjection(false)
      }
    } else {
      // Start interjecting
      const wasRunning = conversationState === 'running'
      setWasRunningBeforeInterjection(wasRunning)
      
      if (wasRunning) {
        await handlePauseConversation()
      }
      setIsInterjecting(true)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasMessages && (conversationState === 'running' || isInterjecting)) {
        handleInterject()
      } else if (!hasMessages && hasAIParticipants) {
        handleStartConversation()
      }
    }
  }

  const getConversationStatus = () => {
    // If we're interjecting, show that status
    if (isInterjecting) {
      return { text: 'Interjecting', icon: Hand, variant: 'moderator' as const, animate: false }
    }
    
    switch (conversationState) {
      case 'starting':
        return { text: 'Starting...', icon: Loader2, variant: 'thinking' as const, animate: true }
      case 'running':
        return { text: 'Active', icon: CheckCircle2, variant: 'active' as const, animate: false }
      case 'pausing':
        return { text: 'Pausing...', icon: Loader2, variant: 'thinking' as const, animate: true }
      case 'stopping':
        return { text: 'Stopping...', icon: Loader2, variant: 'thinking' as const, animate: true }
      default:
        return isSessionPaused 
          ? { text: 'Paused', icon: Clock, variant: 'paused' as const, animate: false }
          : { text: 'Ready', icon: Play, variant: 'idle' as const, animate: false }
    }
  }

  const getMCPStatusIcon = () => {
    if (!mcp.isInitialized) return <Monitor className="h-4 w-4 text-gray-400" />
    if (mcp.isConnected) return <Wifi className="h-4 w-4 text-green-600" />
    return <WifiOff className="h-4 w-4 text-red-600" />
  }

  const getMCPStatusColor = () => {
    if (!mcp.isInitialized) return 'text-gray-600 bg-gray-50 border-gray-200'
    if (mcp.isConnected) return 'text-green-600 bg-green-50 border-green-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  if (!currentSession) {
    return (
      <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
        {/* Combined Left Panel */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Socratic Dialogue Engine</p>
              </div>
            </div>
          </div>
          
          <SessionsSection />
        </div>

        {/* Main Area - No Session Selected */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full animate-pulse"></div>
              </div>
              <Brain className="relative h-16 w-16 mx-auto text-gray-700 dark:text-gray-300" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Welcome to The Academy</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Select a session from the sidebar or create a new one to begin
            </p>
            <div className="flex justify-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">AI Dialogue</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Research</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const statusInfo = getConversationStatus()

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Combined Left Panel - Academy + Participants + Sessions */}
      <div className={`${showLeftPanel ? 'w-80' : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden`}>
        {/* Academy Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Socratic Dialogue Engine</p>
            </div>
          </div>
        </div>

        {/* Participants Section */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-gray-900 dark:text-gray-100">Participants</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddParticipant(true)}
                className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                disabled={conversationState === 'running'}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
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
                      <ParticipantAvatar 
                        participantType={participant.type} 
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {participant.name}
                          </p>
                          <Badge variant={participant.status} className="text-xs">
                            {participant.status === 'thinking' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
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
            
            {!hasAIParticipants && hasParticipants && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-medium mb-1">Need AI Participants</p>
                    <p>Add at least 2 AI agents to start an autonomous conversation.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sessions Section */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <SessionsSection />
        </div>

        {/* Controls at Bottom */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-3">
            {conversationState === 'idle' || isSessionPaused ? (
              <Button
                variant="default"
                size="sm"
                onClick={isSessionPaused ? handleResumeConversation : () => {}}
                disabled={!hasAIParticipants || conversationState !== 'idle'}
                className="flex-1"
              >
                {conversationState === 'starting' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {isSessionPaused ? 'Resume' : 'Ready'}
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePauseConversation}
                  disabled={conversationState !== 'running'}
                  className="flex-1"
                >
                  {conversationState === 'pausing' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Pausing...
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopConversation}
                  disabled={conversationState === 'stopping'}
                >
                  {conversationState === 'stopping' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleModeratorPanel}
              className={showModeratorPanel ? 'bg-gray-100 dark:bg-gray-700' : ''}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Left Panel Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className="hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showLeftPanel ? <ChevronLeft className="h-4 w-4" /> : <History className="h-4 w-4" />}
              </Button>
              
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">{currentSession.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentSession.participants.length} participants • {currentSession.messages.length} messages
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExportModal(true)}
                  disabled={conversationState === 'running'}
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <FileDown className="h-4 w-4" />
                </Button>
              )}

              {/* MCP Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMCPModal(true)}
                className={`text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${
                  mcp.isConnected ? 'bg-green-50 dark:bg-green-900/20' : ''
                }`}
                title="MCP Integration"
              >
                {getMCPStatusIcon()}
              </Button>
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
                  Ready to Explore
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {hasAIParticipants 
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
                    <ParticipantAvatar 
                      participantType={message.participantType} 
                      size="md"
                    />
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
                          <p className="text-gray-900 dark:text-gray-100 leading-relaxed m-0 whitespace-pre-wrap">
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
            {/* Template suggestion banner */}
            {suggestedPrompt && !hasMessages && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Template Prompt Suggested
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      This session includes a curated conversation starter. You can edit or replace it below.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setModeratorInput('')
                      clearSuggestedPrompt()
                    }}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
            
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
                    !hasAIParticipants 
                      ? "Add at least 2 AI participants first..."
                      : hasMessages 
                        ? (isInterjecting ? "Enter your interjection..." : "Interject with guidance...")
                        : "Enter an opening prompt to begin the AI conversation..."
                  }
                  disabled={!hasAIParticipants || conversationState === 'starting' || conversationState === 'stopping'}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[60px] max-h-[200px] disabled:opacity-50"
                  rows={3}
                />
              </div>
              
              <div className="flex flex-col gap-2 flex-shrink-0">
                {hasMessages ? (
                  <Button
                    onClick={handleInterject}
                    disabled={!hasAIParticipants || (!moderatorInput.trim() && isInterjecting) || conversationState === 'starting' || conversationState === 'stopping'}
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
                    onClick={handleStartConversation}
                    disabled={!hasAIParticipants || !moderatorInput.trim() || conversationState !== 'idle'}
                    className="min-h-[60px] px-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50"
                  >
                    {conversationState === 'starting' ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        Begin
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {hasMessages ? "Press Enter to interject, Shift+Enter for new line" : "Press Enter to begin conversation, Shift+Enter for new line"}
              </span>
              <div className="flex items-center gap-4">
                <span>
                  {moderatorInput.length} characters
                </span>
                {mcp.isInitialized && (
                  <div className="flex items-center gap-1">
                    <Badge className={`text-xs ${getMCPStatusColor()}`}>
                      MCP {mcp.connectionStatus}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Moderator Panel with Live Summary */}
      {showModeratorPanel && (
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Research Center</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor and analyze dialogue patterns</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-700">
              <CardContent className="p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Session Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Status:</span>
                    <Badge variant={statusInfo.variant} className="text-xs">
                      <statusInfo.icon className={`h-3 w-3 mr-1 ${statusInfo.animate ? 'animate-spin' : ''}`} />
                      {statusInfo.text}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Messages:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">{currentSession.messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">AI Agents:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      {currentSession.participants.filter(p => p.type !== 'human' && p.type !== 'moderator').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Mode:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      {isInterjecting ? 'Interjecting' : conversationState === 'running' ? 'Autonomous' : 'Manual'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* MCP Status Card */}
            {mcp.isInitialized && (
              <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-700">
                <CardContent className="p-4">
                  <h3 className="font-medium text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    MCP Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Connection:</span>
                      <Badge className={`text-xs ${getMCPStatusColor()}`}>
                        {mcp.connectionStatus}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Resources:</span>
                      <span className="font-medium text-purple-900 dark:text-purple-100">{mcp.resources.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Tools:</span>
                      <span className="font-medium text-purple-900 dark:text-purple-100">{mcp.tools.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowPromptCustomizer(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Customize Prompts
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowExportModal(true)}
                    disabled={!hasMessages}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Chat Data
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowMCPModal(true)}
                  >
                    {getMCPStatusIcon()}
                    <span className="ml-2">MCP Integration</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live AI Analysis */}
            <LiveSummary />
          </div>
        </div>
      )}

      {/* Modals */}
      <AddParticipant 
        isOpen={showAddParticipant} 
        onClose={() => setShowAddParticipant(false)} 
      />
      
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      <MCPModal
        isOpen={showMCPModal}
        onClose={() => setShowMCPModal(false)}
      />

      <PromptCustomizer
        isOpen={showPromptCustomizer}
        onClose={() => setShowPromptCustomizer(false)}
      />
    </div>
  )
}