// src/components/Chat/ChatInterface.tsx
'use client'

import { useChatStore } from '@/lib/stores/chatStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Brain, Users, Settings, Play, Pause, Plus } from 'lucide-react'

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
    addParticipant
  } = useChatStore()

  if (!currentSession) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              The Academy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Initializing consciousness research platform...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 consciousness-pulse" />
              <h1 className="text-xl font-semibold">The Academy</h1>
            </div>
            <Badge variant="outline">{currentSession.name}</Badge>
            <Badge variant={currentSession.status === 'active' ? 'active' : 'outline'}>
              {currentSession.status}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleParticipantPanel}
              className={showParticipantPanel ? 'bg-accent' : ''}
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleModeratorPanel}
              className={showModeratorPanel ? 'bg-accent' : ''}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant={isSessionPaused ? "default" : "secondary"}
              size="sm"
              onClick={isSessionPaused ? resumeSession : pauseSession}
            >
              {isSessionPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex pt-16">
        {/* Participant Panel */}
        {showParticipantPanel && (
          <div className="w-80 border-r bg-card">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Participants</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // For now, add a sample participant
                    addParticipant({
                      name: `AI Agent ${currentSession.participants.length + 1}`,
                      type: Math.random() > 0.5 ? 'claude' : 'gpt',
                      status: 'idle',
                      settings: {
                        temperature: 0.7,
                        maxTokens: 1000,
                      }
                    })
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="p-4 space-y-3">
              {currentSession.participants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No participants yet</p>
                  <p className="text-sm">Click + to add AI agents</p>
                </div>
              ) : (
                currentSession.participants.map((participant) => (
                  <Card key={participant.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{participant.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {participant.messageCount} messages
                        </div>
                      </div>
                      <Badge variant={participant.type === 'claude' ? 'claude' : 'gpt'}>
                        {participant.type}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Badge variant={participant.status} size="sm">
                        {participant.status}
                      </Badge>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-6 overflow-y-auto">
            {currentSession.messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                  <Brain className="h-16 w-16 mx-auto mb-4 opacity-50 consciousness-pulse" />
                  <h3 className="text-lg font-semibold mb-2">Ready to Explore Consciousness</h3>
                  <p className="text-muted-foreground mb-4">
                    Add AI participants and begin your dialogue about consciousness, meaning, and existence.
                  </p>
                  <div className="text-sm text-muted-foreground">
                    <p>Session: {currentSession.name}</p>
                    {currentSession.description && (
                      <p className="mt-1">{currentSession.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {currentSession.messages.map((message) => (
                  <div key={message.id} className="message-appear">
                    <Card className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={message.participantType}>
                            {message.participantName}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm leading-relaxed">
                        {message.content}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message Input Area */}
          <div className="border-t p-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center text-sm text-muted-foreground">
                AI-to-AI conversation interface coming soon...
                <br />
                Add participants and watch them engage in autonomous dialogue.
              </div>
            </div>
          </div>
        </div>

        {/* Moderator Panel */}
        {showModeratorPanel && (
          <div className="w-80 border-l bg-card">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Moderator Controls</h2>
            </div>
            
            <div className="p-4 space-y-4">
              <Card className="p-4">
                <h3 className="font-medium mb-2">Session Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <Badge variant={currentSession.status === 'active' ? 'active' : 'outline'}>
                      {currentSession.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Messages:</span>
                    <span>{currentSession.messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Participants:</span>
                    <span>{currentSession.participants.length}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-medium mb-2">Research Notes</h3>
                <div className="text-sm text-muted-foreground">
                  <p>Observation and analysis tools coming soon...</p>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-medium mb-2">Quick Actions</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    disabled
                  >
                    Inject Prompt
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    disabled
                  >
                    Export Session
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full justify-start"
                    disabled
                  >
                    End Session
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}