// src/lib/utils/export.ts
import { ChatSession, Message, AnalysisSnapshot, APIError } from '@/types/chat'

export interface ExportOptions {
  format: 'json' | 'csv'
  includeMetadata: boolean
  includeParticipantInfo: boolean
  includeSystemPrompts: boolean
  includeAnalysisHistory: boolean
  includeErrors: boolean
}

export interface ExportData {
  session: ChatSession
  analysisHistory?: AnalysisSnapshot[]
  errors?: APIError[]
  exportedAt: Date
  exportOptions: ExportOptions
}

export class ExportManager {
  static generateJSON(session: ChatSession, options: ExportOptions, analysisHistory?: AnalysisSnapshot[], errors?: APIError[]): string {
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
        analysisHistory: options.includeAnalysisHistory ? (analysisHistory || session.analysisHistory) : undefined
      },
      exportedAt: new Date(),
      exportOptions: options
    }

    // Add analysis history if provided and option is enabled
    if (options.includeAnalysisHistory && (analysisHistory || session.analysisHistory)) {
      exportData.analysisHistory = analysisHistory || session.analysisHistory
    }

    // Add errors if provided and option is enabled
    if (options.includeErrors && errors) {
      exportData.errors = errors
    }

    return JSON.stringify(exportData, null, 2)
  }

  static generateCSV(session: ChatSession, options: ExportOptions, analysisHistory?: AnalysisSnapshot[], errors?: APIError[]): string {
    const headers = [
      'timestamp',
      'entry_type', // 'message', 'analysis', or 'api_error'
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

    if (options.includeErrors) {
      headers.push('error_provider', 'error_operation', 'attempt_number', 'max_attempts')
    }

    // Combine messages, analysis snapshots, and errors for chronological export
    const chronologicalEntries: Array<{
      timestamp: Date
      type: 'message' | 'analysis' | 'api_error'
      data: Message | AnalysisSnapshot | APIError
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
    if (options.includeAnalysisHistory) {
      const analysisData = analysisHistory || session.analysisHistory
      if (analysisData) {
        analysisData.forEach(analysis => {
          chronologicalEntries.push({
            timestamp: analysis.timestamp,
            type: 'analysis',
            data: analysis
          })
        })
      }
    }

    // Add API errors if requested
    if (options.includeErrors && errors) {
      errors.forEach(error => {
        chronologicalEntries.push({
          timestamp: error.timestamp,
          type: 'api_error',
          data: error
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

        if (options.includeErrors) {
          baseRow.push('', '', '', '') // Empty error fields for messages
        }

        return baseRow
      } else if (entry.type === 'analysis') {
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
          baseRow.push('', '', '', '') // Empty metadata fields for analysis
        }

        if (options.includeAnalysisHistory) {
          baseRow.push(
            analysis.provider,
            analysis.conversationPhase,
            analysis.analysis.philosophicalDepth,
            analysis.id
          )
        }

        if (options.includeErrors) {
          baseRow.push('', '', '', '') // Empty error fields for analysis
        }

        return baseRow
      } else {
        // API Error
        const error = entry.data as APIError
        const baseRow = [
          error.timestamp.toISOString(),
          'api_error',
          error.provider.toUpperCase(),
          'error',
          error.participantId || 'unknown',
          this.escapeCSVField(error.error),
          error.id
        ]

        if (options.includeMetadata) {
          baseRow.push('', '', '', '') // Empty metadata fields for errors
        }

        if (options.includeAnalysisHistory) {
          baseRow.push('', '', '', '') // Empty analysis fields for errors
        }

        if (options.includeErrors) {
          baseRow.push(
            error.provider,
            error.operation,
            error.attempt.toString(),
            error.maxAttempts.toString()
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
      `# Analysis Snapshots: ${(analysisHistory || session.analysisHistory)?.length || 0}`,
      `# API Errors: ${errors?.length || 0}`,
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

  static exportSession(session: ChatSession, options: ExportOptions, analysisHistory?: AnalysisSnapshot[], errors?: APIError[]): string {
    const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const sessionName = session.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
    
    let content: string
    if (options.format === 'json') {
      content = this.generateJSON(session, options, analysisHistory, errors)
      const filename = `${sessionName}_${timestamp}.json`
      this.downloadFile(content, filename, 'application/json')
    } else {
      content = this.generateCSV(session, options, analysisHistory, errors)
      const filename = `${sessionName}_${timestamp}.csv`
      this.downloadFile(content, filename, 'text/csv')
    }
    
    return content
  }

  static getExportPreview(session: ChatSession, options: ExportOptions, analysisHistory?: AnalysisSnapshot[], errors?: APIError[]): string {
    if (options.format === 'json') {
      const content = this.generateJSON(session, options, analysisHistory, errors)
      return content.substring(0, 500) + (content.length > 500 ? '\n...' : '')
    } else {
      const content = this.generateCSV(session, options, analysisHistory, errors)
      const lines = content.split('\n')
      return lines.slice(0, 10).join('\n') + (lines.length > 10 ? '\n...' : '')
    }
  }

  static generatePreview(session: ChatSession, options: ExportOptions, analysisHistory?: AnalysisSnapshot[], errors?: APIError[]): string {
    if (options.format === 'json') {
      const preview = this.generateJSON(session, options, analysisHistory, errors)
      // Truncate for preview (first 2000 characters)
      return preview.length > 2000 ? preview.substring(0, 2000) + '\n\n... (truncated for preview)' : preview
    } else {
      const preview = this.generateCSV(session, options, analysisHistory, errors)
      // Show first 20 lines for CSV preview
      const lines = preview.split('\n')
      if (lines.length > 20) {
        return lines.slice(0, 20).join('\n') + '\n\n... (truncated for preview)'
      }
      return preview
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
  static exportAnalysisTimeline(session: ChatSession, analysisHistory?: AnalysisSnapshot[]): void {
    const analysisData = analysisHistory || session.analysisHistory
    if (!analysisData || analysisData.length === 0) {
      throw new Error('No analysis history to export')
    }

    const timeline = analysisData.map(analysis => ({
      timestamp: analysis.timestamp,
      provider: analysis.provider,
      messageCount: analysis.messageCountAtAnalysis,
      phase: analysis.conversationPhase,
      keyInsight: analysis.analysis.keyInsights[0] || 'No key insights recorded'
    }))

    const content = JSON.stringify({
      sessionName: session.name,
      sessionId: session.id,
      exportedAt: new Date(),
      totalAnalyses: timeline.length,
      timeline: timeline,
      fullAnalysisHistory: analysisData
    }, null, 2)

    const timestamp = new Date().toISOString().split('T')[0]
    const sessionName = session.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
    const filename = `${sessionName}_analysis_timeline_${timestamp}.json`
    
    this.downloadFile(content, filename, 'application/json')
  }
}