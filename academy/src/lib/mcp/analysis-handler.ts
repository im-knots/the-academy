// src/lib/mcp/analysis-handler.ts - Universal Analysis Handler (Server & Client Compatible)

import { AnalysisSnapshot } from '@/types/chat'
import { MCPClient } from './client'

// Check if we're in browser or server context
const isBrowser = typeof window !== 'undefined'

export class MCPAnalysisHandler {
  private static instance: MCPAnalysisHandler
  private subscribers: Map<string, Array<(data: any) => void>> = new Map()
  private mcpClient: MCPClient

  private constructor() {
    console.log(`🔧 MCPAnalysisHandler: Initializing... (${isBrowser ? 'client' : 'server'} context)`)
    this.mcpClient = MCPClient.getInstance()
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

    try {
      // Save snapshot via MCP
      const result = await this.mcpClient.saveAnalysisSnapshotViaMCP(sessionId, snapshot)
      
      if (result.success) {
        console.log(`✅ MCP Analysis Handler: Saved snapshot ${snapshot.id} via MCP`)
        
        // Get updated history for broadcast
        const historyResult = await this.mcpClient.getAnalysisHistoryViaMCP(sessionId)
        const updatedSnapshots = historyResult.success ? historyResult.snapshots : []
        
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
      } else {
        throw new Error('Failed to save analysis snapshot via MCP')
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Failed to save snapshot:`, error)
      throw error
    }
  }

  // Fallback ID generator for server context
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  // Get analysis history for a session
  async getAnalysisHistory(sessionId: string): Promise<AnalysisSnapshot[]> {
    try {
      const result = await this.mcpClient.getAnalysisHistoryViaMCP(sessionId)
      
      if (result.success) {
        const snapshots = result.snapshots || []
        console.log(`📊 MCP Analysis Handler: Retrieved ${snapshots.length} snapshots for session ${sessionId} (${isBrowser ? 'client' : 'server'})`)
        
        // Convert date strings back to Date objects if needed
        return snapshots.map((snapshot: any) => ({
          ...snapshot,
          timestamp: new Date(snapshot.timestamp)
        }))
      } else {
        console.warn(`⚠️ MCP Analysis Handler: Failed to get history for session ${sessionId}`)
        return []
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Error getting history:`, error)
      return []
    }
  }

