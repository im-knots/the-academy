// src/lib/utils/export.ts
import { ChatSession, Message, AnalysisSnapshot } from '@/types/chat'

export interface ExportOptions {
  format: 'json' | 'csv'
  includeMetadata: boolean
  includeParticipantInfo: boolean
  includeSystemPrompts: boolean
  includeAnalysisHistory: boolean
}

export interface ExportData {
  session: ChatSession
  exportedAt: Date
  exportOptions: ExportOptions
}

export class ExportManager {
  static generateJSON(session: ChatSession, options: ExportOptions): string {
    const exportData: ExportData = {
      session: {
        ...session,
        // Optionally filter sensitive data based on options
        participants: options.includeParticipantInfo 
          ? session.participants.map(p => ({
              ...p,
              systemPrompt: options.includeSystemPrompts ? p.systemPrompt : undefined
            }))
          : session.participants.map(p => ({
              id: p.id,
              name: p.name,
              type: p.type,
              status: p.status,
              joinedAt: p.joinedAt,
              messageCount: p.messageCount
            })) as any,
        messages: session.messages.map(m => ({
          ...m,
          metadata: options.includeMetadata ? m.metadata : undefined
        })),
        analysisHistory: options.includeAnalysisHistory ? session.analysisHistory : undefined
      },
      exportedAt: new Date(),
      exportOptions: options
    }

    return JSON.stringify(exportData, null, 2)
  }

  static generateCSV(session: ChatSession, options: ExportOptions): string {
    const headers = [
      'timestamp',
      'entry_type', // 'message' or 'analysis'
      'participant_name',
      'participant_type',
      'participant_id',
      'content',
      'message_id'
    ]

    if (options.includeMetadata) {
      headers.push('temperature', 'max_tokens', 'response_time', 'system_prompt_used')
    }

    if (options.includeAnalysisHistory) {
      headers.push('analysis_provider', 'analysis_phase', 'philosophical_depth', 'analysis_id')
    }

    // Combine messages and analysis snapshots for chronological export
    const chronologicalEntries: Array<{
      timestamp: Date
      type: 'message' | 'analysis'
      data: Message | AnalysisSnapshot
    }> = []

    // Add messages
    session.messages.forEach(message => {
      chronologicalEntries.push({
        timestamp: message.timestamp,
        type: 'message',
        data: message
      })
    })

    // Add analysis snapshots if requested
    if (options.includeAnalysisHistory && session.analysisHistory) {
      session.analysisHistory.forEach(analysis => {
        chronologicalEntries.push({
          timestamp: analysis.timestamp,
          type: 'analysis',
          data: analysis
        })
      })
    }

    // Sort chronologically
    chronologicalEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    // Generate rows
    const rows = chronologicalEntries.map(entry => {
      if (entry.type === 'message') {
        const message = entry.data as Message
        const baseRow = [
          message.timestamp.toISOString(),
          'message',
          this.escapeCSVField(message.participantName),
          message.participantType,
          message.participantId,
          this.escapeCSVField(message.content),
          message.id
        ]

        if (options.includeMetadata) {
          baseRow.push(
            message.metadata?.temperature?.toString() || '',
            message.metadata?.maxTokens?.toString() || '',
            message.metadata?.responseTime?.toString() || '',
            message.metadata?.systemPrompt ? 'true' : 'false'
          )
        }

        if (options.includeAnalysisHistory) {
          baseRow.push('', '', '', '') // Empty analysis fields for messages
        }

        return baseRow
      } else {
        // Analysis snapshot
        const analysis = entry.data as AnalysisSnapshot
        const analysisContent = JSON.stringify({
          mainTopics: analysis.analysis.mainTopics,
          keyInsights: analysis.analysis.keyInsights,
          currentDirection: analysis.analysis.currentDirection,
          emergentThemes: analysis.analysis.emergentThemes,
          tensions: analysis.analysis.tensions,
          convergences: analysis.analysis.convergences,
          nextLikelyDirections: analysis.analysis.nextLikelyDirections
        })

        const baseRow = [
          analysis.timestamp.toISOString(),
          'analysis',
          'Research Assistant',
          'analysis',
          'analysis-' + analysis.id,
          this.escapeCSVField(analysisContent),
          analysis.id
        ]

        if (options.includeMetadata) {
          baseRow.push(
            '', // temperature
            '', // max_tokens
            '', // response_time
            '' // system_prompt_used
          )
        }

        if (options.includeAnalysisHistory) {
          baseRow.push(
            analysis.provider,
            analysis.conversationPhase,
            analysis.analysis.philosophicalDepth,
            analysis.id
          )
        }

        return baseRow
      }
    })

    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n')

    // Add session metadata as comments at the top
    const sessionInfo = [
      `# Session: ${this.escapeCSVField(session.name)}`,
      `# Description: ${this.escapeCSVField(session.description || '')}`,
      `# Created: ${session.createdAt.toISOString()}`,
      `# Status: ${session.status}`,
      `# Participants: ${session.participants.length}`,
      `# Messages: ${session.messages.length}`,
      `# Analysis Snapshots: ${session.analysisHistory?.length || 0}`,
      `# Exported: ${new Date().toISOString()}`,
      '#'
    ].join('\n')

    return `${sessionInfo}\n${csvContent}`
  }

