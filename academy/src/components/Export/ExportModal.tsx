// src/components/Export/ExportModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { ExportManager, ExportOptions } from '@/lib/utils/export'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  X, Download, FileText, Database, Eye, EyeOff, Settings, 
  MessageSquare, Users, Clock, CheckCircle2, FileDown,
  Copy, Check
} from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { currentSession } = useChatStore()
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    includeMetadata: true,
    includeParticipantInfo: true,
    includeSystemPrompts: false
  })
  const [showPreview, setShowPreview] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [copied, setCopied] = useState(false)

  // Update preview when options change
  useEffect(() => {
    if (currentSession && showPreview) {
      try {
        const preview = ExportManager.getExportPreview(currentSession, exportOptions)
        setPreviewContent(preview)
      } catch (error) {
        setPreviewContent('Error generating preview')
        console.error('Export preview error:', error)
      }
    }
  }, [currentSession, exportOptions, showPreview])

  const handleExport = async () => {
    if (!currentSession) return

    try {
      setIsExporting(true)
      
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500))
      
      ExportManager.exportSession(currentSession, exportOptions)
      
      // Show success feedback
      setTimeout(() => {
        onClose()
      }, 1000)
      
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export conversation. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCopyPreview = async () => {
    if (!previewContent) return
    
    try {
      await navigator.clipboard.writeText(previewContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setExportOptions(prev => ({ ...prev, [key]: value }))
  }

  if (!isOpen || !currentSession) return null

  const estimatedFileSize = currentSession.messages.reduce((size, msg) => 
    size + msg.content.length + msg.participantName.length + 100, 0
  )
  const fileSizeKB = Math.round(estimatedFileSize / 1024)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
              <FileDown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Export Conversation
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Download your research data
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-140px)]">
          {/* Options Panel */}
          <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="space-y-6">
              {/* Session Info */}
              <Card className="bg-gray-50 dark:bg-gray-700/50">
                <CardContent className="p-4">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Session Overview
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Name:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate ml-2">
                        {currentSession.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Messages:</span>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {currentSession.messages.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Participants:</span>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {currentSession.participants.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {Math.round((currentSession.updatedAt.getTime() - currentSession.createdAt.getTime()) / (1000 * 60))} min
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Est. Size:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        ~{fileSizeKB}KB
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Export Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => updateOption('format', 'json')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      exportOptions.format === 'json'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">JSON</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Structured data with full metadata
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => updateOption('format', 'csv')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      exportOptions.format === 'csv'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">CSV</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Spreadsheet format for analysis
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Export Options */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Export Options
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeMetadata}
                      onChange={(e) => updateOption('includeMetadata', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include Message Metadata
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Temperature, tokens, response times, etc.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeParticipantInfo}
                      onChange={(e) => updateOption('includeParticipantInfo', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include Participant Details
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Full participant profiles and settings
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeSystemPrompts}
                      onChange={(e) => updateOption('includeSystemPrompts', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include System Prompts
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        AI instruction prompts (sensitive data)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Export Preview
                </h3>
                <div className="flex items-center gap-2">
                  {previewContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPreview}
                      disabled={!showPreview}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2 text-green-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-2" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {showPreview ? (
                <div className="h-full p-6 overflow-y-auto">
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                    {previewContent || 'Generating preview...'}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-6">
                  <div>
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Eye className="h-8 w-8 text-gray-400" />
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Preview Your Export
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Click "Preview" to see how your exported data will look
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(true)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Show Preview
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={exportOptions.format === 'json' ? 'default' : 'secondary'}>
                {exportOptions.format.toUpperCase()}
              </Badge>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {currentSession.messages.length} messages • {currentSession.participants.length} participants
              </span>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={isExporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleExport}
                disabled={isExporting || currentSession.messages.length === 0}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export & Download
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}