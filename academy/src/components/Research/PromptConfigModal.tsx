// src/components/Research/PromptConfigModal.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Settings, RotateCcw, Save, Info, FileText, Brain, MessageSquare } from 'lucide-react'
import { useMCP } from '@/hooks/useMCP'
import { useChatStore } from '@/lib/stores/chatStore'

interface PromptConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PromptConfigModal({ isOpen, onClose }: PromptConfigModalProps) {
  const mcp = useMCP()
  const currentSession = useChatStore(state => state.currentSession)
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Configuration state
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState('')
  const [chatSystemPrompt, setChatSystemPrompt] = useState('')
  const [analysisPrompt, setAnalysisPrompt] = useState('')
  const [analysisLookbackMessages, setAnalysisLookbackMessages] = useState(10)
  
  // Default prompts for reference
  const [defaultPrompts, setDefaultPrompts] = useState<any>(null)
  const [showDefaults, setShowDefaults] = useState(false)

  // Load current configuration when modal opens
  useEffect(() => {
    if (isOpen && currentSession && mcp.isConnected) {
      loadConfiguration()
      loadDefaults()
    }
  }, [isOpen, currentSession?.id, mcp.isConnected])

  const loadConfiguration = async () => {
    if (!currentSession) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await mcp.getPromptConfiguration(currentSession.id)
      if (result.success) {
        const config = result.configuration
        setSessionSystemPrompt(config.sessionSystemPrompt || '')
        setChatSystemPrompt(config.chatSystemPrompt || '')
        setAnalysisPrompt(config.analysisPrompt || '')
        setAnalysisLookbackMessages(config.analysisLookbackMessages || 10)
      }
    } catch (error) {
      console.error('Failed to load prompt configuration:', error)
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const loadDefaults = async () => {
    try {
      const defaults = await mcp.getDefaultPrompts()
      setDefaultPrompts(defaults)
    } catch (error) {
      console.error('Failed to load default prompts:', error)
    }
  }

  const handleSave = async () => {
    if (!currentSession) return
    
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    
    try {
      const result = await mcp.setPromptConfiguration(currentSession.id, {
        sessionSystemPrompt,
        chatSystemPrompt,
        analysisPrompt,
        analysisLookbackMessages
      })
      
      if (result.success) {
        setSuccessMessage('Configuration saved successfully')
        setTimeout(() => setSuccessMessage(null), 3000)
      }
    } catch (error) {
      console.error('Failed to save prompt configuration:', error)
      setError('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleResetToDefaults = () => {
    if (defaultPrompts) {
      setSessionSystemPrompt(defaultPrompts.sessionSystemPrompt)
      setChatSystemPrompt(defaultPrompts.chatSystemPrompt)
      setAnalysisPrompt(defaultPrompts.analysisPrompt)
      setAnalysisLookbackMessages(defaultPrompts.analysisLookbackMessages)
    }
  }

  const handleClose = () => {
    setError(null)
    setSuccessMessage(null)
    onClose()
  }

  if (!currentSession) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Prompt Configuration
          </DialogTitle>
          <DialogDescription>
            Configure system prompts and analysis settings for session: <strong>{currentSession.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="prompts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prompts" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              System Prompts
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Analysis Settings
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompts" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Session System Prompt
                </CardTitle>
                <CardDescription>
                  Sets the overall context and rules for all participants in this session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={sessionSystemPrompt}
                  onChange={(e) => setSessionSystemPrompt(e.target.value)}
                  placeholder="Example: You are participating in a philosophical dialogue about consciousness. Focus on exploring novel ideas and building on each other's insights..."
                  className="min-h-[120px] font-mono text-sm"
                  disabled={loading || saving}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  This prompt is prepended to each participant's individual system prompt
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat Call System Prompt
                </CardTitle>
                <CardDescription>
                  Overrides the default system prompt for each API call during the conversation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={chatSystemPrompt}
                  onChange={(e) => setChatSystemPrompt(e.target.value)}
                  placeholder="Example: Respond thoughtfully and concisely. Build on previous ideas while introducing novel perspectives..."
                  className="min-h-[120px] font-mono text-sm"
                  disabled={loading || saving}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Leave empty to use participant-specific prompts
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Analysis Prompt
                </CardTitle>
                <CardDescription>
                  Custom instructions for how the AI should analyze conversations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={analysisPrompt}
                  onChange={(e) => setAnalysisPrompt(e.target.value)}
                  placeholder="Enter a custom analysis prompt or leave empty to use the default..."
                  className="min-h-[200px] font-mono text-sm"
                  disabled={loading || saving}
                />
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-2">Available Template Variables:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <code className="bg-background px-2 py-1 rounded">{'{{SESSION_NAME}}'}</code>
                    <code className="bg-background px-2 py-1 rounded">{'{{MESSAGE_COUNT}}'}</code>
                    <code className="bg-background px-2 py-1 rounded">{'{{PARTICIPANT_PROFILES}}'}</code>
                    <code className="bg-background px-2 py-1 rounded">{'{{CONVERSATION_HISTORY}}'}</code>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Analysis Context Window
                </CardTitle>
                <CardDescription>
                  Number of recent messages to include when analyzing the conversation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label htmlFor="lookback" className="min-w-[140px]">Messages to analyze:</Label>
                    <Input
                      id="lookback"
                      type="number"
                      min="1"
                      max="50"
                      value={analysisLookbackMessages}
                      onChange={(e) => setAnalysisLookbackMessages(parseInt(e.target.value) || 10)}
                      className="w-24"
                      disabled={loading || saving}
                    />
                    <span className="text-sm text-muted-foreground">
                      (1-50 messages)
                    </span>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Performance tip:</strong> Larger context windows provide more comprehensive analysis but increase processing time and costs. 
                      For real-time analysis, 10-20 messages is usually optimal.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Example Templates</CardTitle>
                <CardDescription>
                  Common prompt patterns you can adapt for your research
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Philosophical Dialogue Analysis</h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
{`Analyze the philosophical dialogue "{{SESSION_NAME}}" with {{MESSAGE_COUNT}} messages.

Participants:
{{PARTICIPANT_PROFILES}}

Conversation:
{{CONVERSATION_HISTORY}}

Focus on:
1. Philosophical depth and rigor
2. Novel insights or perspectives
3. Quality of argumentation
4. Conceptual clarity
5. Areas of convergence/divergence

Format as structured JSON.`}
                    </pre>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2"
                      onClick={() => setAnalysisPrompt(`Analyze the philosophical dialogue "{{SESSION_NAME}}" with {{MESSAGE_COUNT}} messages.\n\nParticipants:\n{{PARTICIPANT_PROFILES}}\n\nConversation:\n{{CONVERSATION_HISTORY}}\n\nFocus on:\n1. Philosophical depth and rigor\n2. Novel insights or perspectives\n3. Quality of argumentation\n4. Conceptual clarity\n5. Areas of convergence/divergence\n\nFormat as structured JSON.`)}
                    >
                      Use This Template
                    </Button>
                  </div>

                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Debate Quality Assessment</h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
{`Evaluate the debate quality in "{{SESSION_NAME}}".

Recent {{MESSAGE_COUNT}} exchanges:
{{CONVERSATION_HISTORY}}

Assess:
- Strength of arguments (1-10)
- Use of evidence and examples
- Logical consistency
- Respectful disagreement
- Progress toward resolution

Identify the strongest and weakest arguments made.`}
                    </pre>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2"
                      onClick={() => setAnalysisPrompt(`Evaluate the debate quality in "{{SESSION_NAME}}".\n\nRecent {{MESSAGE_COUNT}} exchanges:\n{{CONVERSATION_HISTORY}}\n\nAssess:\n- Strength of arguments (1-10)\n- Use of evidence and examples\n- Logical consistency\n- Respectful disagreement\n- Progress toward resolution\n\nIdentify the strongest and weakest arguments made.`)}
                    >
                      Use This Template
                    </Button>
                  </div>
                </div>

                {defaultPrompts && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDefaults(!showDefaults)}
                      className="w-full"
                    >
                      {showDefaults ? 'Hide' : 'Show'} Default Prompts
                    </Button>
                    
                    {showDefaults && (
                      <div className="mt-3 space-y-3 text-xs">
                        <div>
                          <Label className="text-xs">Default Session Prompt:</Label>
                          <pre className="bg-muted p-2 rounded mt-1 whitespace-pre-wrap">
                            {defaultPrompts.sessionSystemPrompt}
                          </pre>
                        </div>
                        <div>
                          <Label className="text-xs">Default Analysis Prompt:</Label>
                          <pre className="bg-muted p-2 rounded mt-1 whitespace-pre-wrap">
                            {defaultPrompts.analysisPrompt}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleResetToDefaults}
            disabled={loading || saving || !defaultPrompts}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={loading || saving || !mcp.isConnected}
            >
              {saving ? (
                <>
                  <Save className="h-4 w-4 mr-2 animate-pulse" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}