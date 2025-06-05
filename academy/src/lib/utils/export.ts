// src/lib/utils/export.ts
import { ChatSession, Message } from '@/types/chat'

export interface ExportOptions {
  format: 'json' | 'csv'
  includeMetadata: boolean
  includeParticipantInfo: boolean
  includeSystemPrompts: boolean
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
        }))
      },
      exportedAt: new Date(),
      exportOptions: options
    }

    return JSON.stringify(exportData, null, 2)
  }

  static generateCSV(session: ChatSession, options: ExportOptions): string {
    const headers = [
      'timestamp',
      'participant_name',
      'participant_type',
      'participant_id',
      'content',
      'message_id'
    ]

    if (options.includeMetadata) {
      headers.push('temperature', 'max_tokens', 'response_time', 'system_prompt_used')
    }

    const rows = session.messages.map(message => {
      const baseRow = [
        message.timestamp.toISOString(),
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

      return baseRow
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
}