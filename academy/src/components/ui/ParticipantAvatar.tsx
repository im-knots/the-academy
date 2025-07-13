// src/components/ui/ParticipantAvatar.tsx
'use client'

import Image from 'next/image'
import { Settings, User } from 'lucide-react'

interface ParticipantAvatarProps {
  participantType: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'human' | 'moderator'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ParticipantAvatar({ 
  participantType, 
  size = 'md',
  className = '' 
}: ParticipantAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10', 
    lg: 'w-12 h-12'
  }

  const iconSizes = {
    sm: { width: 20, height: 20 },
    md: { width: 24, height: 24 },
    lg: { width: 28, height: 28 }
  }

  // Company logo mappings
  const getAvatarContent = () => {
    switch (participantType) {
      case 'claude':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-white flex items-center justify-center border-2 border-orange-200 shadow-sm ${className}`}>
            {/* Try to use company logo first, fallback to text */}
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src="/icons/anthropic-icon.png"
                alt="Anthropic Claude"
                width={iconSizes[size].width}
                height={iconSizes[size].height}
                className="object-contain"
                onError={(e) => {
                  // Fallback to text-based avatar if image fails
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="font-bold text-white text-xs">AI</span>'
                    parent.className += ' bg-gradient-to-br from-emerald-400 to-teal-500'
                  }
                }}
              />
            </div>
          </div>
        )
      
      case 'gpt':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-white flex items-center justify-center border-2 border-green-200 shadow-sm ${className}`}>
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src="/icons/openai-icon.png"
                alt="OpenAI GPT"
                width={iconSizes[size].width}
                height={iconSizes[size].height}
                className="object-contain"
                onError={(e) => {
                  // Fallback to text-based avatar if image fails
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="font-bold text-white text-xs">AI</span>'
                    parent.className += ' bg-gradient-to-br from-emerald-400 to-teal-500'
                  }
                }}
              />
            </div>
          </div>
        )

      case 'grok':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-white flex items-center justify-center border-2 border-green-200 shadow-sm ${className}`}>
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src="/icons/xai-icon.png"
                alt="xAI Grok"
                width={iconSizes[size].width}
                height={iconSizes[size].height}
                className="object-contain"
                onError={(e) => {
                  // Fallback to text-based avatar if image fails
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="font-bold text-white text-xs">AI</span>'
                    parent.className += ' bg-gradient-to-br from-emerald-400 to-teal-500'
                  }
                }}
              />
            </div>
          </div>
        )

      case 'gemini':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-white flex items-center justify-center border-2 border-green-200 shadow-sm ${className}`}>
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src="/icons/google-gemini-icon.png"
                alt="Google Gemini"
                width={iconSizes[size].width}
                height={iconSizes[size].height}
                className="object-contain"
                onError={(e) => {
                  // Fallback to text-based avatar if image fails
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="font-bold text-white text-xs">AI</span>'
                    parent.className += ' bg-gradient-to-br from-emerald-400 to-teal-500'
                  }
                }}
              />
            </div>
          </div>
        )
      case 'ollama':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-white flex items-center justify-center border-2 border-orange-200 shadow-sm ${className}`}>
            {/* Try to use company logo first, fallback to text */}
            <div className="flex items-center justify-center w-full h-full">
              <Image
                src="/icons/ollama-icon.png"
                alt="Ollama"
                width={iconSizes[size].width}
                height={iconSizes[size].height}
                className="object-contain"
                onError={(e) => {
                  // Fallback to text-based avatar if image fails
                  e.currentTarget.style.display = 'none'
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.innerHTML = '<span class="font-bold text-white text-xs">AI</span>'
                    parent.className += ' bg-gradient-to-br from-emerald-400 to-teal-500'
                  }
                }}
              />
            </div>
          </div>
        )
      
      case 'moderator':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm ${className}`}>
            <Settings className="h-5 w-5 text-white" />
          </div>
        )
      
      case 'human':
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm ${className}`}>
            <User className="h-5 w-5 text-white" />
          </div>
        )
      
      default:
        return (
          <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-sm ${className}`}>
            <span className="text-white text-xs font-bold">?</span>
          </div>
        )
    }
  }

  return getAvatarContent()
}