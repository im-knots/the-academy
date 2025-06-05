// src/lib/api/conversation.ts
export class ConversationAPI {
  static async startConversation(sessionId: string, initialPrompt?: string) {
    try {
      const response = await fetch('/api/conversation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, initialPrompt }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start conversation')
      }

      return response.json()
    } catch (error) {
      console.error('Error starting conversation:', error)
      throw error
    }
  }

  static async pauseConversation(sessionId: string) {
    try {
      const response = await fetch('/api/conversation/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to pause conversation')
      }

      return response.json()
    } catch (error) {
      console.error('Error pausing conversation:', error)
      throw error
    }
  }

  static async resumeConversation(sessionId: string) {
    try {
      const response = await fetch('/api/conversation/resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to resume conversation')
      }

      return response.json()
    } catch (error) {
      console.error('Error resuming conversation:', error)
      throw error
    }
  }

  static async stopConversation(sessionId: string) {
    try {
      const response = await fetch('/api/conversation/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to stop conversation')
      }

      return response.json()
    } catch (error) {
      console.error('Error stopping conversation:', error)
      throw error
    }
  }
}