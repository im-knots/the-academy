// src/lib/mcp/analysis-handler.ts - Universal Analysis Handler (Server & Client Compatible)
// Remove the 'use client' directive to make this work in both contexts

import { AnalysisSnapshot } from '@/types/chat'

// Check if we're in browser or server context
const isBrowser = typeof window !== 'undefined'

// Universal storage - use Map for both contexts
const analysisStore: Map<string, AnalysisSnapshot[]> = new Map()

export class MCPAnalysisHandler {
  private static instance: MCPAnalysisHandler
  private subscribers: Map<string, Array<(data: any) => void>> = new Map()

  private constructor() {
    console.log(`🔧 MCPAnalysisHandler: Initializing... (${isBrowser ? 'client' : 'server'} context)`)
  }

  static getInstance(): MCPAnalysisHandler {
    if (!MCPAnalysisHandler.instance) {
      MCPAnalysisHandler.instance = new MCPAnalysisHandler()
    }
    return MCPAnalysisHandler.instance
  }

  // Save analysis snapshot via MCP
  async saveAnalysisSnapshot(sessionId: string, analysisData: Omit<AnalysisSnapshot, 'id' | 'timestamp'>): Promise<string> {
    console.log(`💾 MCP Analysis Handler: Saving snapshot for session ${sessionId} (${isBrowser ? 'client' : 'server'})`)
    
    // Generate ID using fallback for server context
    const id = isBrowser && typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : this.generateId()

    const snapshot: AnalysisSnapshot = {
      ...analysisData,
      id,
      timestamp: new Date()
    }

    // Get existing snapshots for this session
    const existingSnapshots = analysisStore.get(sessionId) || []
    
    // Add new snapshot
    const updatedSnapshots = [...existingSnapshots, snapshot]
    analysisStore.set(sessionId, updatedSnapshots)

    console.log(`✅ MCP Analysis Handler: Saved snapshot ${snapshot.id}. Session ${sessionId} now has ${updatedSnapshots.length} snapshots`)

    // Only broadcast events in browser context
    if (isBrowser) {
      this.broadcast('analysis_snapshot_saved', {
        sessionId,
        snapshotId: snapshot.id,
        totalSnapshots: updatedSnapshots.length,
        snapshot
      })

      this.broadcast('analysis_history_updated', {
        sessionId,
        snapshots: updatedSnapshots,
        count: updatedSnapshots.length
      })
    }

    return snapshot.id
  }

  // Fallback ID generator for server context
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  // Get analysis history for a session
  getAnalysisHistory(sessionId: string): AnalysisSnapshot[] {
    const snapshots = analysisStore.get(sessionId) || []
    console.log(`📊 MCP Analysis Handler: Retrieved ${snapshots.length} snapshots for session ${sessionId} (${isBrowser ? 'client' : 'server'})`)
    return snapshots
  }

  // Get all sessions with analysis
  getAllAnalysisSessions(): Array<{
    sessionId: string
    snapshotCount: number
    lastAnalysis: Date | null
  }> {
    const sessions: Array<{
      sessionId: string
      snapshotCount: number
      lastAnalysis: Date | null
    }> = []

    analysisStore.forEach((snapshots, sessionId) => {
      const lastSnapshot = snapshots[snapshots.length - 1]
      sessions.push({
        sessionId,
        snapshotCount: snapshots.length,
        lastAnalysis: lastSnapshot ? lastSnapshot.timestamp : null
      })
    })

    return sessions.sort((a, b) => 
      (b.lastAnalysis?.getTime() || 0) - (a.lastAnalysis?.getTime() || 0)
    )
  }

  // Clear analysis history for a session
  clearAnalysisHistory(sessionId: string): void {
    console.log(`🗑️ MCP Analysis Handler: Clearing history for session ${sessionId}`)
    analysisStore.delete(sessionId)
    
    if (isBrowser) {
      this.broadcast('analysis_history_cleared', {
        sessionId
      })
    }
  }

  // Get analysis timeline (for export)
  getAnalysisTimeline(sessionId: string): Array<{
    timestamp: Date
    provider: string
    messageCount: number
    phase: string
    keyInsight: string
  }> {
    const snapshots = this.getAnalysisHistory(sessionId)
    
    return snapshots.map(snapshot => ({
      timestamp: snapshot.timestamp,
      provider: snapshot.provider,
      messageCount: snapshot.messageCountAtAnalysis,
      phase: snapshot.conversationPhase,
      keyInsight: snapshot.analysis.keyInsights[0] || 'No key insights recorded'
    }))
  }

