'use client'

import React, { useRef, useState, useCallback } from 'react'
import { Paperclip, X, FileText, Image, File, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// Supported file types and their MIME types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/x-latex',
  'text/x-latex',
  'application/x-tex',
  'text/x-tex'
]
const SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES]

// Max file size: 4MB (conservative limit that works across providers)
const MAX_FILE_SIZE = 4 * 1024 * 1024

export interface FileAttachment {
  file: File
  base64: string
  mimeType: string
  name: string
  size: number
  preview?: string // For images
}

interface FileUploadProps {
  onFileSelect: (attachment: FileAttachment | null) => void
  attachment: FileAttachment | null
  disabled?: boolean
  className?: string
}

export function FileUpload({ onFileSelect, attachment, disabled, className }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(async (file: File): Promise<FileAttachment | null> => {
    // Validate file type - also check by extension for LaTeX files which may have empty mime type
    const isLatexByExtension = /\.(tex|latex)$/i.test(file.name)
    if (!SUPPORTED_TYPES.includes(file.type) && !isLatexByExtension) {
      setError(`Unsupported file type: ${file.type}. Supported: images (JPEG, PNG, GIF, WebP) and documents (PDF, TXT, MD, JSON, LaTeX)`)
      return null
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum: 4MB`)
      return null
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1] // Remove data:mime;base64, prefix
        
        const attachment: FileAttachment = {
          file,
          base64,
          mimeType: file.type,
          name: file.name,
          size: file.size,
        }

        // Create preview for images
        if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
          attachment.preview = reader.result as string
        }

        resolve(attachment)
      }
      reader.onerror = () => {
        setError('Failed to read file')
        resolve(null)
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setIsProcessing(true)

    try {
      const attachment = await processFile(file)
      onFileSelect(attachment)
    } finally {
      setIsProcessing(false)
      // Reset input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = () => {
    onFileSelect(null)
    setError(null)
  }

  const getFileIcon = (mimeType: string) => {
    if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) return Image
    if (mimeType === 'application/pdf') return FileText
    return File
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      {attachment ? (
        <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
          {attachment.preview ? (
            <img 
              src={attachment.preview} 
              alt={attachment.name}
              className="w-10 h-10 object-cover rounded"
            />
          ) : (
            <div className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded">
              {React.createElement(getFileIcon(attachment.mimeType), { className: "h-5 w-5 text-gray-500" })}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {attachment.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(attachment.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isProcessing}
          className="h-10 w-10 p-0 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Attach file (images, PDF, JSON, LaTeX, text)"
        >
          {isProcessing ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Paperclip className="h-6 w-6" />
          )}
        </Button>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}

export { SUPPORTED_IMAGE_TYPES, SUPPORTED_DOCUMENT_TYPES, SUPPORTED_TYPES, MAX_FILE_SIZE }