  // Get all sessions with analysis
  async getAllAnalysisSessions(): Promise<Array<{
    sessionId: string
    snapshotCount: number
    lastAnalysis: Date | null
  }>> {
    try {
      // Get all sessions via MCP
      const sessionsResult = await this.mcpClient.callTool('get_sessions', {})
      
      if (!sessionsResult.success || !sessionsResult.sessions) {
        return []
      }

      const sessions: Array<{
        sessionId: string
        snapshotCount: number
        lastAnalysis: Date | null
      }> = []

      // Get analysis history for each session
      for (const session of sessionsResult.sessions) {
        const historyResult = await this.mcpClient.getAnalysisHistoryViaMCP(session.id)
        
        if (historyResult.success && historyResult.snapshots && historyResult.snapshots.length > 0) {
          const snapshots = historyResult.snapshots
          const lastSnapshot = snapshots[snapshots.length - 1]
          
          sessions.push({
            sessionId: session.id,
            snapshotCount: snapshots.length,
            lastAnalysis: lastSnapshot ? new Date(lastSnapshot.timestamp) : null
          })
        }
      }

      return sessions.sort((a, b) => 
        (b.lastAnalysis?.getTime() || 0) - (a.lastAnalysis?.getTime() || 0)
      )
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Error getting all analysis sessions:`, error)
      return []
    }
  }

  // Clear analysis history for a session
  async clearAnalysisHistory(sessionId: string): Promise<void> {
    console.log(`🗑️ MCP Analysis Handler: Clearing history for session ${sessionId}`)
    
    try {
      const result = await this.mcpClient.clearAnalysisHistoryViaMCP(sessionId)
      
      if (result.success) {
        console.log(`✅ MCP Analysis Handler: Cleared history for session ${sessionId} via MCP`)
        
        if (isBrowser) {
          this.broadcast('analysis_history_cleared', {
            sessionId
          })
        }
      } else {
        throw new Error('Failed to clear analysis history via MCP')
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Failed to clear history:`, error)
      throw error
    }
  }

  // Get analysis timeline (for export)
  async getAnalysisTimeline(sessionId: string): Promise<Array<{
    timestamp: Date
    provider: string
    messageCount: number
    phase: string
    keyInsight: string
  }>> {
    const snapshots = await this.getAnalysisHistory(sessionId)
    
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
      // Trigger analysis via MCP
      const result = await this.mcpClient.analyzeConversationViaMCP(sessionId, analysisType)
      
      if (result.success) {
        console.log(`✅ MCP Analysis Handler: Analysis complete for session ${sessionId}`)
        return result.analysis
      } else {
        throw new Error('Analysis failed via MCP')
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Analysis failed for session ${sessionId}:`, error)
      throw error
    }
  }

  // Initialize from existing chatStore data (migration)
  async initializeFromChatStore(sessions: any[]): Promise<void> {
    console.log(`🔄 MCP Analysis Handler: Migrating data from ${sessions.length} sessions`)
    
    for (const session of sessions) {
      if (session.analysisHistory && session.analysisHistory.length > 0) {
        // Save each snapshot via MCP
        for (const snapshot of session.analysisHistory) {
          try {
            await this.mcpClient.saveAnalysisSnapshotViaMCP(session.id, snapshot)
            console.log(`🔄 MCP Analysis Handler: Migrated snapshot ${snapshot.id} for session ${session.id}`)
          } catch (error) {
            console.error(`❌ Failed to migrate snapshot for session ${session.id}:`, error)
          }
        }
      }
    }

    console.log(`✅ MCP Analysis Handler: Migration complete`)
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
  async getGlobalAnalysisStats(): Promise<{
    totalSessions: number
    totalSnapshots: number
    avgSnapshotsPerSession: number
    mostActiveSession: string | null
    recentAnalysisCount: number
  }> {
    const sessions = await this.getAllAnalysisSessions()
    const totalSnapshots = sessions.reduce((sum, s) => sum + s.snapshotCount, 0)
    
    // Find most active session
    const mostActive = sessions.reduce((prev, current) => 
      current.snapshotCount > prev.snapshotCount ? current : prev,
      sessions[0] || { sessionId: null, snapshotCount: 0, lastAnalysis: null }
    )

    // Count recent analysis (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    let recentCount = 0
    
    for (const session of sessions) {
      const snapshots = await this.getAnalysisHistory(session.sessionId)
      recentCount += snapshots.filter(s => s.timestamp > oneDayAgo).length
    }

    return {
      totalSessions: sessions.length,
      totalSnapshots,
      avgSnapshotsPerSession: sessions.length > 0 ? Math.round(totalSnapshots / sessions.length) : 0,
      mostActiveSession: mostActive.sessionId,
      recentAnalysisCount: recentCount
    }
  }

  // Initialize a session for analysis tracking
  async initializeSession(sessionId: string): Promise<void> {
    console.log(`🔧 MCP Analysis Handler: Initializing session ${sessionId} for analysis tracking`)
    
    try {
      // Check if session has analysis history
      const historyResult = await this.mcpClient.getAnalysisHistoryViaMCP(sessionId)
      const existingSnapshots = historyResult.success ? historyResult.snapshots?.length || 0 : 0
      
      console.log(`📊 MCP Analysis Handler: Session ${sessionId} has ${existingSnapshots} existing analysis snapshots`)

      // Broadcast initialization event (only in browser context)
      if (isBrowser) {
        this.broadcast('session_initialized', {
          sessionId,
          existingSnapshots
        })
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Failed to initialize session ${sessionId}:`, error)
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
    await this.initializeSession(sessionId)

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
  async clearSessionAnalysis(sessionId: string): Promise<void> {
    console.log(`🔧 MCP Analysis Handler: clearSessionAnalysis called (redirecting to clearAnalysisHistory)`)
    await this.clearAnalysisHistory(sessionId)
  }

  // Debug method
  async debug(): Promise<void> {
    console.log(`🔍 MCP Analysis Handler Debug (${isBrowser ? 'client' : 'server'}):`)
    
    try {
      const sessions = await this.getAllAnalysisSessions()
      console.log(`  - Total sessions with analysis: ${sessions.length}`)
      
      if (isBrowser) {
        console.log(`  - Active subscriptions:`, this.subscribers)
      }
      
      for (const session of sessions) {
        console.log(`  - Session ${session.sessionId}: ${session.snapshotCount} snapshots`)
      }
    } catch (error) {
      console.error(`❌ MCP Analysis Handler: Debug failed:`, error)
    }
  }
}

// Singleton instance
export const mcpAnalysisHandler = MCPAnalysisHandler.getInstance()