  async analyzeSession(sessionId: string, analysisType: string = 'full'): Promise<any> {
    console.log(`🔍 MCP Analysis Handler: Analyzing session ${sessionId} with type ${analysisType}`)
    
    try {
      // Get existing snapshots for context
      const existingSnapshots = this.getAnalysisHistory(sessionId)
      
      // Simulate analysis (replace with actual AI analysis logic)
      const analysisResult = {
        sessionId,
        analysisType,
        timestamp: new Date(),
        mainTopics: ['AI Philosophy', 'Consciousness', 'Ethics'],
        keyInsights: [
          'Participants showed deep engagement with philosophical concepts',
          'Convergence on ethical AI principles',
          'Divergent views on consciousness definition'
        ],
        sentimentTrend: 'positive',
        participantEngagement: {
          total: 85,
          distribution: {}
        },
        conversationFlow: {
          phase: 'deep_exploration',
          momentum: 'increasing',
          coherence: 0.8
        },
        patterns: {
          emergentThemes: ['AI consciousness', 'ethical boundaries'],
          recursiveTopics: ['consciousness definition'],
          consensusAreas: ['need for AI ethics'],
          tensions: ['human vs AI consciousness']
        }
      }

      console.log(`✅ MCP Analysis Handler: Analysis complete for session ${sessionId}`)
      return analysisResult
      
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Analysis failed for session ${sessionId}:`, error)
      throw error
    }
  }

  // Initialize from existing chatStore data (migration)
  initializeFromChatStore(sessions: any[]): void {
    console.log(`🔄 MCP Analysis Handler: Migrating data from ${sessions.length} sessions`)
    
    sessions.forEach(session => {
      if (session.analysisHistory && session.analysisHistory.length > 0) {
        analysisStore.set(session.id, session.analysisHistory)
        console.log(`🔄 MCP Analysis Handler: Migrated ${session.analysisHistory.length} snapshots for session ${session.id}`)
      }
    })

    console.log(`✅ MCP Analysis Handler: Migration complete. Total sessions with analysis: ${analysisStore.size}`)
  }

  // Event subscription system (only works in browser)
  subscribe(event: string, callback: (data: any) => void): () => void {
    if (!isBrowser) {
      console.warn('⚠️ MCP Analysis Handler: Event subscription not available in server context')
      return () => {} // Return empty unsubscribe function
    }

    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, [])
    }
    
    this.subscribers.get(event)!.push(callback)
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(event)
      if (callbacks) {
        const index = callbacks.indexOf(callback)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
      }
    }
  }

  // Broadcast events to subscribers (only works in browser)
  private broadcast(event: string, data: any): void {
    if (!isBrowser) return

    const callbacks = this.subscribers.get(event) || []
    console.log(`📡 MCP Analysis Handler: Broadcasting ${event} to ${callbacks.length} subscribers`)
    
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in MCP analysis event callback for ${event}:`, error)
      }
    })
  }

  // Get statistics across all sessions
  getGlobalAnalysisStats(): {
    totalSessions: number
    totalSnapshots: number
    avgSnapshotsPerSession: number
    mostActiveSession: string | null
    recentAnalysisCount: number
  } {
    const sessions = this.getAllAnalysisSessions()
    const totalSnapshots = sessions.reduce((sum, s) => sum + s.snapshotCount, 0)
    
    // Find most active session
    const mostActive = sessions.reduce((prev, current) => 
      current.snapshotCount > prev.snapshotCount ? current : prev,
      sessions[0] || { sessionId: null, snapshotCount: 0, lastAnalysis: null }
    )

    // Count recent analysis (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentCount = sessions.reduce((count, session) => {
      const snapshots = analysisStore.get(session.sessionId) || []
      return count + snapshots.filter(s => s.timestamp > oneDayAgo).length
    }, 0)

    return {
      totalSessions: sessions.length,
      totalSnapshots,
      avgSnapshotsPerSession: sessions.length > 0 ? Math.round(totalSnapshots / sessions.length) : 0,
      mostActiveSession: mostActive.sessionId,
      recentAnalysisCount: recentCount
    }
  }

  // Initialize a session for analysis tracking
  initializeSession(sessionId: string): void {
    console.log(`🔧 MCP Analysis Handler: Initializing session ${sessionId} for analysis tracking`)
    
    // Ensure session has an entry in the analysis store
    if (!analysisStore.has(sessionId)) {
      analysisStore.set(sessionId, [])
      console.log(`✅ MCP Analysis Handler: Session ${sessionId} initialized with empty analysis history`)
    } else {
      const existing = analysisStore.get(sessionId)!
      console.log(`📊 MCP Analysis Handler: Session ${sessionId} already has ${existing.length} analysis snapshots`)
    }

    // Broadcast initialization event (only in browser context)
    if (isBrowser) {
      this.broadcast('session_initialized', {
        sessionId,
        existingSnapshots: analysisStore.get(sessionId)?.length || 0
      })
    }
  }

  // Handle new message and potentially trigger analysis
  async handleNewMessage(sessionId: string, message: any): Promise<void> {
    console.log(`📝 MCP Analysis Handler: New message received for session ${sessionId}`)
    
    if (!message) {
      console.warn('⚠️ MCP Analysis Handler: Received null/undefined message')
      return
    }

    // Ensure session is initialized
    this.initializeSession(sessionId)

    // Log message details
    console.log(`📝 MCP Analysis Handler: Message from ${message.participantName} (${message.participantType}): ${message.content?.substring(0, 100)}...`)

    // Broadcast new message event (only in browser context)
    if (isBrowser) {
      this.broadcast('message_received', {
        sessionId,
        messageId: message.id,
        participantType: message.participantType,
        participantName: message.participantName,
        timestamp: message.timestamp || new Date()
      })
    }
  }

  // Add an alias method for backward compatibility
  clearSessionAnalysis(sessionId: string): void {
    console.log(`🔧 MCP Analysis Handler: clearSessionAnalysis called (redirecting to clearAnalysisHistory)`)
    this.clearAnalysisHistory(sessionId)
  }

  // Debug method
  debug(): void {
    console.log(`🔍 MCP Analysis Handler Debug (${isBrowser ? 'client' : 'server'}):`)
    console.log(`  - Total sessions with analysis: ${analysisStore.size}`)
    if (isBrowser) {
      console.log(`  - Active subscriptions:`, this.subscribers)
    }
    analysisStore.forEach((snapshots, sessionId) => {
      console.log(`  - Session ${sessionId}: ${snapshots.length} snapshots`)
    })
  }
}

// Singleton instance
export const mcpAnalysisHandler = MCPAnalysisHandler.getInstance()