  private static escapeCSVField(field: string): string {
    if (!field) return ''
    
    // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('\n') || field.includes('"')) {
      return `"${field.replace(/"/g, '""')}"`
    }
    
    return field
  }

  static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  static exportSession(session: ChatSession, options: ExportOptions): void {
    const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const sessionName = session.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
    
    if (options.format === 'json') {
      const content = this.generateJSON(session, options)
      const filename = `${sessionName}_${timestamp}.json`
      this.downloadFile(content, filename, 'application/json')
    } else {
      const content = this.generateCSV(session, options)
      const filename = `${sessionName}_${timestamp}.csv`
      this.downloadFile(content, filename, 'text/csv')
    }
  }

  static getExportPreview(session: ChatSession, options: ExportOptions): string {
    if (options.format === 'json') {
      const content = this.generateJSON(session, options)
      return content.substring(0, 500) + (content.length > 500 ? '\n...' : '')
    } else {
      const content = this.generateCSV(session, options)
      const lines = content.split('\n')
      return lines.slice(0, 10).join('\n') + (lines.length > 10 ? '\n...' : '')
    }
  }

  // New method to get analysis timeline summary
  static getAnalysisTimeline(session: ChatSession): Array<{
    timestamp: Date
    provider: string
    messageCount: number
    phase: string
    keyInsight: string
  }> {
    if (!session.analysisHistory) return []

    return session.analysisHistory.map(analysis => ({
      timestamp: analysis.timestamp,
      provider: analysis.provider,
      messageCount: analysis.messageCountAtAnalysis,
      phase: analysis.conversationPhase,
      keyInsight: analysis.analysis.keyInsights[0] || 'No key insights recorded'
    }))
  }

  // Method to export just the analysis timeline
  static exportAnalysisTimeline(session: ChatSession): void {
    if (!session.analysisHistory || session.analysisHistory.length === 0) {
      throw new Error('No analysis history to export')
    }

    const timeline = this.getAnalysisTimeline(session)
    const content = JSON.stringify({
      sessionName: session.name,
      sessionId: session.id,
      exportedAt: new Date(),
      totalAnalyses: timeline.length,
      timeline: timeline,
      fullAnalysisHistory: session.analysisHistory
    }, null, 2)

    const timestamp = new Date().toISOString().split('T')[0]
    const sessionName = session.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
    const filename = `${sessionName}_analysis_timeline_${timestamp}.json`
    
    this.downloadFile(content, filename, 'application/json')
  }
}