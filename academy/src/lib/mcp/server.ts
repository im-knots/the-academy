// src/lib/mcp/server.ts - Complete Updated with Direct API Calls & All Phase 1-6 Tools
import { JSONRPCRequest, JSONRPCResponse, JSONRPCError } from './types'
import { useChatStore } from '@/lib/stores/chatStore'
import { mcpAnalysisHandler } from './analysis-handler'
import { Participant, APIError, RetryConfig } from '@/types/chat'
import { ExperimentConfig, ExperimentRun } from '@/types/experiment'

// Store reference for server-side access
let mcpStoreReference: any = null

export function setMCPStoreReference(store: any): void {
  mcpStoreReference = store
}

export function getMCPStoreReference(): any {
  return mcpStoreReference || useChatStore.getState()
}

export class MCPServer {
  private experimentConfigs = new Map<string, ExperimentConfig>()
  private experimentRuns = new Map<string, ExperimentRun>()
  private activeExperimentSessions = new Map<string, Set<string>>() 
  private experimentIntervals = new Map<string, NodeJS.Timeout>()
  private errors: APIError[] = [];
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 8000,  // 8 seconds max
    retryCondition: (error: any) => {
      // Enhanced retry logic to match the client - catches more network errors
      const errorStr = error?.message?.toLowerCase() || '';
      const isNetworkError = (
        errorStr.includes('network') ||
        errorStr.includes('timeout') ||
        errorStr.includes('econnreset') ||
        errorStr.includes('enotfound') ||
        errorStr.includes('socket') ||
        errorStr.includes('fetch') ||
        errorStr.includes('failed to fetch') ||
        errorStr.includes('connection') ||
        errorStr.includes('abort') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.name === 'NetworkError' ||
        error?.name === 'TypeError' && errorStr.includes('fetch')
      );
      
      // Also retry on HTTP 5xx server errors
      const isServerError = error?.status >= 500 && error?.status < 600;
      
      // Don't retry on 4xx errors (client errors like auth failures)
      const isClientError = error?.status >= 400 && error?.status < 500;
      
      const shouldRetry = (isNetworkError || isServerError) && !isClientError;
      
      console.log(`🔍 MCP Server: Checking if error is retryable: "${errorStr}" (status: ${error?.status}) -> ${shouldRetry}`);
      return shouldRetry;
    }
  };
  private initialized = false
  private store: any = null

  async initialize(): Promise<void> {
    if (this.initialized) return

    // Initialize store reference
    this.updateStoreReference()
    
    this.initialized = true
    console.log('✅ MCP Server initialized with tools')
  }

  private updateStoreReference(): void {
    this.store = getMCPStoreReference()
  }

  private isAnalysisHandlerAvailable(): boolean {
    return typeof mcpAnalysisHandler !== 'undefined' && mcpAnalysisHandler !== null
  }

  private uninitializedError(id: any): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32002,
        message: 'Server not initialized'
      }
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context: {
      provider: 'claude' | 'openai' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere';
      operationName: string;
      sessionId?: string;
      participantId?: string;
    }
  ): Promise<T> {
    const finalConfig = { ...this.defaultRetryConfig, ...config };
    let lastError: any;

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        console.log(`🔄 ${context.provider.toUpperCase()} API attempt ${attempt}/${finalConfig.maxRetries + 1} for ${context.operationName}`);
        return await operation();
      } catch (error) {
        lastError = error;
        console.error(`❌ ${context.provider.toUpperCase()} API attempt ${attempt} failed:`, error);

        // Log error for export
        const apiError: APIError = {
          id: `${context.provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          provider: context.provider,
          operation: context.operationName,
          attempt,
          maxAttempts: finalConfig.maxRetries + 1,
          error: error instanceof Error ? error.message : String(error),
          sessionId: context.sessionId,
          participantId: context.participantId
        };
        this.errors.push(apiError);

        // Check if we should retry
        if (attempt <= finalConfig.maxRetries && finalConfig.retryCondition?.(error)) {
          const delay = Math.min(
            finalConfig.baseDelay * Math.pow(2, attempt - 1),
            finalConfig.maxDelay
          );
          console.log(`⏳ Retrying ${context.provider.toUpperCase()} API in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // No more retries or not retryable
        if (attempt > finalConfig.maxRetries) {
          console.error(`💥 ${context.provider.toUpperCase()} API failed after ${finalConfig.maxRetries + 1} attempts`);
        } else {
          console.error(`💥 ${context.provider.toUpperCase()} API error not retryable:`, error);
        }
        break;
      }
    }

    throw lastError;
  }

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (!this.initialized && request.method !== 'initialize') {
      return this.uninitializedError(request.id)
    }

    this.updateStoreReference()

    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params, request.id)
      case 'list_resources':
        return this.handleListResources(request.id)
      case 'read_resource':
        return this.handleReadResource(request.params, request.id)
      case 'list_tools':
        return this.handleListTools(request.id)
      case 'call_tool':
        return this.handleCallTool(request.params, request.id)
      case 'list_prompts':
        return this.handleListPrompts(request.id)
      case 'get_prompt':
        return this.handleGetPrompt(request.params, request.id)
      case 'refresh_resources':
        return this.handleRefreshResources(request.id)
      default:
        return {
          jsonrpc: '2.0',
          id : request.id ?? null,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        }
    }
  }

  private async handleInitialize(params: any, id: any): Promise<JSONRPCResponse> {
    await this.initialize()
    
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
          prompts: { listChanged: true }
        },
        serverInfo: {
          name: 'academy-mcp-server',
          version: '1.0.0'
        },
        instructions: 'Academy MCP Server initialized with complete Phase 1-6 functionality'
      }
    }
  }

  private async handleRefreshResources(id: any): Promise<JSONRPCResponse> {
    this.updateStoreReference()
    
    return {
      jsonrpc: '2.0',
      id,
      result: {
        success: true,
        message: 'Resources refreshed successfully'
      }
    }
  }

  private async handleListResources(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    this.updateStoreReference()
    
    const resources = [
      {
        uri: 'academy://sessions',
        name: 'Chat Sessions',
        description: 'All chat sessions in the Academy',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://current-session',
        name: 'Current Session',
        description: 'Currently active chat session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://participants',
        name: 'Session Participants',
        description: 'Participants in the current session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://messages',
        name: 'Session Messages',
        description: 'Messages in the current session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://analysis',
        name: 'Session Analysis',
        description: 'Analysis data for the current session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://experiments',
        name: 'Experiments',
        description: 'Bulk experiment configurations and runs',
        mimeType: 'application/json'
      }
    ]

    return {
      jsonrpc: '2.0',
      id,
      result: { resources }
    }
  }

  private async handleReadResource(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { uri } = params
    this.updateStoreReference()
    
    try {
      let content: any = {}
      
      switch (uri) {
        case 'academy://sessions':
          content = {
            sessions: this.store?.sessions || [],
            totalSessions: this.store?.sessions?.length || 0
          }
          break
          
        case 'academy://current-session':
          content = {
            currentSession: this.store?.currentSession || null,
            sessionId: this.store?.currentSession?.id || null
          }
          break
          
        case 'academy://participants':
          content = {
            participants: this.store?.currentSession?.participants || [],
            totalParticipants: this.store?.currentSession?.participants?.length || 0
          }
          break
          
        case 'academy://messages':
          content = {
            messages: this.store?.currentSession?.messages || [],
            totalMessages: this.store?.currentSession?.messages?.length || 0
          }
          break
          
        case 'academy://analysis':
          content = this.isAnalysisHandlerAvailable() ? 
            mcpAnalysisHandler.getAnalysisHistory(this.store?.currentSession?.id || '') : 
            { error: 'Analysis handler not available' }
          break
          
        case 'academy://experiments':
          content = {
            configs: Array.from(this.experimentConfigs.values()),
            runs: Array.from(this.experimentRuns.values()),
            totalConfigs: this.experimentConfigs.size,
            totalRuns: this.experimentRuns.size
          }
          break
          
        default:
          throw new Error(`Unknown resource URI: ${uri}`)
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        }
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async handleListTools(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const tools = [
      // AI Provider Tools
      {
        name: 'claude_chat',
        description: 'Send a message to Claude AI with direct API integration',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Claude' },
            messages: { type: 'array', description: 'Messages array for Claude API' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' },
            temperature: { type: 'number', description: 'Temperature for response generation' },
            maxTokens: { type: 'number', description: 'Maximum tokens for response' },
            model: { type: 'string', description: 'Claude model to use' }
          },
          required: []
        }
      },
      {
        name: 'openai_chat',
        description: 'Send a message to OpenAI GPT with direct API integration',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to GPT' },
            messages: { type: 'array', description: 'Messages array for OpenAI API' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            model: { type: 'string', description: 'GPT model to use (default: gpt-4)' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' },
            temperature: { type: 'number', description: 'Temperature for response generation' },
            maxTokens: { type: 'number', description: 'Maximum tokens for response' }
          },
          required: []
        }
      },
      {
        name: 'grok_chat',
        description: 'Direct Grok API access with exponential backoff retry',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Grok' },
            messages: { 
              type: 'array', 
              description: 'Array of messages for conversation context',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' }
                }
              }
            },
            systemPrompt: { type: 'string', description: 'System prompt for context' },
            model: { type: 'string', description: 'Grok model to use', default: 'grok-3-latest' },
            temperature: { type: 'number', description: 'Response creativity (0-1)', default: 0.7 },
            maxTokens: { type: 'number', description: 'Maximum response tokens', default: 2000 },
            sessionId: { type: 'string', description: 'Session ID for error tracking' },
            participantId: { type: 'string', description: 'Participant ID for error tracking' }
          }
        }
      },
      {
        name: 'gemini_chat',
        description: 'Direct Gemini API access with exponential backoff retry',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Gemini' },
            messages: { 
              type: 'array', 
              description: 'Array of messages for conversation context',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' }
                }
              }
            },
            systemPrompt: { type: 'string', description: 'System prompt for context' },
            model: { type: 'string', description: 'Gemini model to use', default: 'gemini-2.0-flash' },
            temperature: { type: 'number', description: 'Response creativity (0-1)', default: 0.7 },
            maxTokens: { type: 'number', description: 'Maximum response tokens', default: 2000 },
            sessionId: { type: 'string', description: 'Session ID for error tracking' },
            participantId: { type: 'string', description: 'Participant ID for error tracking' }
          }
        }
      },
      {
        name: 'ollama_chat',
        description: 'Direct Ollama API access for local models with exponential backoff retry',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Ollama' },
            messages: { 
              type: 'array', 
              description: 'Array of messages for conversation context',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' }
                }
              }
            },
            systemPrompt: { type: 'string', description: 'System prompt for context' },
            model: { type: 'string', description: 'Ollama model to use', default: 'llama2' },
            temperature: { type: 'number', description: 'Response creativity (0-1)', default: 0.7 },
            maxTokens: { type: 'number', description: 'Maximum response tokens', default: 2000 },
            sessionId: { type: 'string', description: 'Session ID for error tracking' },
            participantId: { type: 'string', description: 'Participant ID for error tracking' },
            ollamaUrl: { type: 'string', description: 'Ollama server URL', default: 'http://localhost:11434' }
          }
        }
      },
      {
        name: 'deepseek_chat',
        description: 'Send a message to Deepseek with direct API integration',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Deepseek' },
            messages: { type: 'array', description: 'Messages array for Deepseek API' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            model: { type: 'string', description: 'Deepseek model to use' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' },
            temperature: { type: 'number', description: 'Temperature for response generation' },
            maxTokens: { type: 'number', description: 'Maximum tokens for response' }
          },
          required: []
        }
      },
      {
        name: 'mistral_chat',
        description: 'Send a message to Mistral with direct API integration',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Mistral' },
            messages: { type: 'array', description: 'Messages array for Mistral API' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            model: { type: 'string', description: 'Mistral model to use' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' },
            temperature: { type: 'number', description: 'Temperature for response generation' },
            maxTokens: { type: 'number', description: 'Maximum tokens for response' }
          },
          required: []
        }
      },
      {
        name: 'cohere_chat',
        description: 'Direct Cohere API access with exponential backoff retry',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Cohere' },
            messages: { 
              type: 'array', 
              description: 'Messages array for Cohere API',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' }
                }
              }
            },
            systemPrompt: { type: 'string', description: 'System prompt for context' },
            model: { type: 'string', description: 'Cohere model to use', default: 'command-r-plus' },
            temperature: { type: 'number', description: 'Response creativity (0-1)', default: 0.7 },
            maxTokens: { type: 'number', description: 'Maximum response tokens', default: 2000 },
            sessionId: { type: 'string', description: 'Session ID for error tracking' },
            participantId: { type: 'string', description: 'Participant ID for error tracking' }
          },
          required: []
        }
      },

      {
        name: 'debug_store',
        description: 'Get debug information about the current store state',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'get_api_errors',
        description: 'Get API errors from the server',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Optional session ID to filter errors' }
          },
          required: []
        }
      },
      {
        name: 'clear_api_errors', 
        description: 'Clear API errors from the server',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Optional session ID to clear specific session errors' }
          },
          required: []
        }
      },

      // PHASE 1: Session Management Tools (Complete)
      {
        name: 'create_session',
        description: 'Create a new chat session',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            template: { type: 'string', description: 'Template to use' },
            participants: { type: 'array', description: 'Initial participants' }
          },
          required: ['name']
        }
      },
      {
        name: 'delete_session',
        description: 'Delete a chat session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to delete' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'update_session',
        description: 'Update session metadata',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            name: { type: 'string', description: 'New session name' },
            description: { type: 'string', description: 'New session description' },
            metadata: { type: 'object', description: 'Additional metadata' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'switch_current_session',
        description: 'Switch to a different session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to switch to' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'duplicate_session',
        description: 'Duplicate an existing session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to duplicate' },
            newName: { type: 'string', description: 'New session name' },
            includeMessages: { type: 'boolean', description: 'Include messages in duplicate' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'import_session',
        description: 'Import a session from data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionData: { type: 'object', description: 'Session data to import' },
            name: { type: 'string', description: 'Override session name' }
          },
          required: ['sessionData']
        }
      },
      {
        name: 'list_templates',
        description: 'List available session templates',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'create_session_from_template',
        description: 'Create a session from a template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            customizations: { type: 'object', description: 'Template customizations' }
          },
          required: ['templateId', 'name']
        }
      },

      // PHASE 1: Message Management Tools
      {
        name: 'send_message',
        description: 'Send a message to the current session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            content: { type: 'string', description: 'Message content' },
            participantId: { type: 'string', description: 'Participant ID' },
            participantName: { type: 'string', description: 'Participant name' },
            participantType: { type: 'string', description: 'Participant type' }
          },
          required: ['sessionId', 'content', 'participantId', 'participantName', 'participantType']
        }
      },

      // PHASE 2: Participant Management Tools (Complete)
      {
        name: 'add_participant',
        description: 'Add a participant to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            name: { type: 'string', description: 'Participant name' },
            type: { type: 'string', description: 'Participant type' },
            provider: { type: 'string', description: 'AI provider' },
            model: { type: 'string', description: 'AI model' },
            settings: { type: 'object', description: 'Participant settings' },
            characteristics: { type: 'object', description: 'Participant characteristics' }
          },
          required: ['sessionId', 'name', 'type']
        }
      },
      {
        name: 'remove_participant',
        description: 'Remove a participant from a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID to remove' }
          },
          required: ['sessionId', 'participantId']
        }
      },
      {
        name: 'update_participant',
        description: 'Update participant settings',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID' },
            updates: { type: 'object', description: 'Updates to apply' }
          },
          required: ['sessionId', 'participantId', 'updates']
        }
      },
      {
        name: 'update_participant_status',
        description: 'Update participant status',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID' },
            status: { type: 'string', description: 'New status' }
          },
          required: ['sessionId', 'participantId', 'status']
        }
      },
      {
        name: 'list_available_models',
        description: 'List available AI models',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Filter by provider' }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_participant_config',
        description: 'Get participant configuration',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID' }
          },
          required: ['sessionId', 'participantId']
        }
      },

      // PHASE 4: Conversation Control Tools (Complete)
      {
        name: 'start_conversation',
        description: 'Start a conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            initialPrompt: { type: 'string', description: 'Initial prompt' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'pause_conversation',
        description: 'Pause an active conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'resume_conversation',
        description: 'Resume a paused conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'stop_conversation',
        description: 'Stop a conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'get_conversation_status',
        description: 'Get conversation status',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'get_conversation_stats',
        description: 'Get conversation statistics',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },

      // PHASE 3: Message Control Tools
      {
        name: 'update_message',
        description: 'Update a message',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            messageId: { type: 'string', description: 'Message ID' },
            content: { type: 'string', description: 'New message content' }
          },
          required: ['sessionId', 'messageId', 'content']
        }
      },
      {
        name: 'delete_message',
        description: 'Delete a message',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            messageId: { type: 'string', description: 'Message ID' }
          },
          required: ['sessionId', 'messageId']
        }
      },
      {
        name: 'clear_messages',
        description: 'Clear all messages in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'inject_moderator_prompt',
        description: 'Inject a moderator prompt',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            prompt: { type: 'string', description: 'Moderator prompt' }
          },
          required: ['sessionId', 'prompt']
        }
      },

      // PHASE 5: Export Tools
      {
        name: 'export_session',
        description: 'Export session data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            format: { type: 'string', enum: ['json', 'csv'], description: 'Export format' },
            includeAnalysis: { type: 'boolean', description: 'Include analysis data' },
            includeMetadata: { type: 'boolean', description: 'Include metadata' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'export_analysis_timeline',
        description: 'Export analysis timeline',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            format: { type: 'string', enum: ['json', 'csv'], description: 'Export format' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'get_export_preview',
        description: 'Get export preview',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            format: { type: 'string', enum: ['json', 'csv'], description: 'Export format' }
          },
          required: ['sessionId']
        }
      },

      // PHASE 6: Live Analysis Tools
      {
        name: 'trigger_live_analysis',
        description: 'Trigger live analysis of a conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            analysisType: { type: 'string', description: 'Type of analysis' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'set_analysis_provider',
        description: 'Set the analysis provider',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Analysis provider' }
          },
          required: ['provider']
        }
      },
      {
        name: 'get_analysis_providers',
        description: 'Get available analysis providers',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'auto_analyze_conversation',
        description: 'Enable/disable auto analysis',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            enabled: { type: 'boolean', description: 'Enable auto analysis' }
          },
          required: ['sessionId', 'enabled']
        }
      },

      // Analysis Management Tools
      {
        name: 'save_analysis_snapshot',
        description: 'Save an analysis snapshot for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            analysis: { type: 'object', description: 'Analysis data' },
            analysisType: { type: 'string', description: 'Type of analysis' }
          },
          required: ['sessionId', 'analysis']
        }
      },
      {
        name: 'get_analysis_history',
        description: 'Get analysis history for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'clear_analysis_history',
        description: 'Clear analysis history for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'analyze_conversation',
        description: 'Analyze conversation patterns and extract insights',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            analysisType: { 
              type: 'string', 
              enum: ['sentiment', 'topics', 'engagement', 'patterns', 'full'],
              description: 'Type of analysis to perform'
            }
          },
          required: ['sessionId']
        }
      },
      // Experiment Management Tools
      {
        name: 'create_experiment',
        description: 'Create a new bulk experiment configuration',
        inputSchema: {
          type: 'object',
          properties: {
            config: { 
              type: 'object', 
              description: 'Experiment configuration object',
              properties: {
                name: { type: 'string', description: 'Experiment name' },
                participants: { 
                  type: 'array', 
                  description: 'Array of participant configurations',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', description: 'Participant type (claude, gpt, etc.)' },
                      name: { type: 'string', description: 'Participant name' },
                      model: { type: 'string', description: 'AI model to use' },
                      temperature: { type: 'number', description: 'Temperature setting' },
                      maxTokens: { type: 'number', description: 'Max tokens setting' },
                      personality: { type: 'string', description: 'Personality description' },
                      expertise: { type: 'string', description: 'Expertise description' }
                    }
                  }
                },
                systemPrompt: { type: 'string', description: 'System prompt for conversations' },
                totalSessions: { type: 'number', description: 'Total number of sessions to run' },
                concurrentSessions: { type: 'number', description: 'Number of concurrent sessions' },
                maxMessageCount: { type: 'number', description: 'Maximum messages per session' },
                sessionNamePattern: { type: 'string', description: 'Pattern for session names' },
                analysisProvider: { type: 'string', description: 'Analysis provider (claude or gpt)' },
                analysisContextSize: { type: 'number', description: 'Analysis context size' },
                errorRateThreshold: { type: 'number', description: 'Error rate threshold (0-1)' }
              }
            }
          },
          required: ['config']
        }
      },
      {
        name: 'get_experiments',
        description: 'Retrieve all experiment configurations',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'get_experiment',
        description: 'Get a specific experiment configuration and run status',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'update_experiment',
        description: 'Update an experiment configuration',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' },
            updates: { type: 'object', description: 'Updates to apply to the experiment' }
          },
          required: ['experimentId', 'updates']
        }
      },
      {
        name: 'delete_experiment',
        description: 'Delete an experiment configuration and stop if running',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },

      // Experiment Execution Tools
      {
        name: 'execute_experiment',
        description: 'Execute a bulk experiment - creates multiple sessions and runs conversations',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID to execute' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'get_experiment_status',
        description: 'Get the current status and progress of an experiment run',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'pause_experiment',
        description: 'Pause a running experiment',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'resume_experiment',
        description: 'Resume a paused experiment',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'stop_experiment',
        description: 'Stop a running experiment',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      },
      {
        name: 'get_experiment_results',
        description: 'Get aggregated results and analytics for a completed experiment',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' }
          },
          required: ['experimentId']
        }
      }
    ]

    console.log(`✅ MCP Server: Generated ${tools.length} tools`)

    return {
      jsonrpc: '2.0',
      id,
      result: { tools }
    }
  }

  private async handleCallTool(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { name, arguments: args } = params
    console.log(`🔧 MCP Server: Calling tool ${name} with args:`, args)

    try {
      let result: any

      switch (name) {
        // AI Provider Tools (Updated with direct API calls)
        case 'claude_chat':
          result = await this.callClaudeAPIDirect(args)
          break
        case 'openai_chat':
          result = await this.callOpenAIAPIDirect(args)
          break
        case 'grok_chat':
          result = await this.callGrokAPIDirect(args)
          break
        case 'gemini_chat':
          result = await this.callGeminiAPIDirect(args)
          break
        case 'ollama_chat':
          result = await this.callOllamaAPIDirect(args)
          break
        case 'deepseek_chat':
          result = await this.callDeepseekAPIDirect(args)
          break
        case 'mistral_chat':
          result = await this.callMistralAPIDirect(args)
          break
        case 'cohere_chat':
          result = await this.callCohereAPIDirect(args)
          break
        case 'debug_store':
          result = await this.toolDebugStore()
          break
        case 'get_api_errors':
          result = await this.toolGetAPIErrors(args)
          break
        case 'clear_api_errors':
          result = await this.toolClearAPIErrors(args)
          break
        // PHASE 1: Session Management Tools (Complete)
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
        case 'delete_session':
          result = await this.toolDeleteSession(args)
          break
        case 'update_session':
          result = await this.toolUpdateSession(args)
          break
        case 'switch_current_session':
          result = await this.toolSwitchCurrentSession(args)
          break
        case 'duplicate_session':
          result = await this.toolDuplicateSession(args)
          break
        case 'import_session':
          result = await this.toolImportSession(args)
          break
        case 'list_templates':
          result = await this.toolListTemplates(args)
          break
        case 'create_session_from_template':
          result = await this.toolCreateSessionFromTemplate(args)
          break
          
        // PHASE 1: Message Management Tools
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
          
        // PHASE 2: Participant Management Tools (Complete)
        case 'add_participant':
          result = await this.toolAddParticipant(args)
          break
        case 'remove_participant':
          result = await this.toolRemoveParticipant(args)
          break
        case 'update_participant':
          result = await this.toolUpdateParticipant(args)
          break
        case 'update_participant_status':
          result = await this.toolUpdateParticipantStatus(args)
          break
        case 'list_available_models':
          result = await this.toolListAvailableModels(args)
          break
        case 'get_participant_config':
          result = await this.toolGetParticipantConfig(args)
          break
          
        // PHASE 4: Conversation Control Tools (Complete)
        case 'start_conversation':
          result = await this.toolStartConversation(args)
          break
        case 'pause_conversation':
          result = await this.toolPauseConversation(args)
          break
        case 'resume_conversation':
          result = await this.toolResumeConversation(args)
          break
        case 'stop_conversation':
          result = await this.toolStopConversation(args)
          break
        case 'get_conversation_status':
          result = await this.toolGetConversationStatus(args)
          break
        case 'get_conversation_stats':
          result = await this.toolGetConversationStats(args)
          break
          
        // PHASE 3: Message Control Tools
        case 'update_message':
          result = await this.toolUpdateMessage(args)
          break
        case 'delete_message':
          result = await this.toolDeleteMessage(args)
          break
        case 'clear_messages':
          result = await this.toolClearMessages(args)
          break
        case 'inject_moderator_prompt':
          result = await this.toolInjectModeratorPrompt(args)
          break
          
        // PHASE 5: Export Tools
        case 'export_session':
          result = await this.toolExportSession(args)
          break
        case 'export_analysis_timeline':
          result = await this.toolExportAnalysisTimeline(args)
          break
        case 'get_export_preview':
          result = await this.toolGetExportPreview(args)
          break
          
        // PHASE 6: Live Analysis Tools
        case 'trigger_live_analysis':
          result = await this.toolTriggerLiveAnalysis(args)
          break
        case 'set_analysis_provider':
          result = await this.toolSetAnalysisProvider(args)
          break
        case 'get_analysis_providers':
          result = await this.toolGetAnalysisProviders(args)
          break
        case 'auto_analyze_conversation':
          result = await this.toolAutoAnalyzeConversation(args)
          break
          
        // Analysis Management Tools
        case 'save_analysis_snapshot':
          result = await this.toolSaveAnalysisSnapshot(args)
          break
        case 'get_analysis_history':
          result = await this.toolGetAnalysisHistory(args)
          break
        case 'clear_analysis_history':
          result = await this.toolClearAnalysisHistory(args)
          break
        case 'analyze_conversation':
          result = await this.toolAnalyzeConversation(args)
          break

        // Experiment tools
        case 'create_experiment':
          result = await this.toolCreateExperiment(args)
          break
        case 'get_experiments':
          result = await this.toolGetExperiments(args)
          break
        case 'get_experiment':
          result = await this.toolGetExperiment(args)
          break
        case 'update_experiment':
          result = await this.toolUpdateExperiment(args)
          break
        case 'delete_experiment':
          result = await this.toolDeleteExperiment(args)
          break
        case 'execute_experiment':
          result = await this.toolExecuteExperiment(args)
          break
        case 'get_experiment_status':
          result = await this.toolGetExperimentStatus(args)
          break
        case 'pause_experiment':
          result = await this.toolPauseExperiment(args)
          break
        case 'resume_experiment':
          result = await this.toolResumeExperiment(args)
          break
        case 'stop_experiment':
          result = await this.toolStopExperiment(args)
          break
        case 'get_experiment_results':
          result = await this.toolGetExperimentResults(args)
          break

        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      console.log(`✅ MCP Server: Tool ${name} executed successfully`)

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        }
      }
    } catch (error) {
      console.error(`❌ MCP Server: Tool ${name} execution failed:`, error)
      
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }
  }

  // ========================================
  // DIRECT AI PROVIDER METHODS (NEW)
  // ========================================

  private async callClaudeAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000,
      model = 'claude-3-5-sonnet-20241022'
    } = args;
    
    console.log('🔧 Using direct Claude API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Process messages
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
        } else {
          throw new Error('No valid message or messages provided to Claude API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Claude API');
        }
        
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error('Anthropic API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        // Transform messages to Claude format
        const claudeMessages = validMessages.map((msg: any) => {
          let role = msg.role;
          let content = msg.content;

          if (role === 'system') {
            role = 'user';
            content = `[System Context] ${content}`;
          }

          return {
            role: role === 'user' ? 'user' : 'assistant',
            content: content.trim()
          };
        });

        // Ensure conversation starts with user message
        if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
          claudeMessages.unshift({
            role: 'user',
            content: 'Please respond to the following conversation:'
          });
        }

        // Build request
        const requestBody: any = {  // <- ADD ': any' type annotation
          model: model,
          max_tokens: Math.min(maxTokens, 4000),
          temperature: Math.max(0, Math.min(1, temperature)),
          messages: claudeMessages
        };

        if (systemPrompt) {
          requestBody.system = systemPrompt;  // <- NOW THIS WORKS
        }

        console.log('🤖 Calling Claude API:', { 
          model, 
          messageCount: claudeMessages.length,
          temperature,
          maxTokens: requestBody.max_tokens
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Claude API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
          throw new Error('Invalid response format from Claude');
        }

        const content = data.content[0]?.text;
        if (!content) {
          throw new Error('No content in Claude response');
        }
        
        return {
          success: true,
          provider: 'claude',
          model: data.model,
          content: content,
          response: content,
          usage: data.usage,
          message: 'Claude API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'claude',
        operationName: 'claude_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callOpenAIAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      model = 'gpt-4', 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000
    } = args;
    
    console.log('🔧 Using direct OpenAI API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Handle both parameter formats
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
          
          // Add system prompt if provided
          if (systemPrompt) {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
          }
        } else {
          throw new Error('No valid message or messages provided to OpenAI API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to OpenAI API');
        }
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          throw new Error('OpenAI API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        const requestBody = {
          model: model,
          messages: validMessages,
          temperature: Math.max(0, Math.min(2, temperature)),
          max_tokens: Math.min(maxTokens, 4000)
        };

        console.log('🤖 Calling OpenAI API:', { 
          model, 
          messageCount: validMessages.length,
          temperature,
          maxTokens: requestBody.max_tokens
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenAI API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('Invalid response format from OpenAI');
        }

        const content = data.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in OpenAI response');
        }
        
        return {
          success: true,
          provider: 'openai',
          model: data.model,
          content: content,
          response: content,
          usage: data.usage,
          message: 'OpenAI API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'openai',
        operationName: 'openai_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callGrokAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000,
      model = 'grok-3-latest'
    } = args;
    
    console.log('🔧 Using direct Grok API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Process messages
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
        } else {
          throw new Error('No valid message or messages provided to Grok API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Grok API');
        }
        
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          throw new Error('xAI API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        // Transform messages to Grok format (similar to OpenAI format)
        const grokMessages = validMessages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }));

        // Add system prompt if provided
        if (systemPrompt) {
          grokMessages.unshift({
            role: 'system',
            content: systemPrompt
          });
        }

        const requestBody = {
          model,
          messages: grokMessages,
          temperature,
          max_tokens: maxTokens,
          stream: false
        };

        console.log(`🔄 Calling Grok API with model: ${model}`);

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error('Invalid response format from Grok API');
        }

        const content = data.choices[0].message.content;
        if (!content) {
          throw new Error('No content in Grok response');
        }
        
        return {
          success: true,
          provider: 'grok',
          model: data.model,
          content: content,
          response: content,
          usage: data.usage,
          message: 'Grok API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'grok' as const,
        operationName: 'grok_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callGeminiAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000,
      model = 'gemini-2.0-flash'
    } = args;
    
    console.log('🔧 Using direct Gemini API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Process messages
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
        } else {
          throw new Error('No valid message or messages provided to Gemini API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Gemini API');
        }
        
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
          throw new Error('Google AI API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        // Transform messages to Gemini format
        const geminiContents = validMessages.map((msg: any) => {
          let role = msg.role;
          
          // Gemini uses 'user' and 'model' roles
          if (role === 'assistant') {
            role = 'model';
          } else if (role === 'system') {
            // Gemini doesn't have system role, so we'll prepend it to the first user message
            role = 'user';
          }

          return {
            role,
            parts: [{ text: msg.content }]
          };
        });

        // Handle system prompt by prepending to first user message
        if (systemPrompt) {
          const firstUserIndex = geminiContents.findIndex(c => c.role === 'user');
          if (firstUserIndex >= 0) {
            geminiContents[firstUserIndex].parts[0].text = `${systemPrompt}\n\n${geminiContents[firstUserIndex].parts[0].text}`;
          } else {
            geminiContents.unshift({
              role: 'user',
              parts: [{ text: systemPrompt }]
            });
          }
        }

        const requestBody = {
          contents: geminiContents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            candidateCount: 1,
          }
        };

        console.log(`🔄 Calling Gemini API with model: ${model}`);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
          throw new Error('Invalid response format from Gemini API');
        }

        const content = data.candidates[0].content.parts[0]?.text;
        if (!content) {
          throw new Error('No content in Gemini response');
        }
        
        return {
          success: true,
          provider: 'gemini',
          model,
          content: content,
          response: content,
          usage: data.usageMetadata,
          message: 'Gemini API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'gemini' as const,
        operationName: 'gemini_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callOllamaAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000,
      model = 'llama2',
      ollamaUrl = 'http://localhost:11434'
    } = args;
    
    console.log('🦙 Using direct Ollama API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Process messages
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
          
          // Add system prompt if provided
          if (systemPrompt) {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
          }
        } else {
          throw new Error('No valid message or messages provided to Ollama API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Ollama API');
        }
        
        // Format messages for Ollama API
        const formattedMessages = processedMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
          content: msg.content
        }));

        const requestBody = {
          model: model,
          messages: formattedMessages,
          stream: false,
          options: {
            temperature: Math.max(0, Math.min(1, temperature)),
            num_predict: maxTokens
          }
        };

        console.log('🦙 Calling Ollama API:', { 
          model, 
          messageCount: formattedMessages.length,
          temperature,
          maxTokens,
          ollamaUrl
        });

        const response = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Ollama API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        if (!data.message || !data.message.content) {
          throw new Error('Invalid response format from Ollama');
        }
        
        return {
          success: true,
          provider: 'ollama',
          model: data.model || model,
          content: data.message.content,
          response: data.message.content,
          usage: {
            prompt_tokens: data.prompt_eval_count,
            completion_tokens: data.eval_count,
            total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
          },
          message: 'Ollama API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'ollama',
        operationName: 'ollama_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callDeepseekAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      model = 'deepseek-chat', 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000
    } = args;
    
    console.log('🔧 Using direct Deepseek API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Handle both parameter formats
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
          
          // Add system prompt if provided
          if (systemPrompt) {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
          }
        } else {
          throw new Error('No valid message or messages provided to Deepseek API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Deepseek API');
        }
        
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          throw new Error('Deepseek API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        const requestBody = {
          model: model,
          messages: validMessages,
          temperature: Math.max(0, Math.min(2, temperature)),
          max_tokens: Math.min(maxTokens, 4000)
        };

        console.log('🤖 Calling Deepseek API:', { 
          model, 
          messageCount: validMessages.length,
          temperature,
          maxTokens: requestBody.max_tokens
        });

        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Deepseek API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('Invalid response format from Deepseek');
        }

        const content = data.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in Deepseek response');
        }
        
        return {
          success: true,
          provider: 'deepseek',
          model: data.model,
          content: content,
          response: content,
          usage: data.usage,
          message: 'Deepseek API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'deepseek',
        operationName: 'deepseek_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callMistralAPIDirect(args: any): Promise<any> {
    const { 
      message, 
      messages, 
      systemPrompt, 
      model = 'mistral-large-latest', 
      sessionId, 
      participantId,
      temperature = 0.7,
      maxTokens = 2000
    } = args;
    
    console.log('🔧 Using direct Mistral API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Handle both parameter formats
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
          
          // Add system prompt if provided
          if (systemPrompt) {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
          }
        } else {
          throw new Error('No valid message or messages provided to Mistral API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Mistral API');
        }
        
        const apiKey = process.env.MISTRAL_API_KEY;
        if (!apiKey) {
          throw new Error('Mistral API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg => 
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        const requestBody = {
          model: model,
          messages: validMessages,
          temperature: Math.max(0, Math.min(2, temperature)),
          max_tokens: Math.min(maxTokens, 4000)
        };

        console.log('🤖 Calling Mistral API:', { 
          model, 
          messageCount: validMessages.length,
          temperature,
          maxTokens: requestBody.max_tokens
        });

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Mistral API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error('Invalid response format from Mistral');
        }

        const content = data.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in Mistral response');
        }
        
        return {
          success: true,
          provider: 'mistral',
          model: data.model,
          content: content,
          response: content,
          usage: data.usage,
          message: 'Mistral API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'mistral',
        operationName: 'mistral_chat',
        sessionId,
        participantId
      }
    );
  }

  private async callCohereAPIDirect(args: any): Promise<any> {
    const {
      message,
      messages,
      systemPrompt,
      model = 'command-r-plus',
      sessionId,
      participantId,
      temperature = 0.7,
      maxTokens = 2000
    } = args;
    
    console.log('🔧 Using direct Cohere API call with retry logic');
    
    return this.retryWithBackoff(
      async () => {
        // Handle both parameter formats
        let processedMessages: any[];
        
        if (messages && Array.isArray(messages)) {
          processedMessages = messages;
        } else if (message && typeof message === 'string') {
          processedMessages = [{ role: 'user', content: message }];
          
          // Add system prompt if provided
          if (systemPrompt) {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
          }
        } else {
          throw new Error('No valid message or messages provided to Cohere API');
        }
        
        if (!processedMessages || processedMessages.length === 0) {
          throw new Error('Empty messages provided to Cohere API');
        }
        
        const apiKey = process.env.COHERE_API_KEY;
        if (!apiKey) {
          throw new Error('Cohere API key not configured');
        }
        
        // Filter out empty messages and ensure proper format
        const validMessages = processedMessages.filter(msg =>
          msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
        );

        if (validMessages.length === 0) {
          throw new Error('No valid messages provided');
        }

        const requestBody = {
          model: model,
          messages: validMessages,
          temperature: Math.max(0, Math.min(1, temperature)), // Cohere uses 0-1 range
          max_tokens: Math.min(maxTokens, 4000),
          stream: false
        };

        console.log('🤖 Calling Cohere API:', {
          model,
          messageCount: validMessages.length,
          temperature,
          maxTokens: requestBody.max_tokens
        });

        const response = await fetch('https://api.cohere.ai/v2/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'X-Client-Name': 'academy-app'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Cohere API error: ${response.status} - ${errorText}`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        
        // COHERE-SPECIFIC: Extract text content from response format
        if (!data.message || !data.message.content) {
          throw new Error('Invalid response format from Cohere');
        }

        let content: string;
        
        // Cohere v2 returns content as array of content blocks
        if (Array.isArray(data.message.content)) {
          // Find first text block and extract its text
          const textBlock = data.message.content.find(block => block.type === 'text');
          if (!textBlock || !textBlock.text) {
            throw new Error('No text content found in Cohere response');
          }
          content = textBlock.text;
        } else if (typeof data.message.content === 'string') {
          // Fallback for older API versions
          content = data.message.content;
        } else {
          throw new Error('Unexpected content format from Cohere');
        }
        
        if (!content || !content.trim()) {
          throw new Error('Empty content in Cohere response');
        }
        
        return {
          success: true,
          provider: 'cohere',
          model: data.model || model,
          content: content,  // ← Now guaranteed to be a string
          response: content,
          usage: data.usage || {
            billed_tokens: data.meta?.billed_units?.input_tokens + data.meta?.billed_units?.output_tokens || 0,
            tokens: data.meta?.tokens || {}
          },
          response_id: data.response_id,
          generation_id: data.generation_id,
          message: 'Cohere API call completed successfully'
        };
      },
      {}, // Use default retry config
      {
        provider: 'cohere',
        operationName: 'cohere_chat',
        sessionId,
        participantId
      }
    );
  }

  // ========================================
  // DEBUG TOOLS
  // ========================================

  private async toolDebugStore(): Promise<any> {
    try {
      const debugInfo = this.getStoreDebugInfo()
      
      return {
        success: true,
        debug: debugInfo,
        message: 'Store debug information retrieved successfully'
      }
    } catch (error) {
      console.error('Error getting debug info:', error)
      throw new Error(`Failed to get debug info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private getStoreDebugInfo(): any {
    this.updateStoreReference()
    
    return {
      storeState: {
        hasStore: !!this.store,
        currentSessionId: this.store?.currentSession?.id || null,
        sessionsCount: this.store?.sessions?.length || 0,
        currentSessionMessagesCount: this.store?.currentSession?.messages?.length || 0,
        currentSessionParticipantsCount: this.store?.currentSession?.participants?.length || 0,
      },
      environment: {
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        nodeEnv: process.env.NODE_ENV,
      },
      analysis: {
        handlerAvailable: this.isAnalysisHandlerAvailable(),
        analysisData: this.isAnalysisHandlerAvailable() ? 
          mcpAnalysisHandler.getAnalysisHistory(this.store?.currentSession?.id || '') : 
          null
      },
      experiments: {
        configsCount: this.experimentConfigs.size,
        runsCount: this.experimentRuns.size,
        activeSessionsCount: this.activeExperimentSessions.size
      },
      timestamp: new Date().toISOString()
    }
  }

  private async toolGetAPIErrors(args: any): Promise<any> {
    try {
      const { sessionId } = args;
      
      let errors = this.getAPIErrors();
      
      if (sessionId) {
        errors = errors.filter(error => error.sessionId === sessionId);
      }
      
      return {
        success: true,
        errors: errors,
        count: errors.length,
        sessionId: sessionId || null,
        message: `Retrieved ${errors.length} API errors`
      };
    } catch (error) {
      console.error('Get API errors failed:', error);
      throw new Error(`Failed to get API errors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolClearAPIErrors(args: any): Promise<any> {
    try {
      const { sessionId } = args;
      
      const beforeCount = this.getAPIErrors().length;
      
      if (sessionId) {
        // Clear only session-specific errors
        this.errors = this.errors.filter(error => error.sessionId !== sessionId);
      } else {
        // Clear all errors
        this.clearAPIErrors();
      }
      
      const afterCount = this.getAPIErrors().length;
      const clearedCount = beforeCount - afterCount;
      
      return {
        success: true,
        clearedCount: clearedCount,
        remainingCount: afterCount,
        sessionId: sessionId || null,
        message: `Cleared ${clearedCount} API errors`
      };
    } catch (error) {
      console.error('Clear API errors failed:', error);
      throw new Error(`Failed to clear API errors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========================================
  // PHASE 1: SESSION MANAGEMENT TOOLS
  // ========================================

  private async toolCreateSession(args: any): Promise<any> {
    try {
      const { name, systemPrompt, analysisProvider, analysisContextSize } = args
      
      if (!name) {
        throw new Error('Session name is required')
      }

      const store = getMCPStoreReference()
      if (!store) {
        throw new Error('Store reference not available')
      }

      console.log(`📋 Creating new session: ${name}`)
      
      // Create the session with optional parameters
      const sessionData: any = {
        template: args.template || 'custom',
        initialPrompt: systemPrompt
      }
      
      const participants = args.participants || []

      const sessionId = store.createSession(
        name,
        args.description || '',
        sessionData,
        participants
      )

      console.log(`✅ Session created with ID: ${sessionId}`)

      // IMPORTANT: Don't try to switch to the session immediately
      // Just return the session ID and let the caller handle switching if needed
      
      // Get the created session directly from the store state
      const createdSession = store.getSessionById(sessionId)
      
      if (!createdSession) {
        // If we still can't find it, wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100))
        const retrySession = store.getSessionById(sessionId)
        
        if (!retrySession) {
          throw new Error(`Session ${sessionId} was created but cannot be found in store`)
        }
      }

      // Update analysis settings if provided
      if (analysisProvider || analysisContextSize) {
        const updates: any = {}
        if (analysisProvider) {
          updates.analysisProvider = analysisProvider
        }
        if (analysisContextSize) {
          updates.analysisContextSize = analysisContextSize
        }
        
        store.updateSession(sessionId, {
          moderatorSettings: {
            ...createdSession?.moderatorSettings,
            ...updates
          }
        })
      }

      return {
        success: true,
        sessionId: sessionId,
        session: store.getSessionById(sessionId),
        message: `Session "${name}" created successfully`
      }
    } catch (error) {
      console.error('Create session failed:', error)
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }


  private async toolDeleteSession(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Delete the session
      store.deleteSession(sessionId)

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        message: `Session "${session.name}" deleted successfully`
      }
    } catch (error) {
      console.error('Delete session failed:', error)
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateSession(args: any): Promise<any> {
    try {
      const { sessionId, name, description, metadata } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const updates: any = {}
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (metadata !== undefined) updates.metadata = { ...session.metadata, ...metadata }

      // Update the session
      store.updateSession(sessionId, updates)

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        updates: updates,
        message: `Session updated successfully`
      }
    } catch (error) {
      console.error('Update session failed:', error)
      throw new Error(`Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolSwitchCurrentSession(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      // Multiple attempts to get fresh store reference
      let sessionToSwitch = null;
      const maxAttempts = 5;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Force update store reference
        this.updateStoreReference();
        
        // Get fresh store reference each time
        const store = getMCPStoreReference();
        if (!store) {
          throw new Error('Store reference not available')
        }
        
        // Also try getting from the actual Zustand store directly
        const directStore = useChatStore.getState();
        
        // Try finding in both stores
        sessionToSwitch = store.sessions.find((s: any) => s.id === sessionId) || 
                        directStore.sessions.find((s: any) => s.id === sessionId);
        
        if (sessionToSwitch) {
          break;
        }
        
        // Wait before retry with exponential backoff
        const waitTime = Math.min(200 * Math.pow(2, attempt), 2000);
        console.log(`⏳ Session ${sessionId} not found, waiting ${waitTime}ms before retry ${attempt + 1}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      if (!sessionToSwitch) {
        // Last resort: check if session exists by trying to create it again
        // This might help if there's a race condition in session creation
        const directStore = useChatStore.getState();
        const allSessions = directStore.sessions;
        console.error(`Session ${sessionId} not found. Available sessions:`, allSessions.map(s => s.id));
        throw new Error(`Session ${sessionId} not found after ${maxAttempts} attempts`)
      }

      // Use the direct store to set current session
      const directStore = useChatStore.getState();
      directStore.setCurrentSession(sessionToSwitch);
      
      console.log(`✅ Switched to session: ${sessionToSwitch.name}`)

      return {
        success: true,
        sessionId: sessionId,
        sessionName: sessionToSwitch.name,
        message: 'Session switched successfully'
      }
    } catch (error) {
      console.error('Switch session failed:', error)
      throw new Error(`Failed to switch session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDuplicateSession(args: any): Promise<any> {
    try {
      const { sessionId, newName, includeMessages = false } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }
      
      this.updateStoreReference()
      const store = useChatStore.getState()
      
      const originalSession = store.sessions.find(s => s.id === sessionId)
      if (!originalSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Create new session name
      const duplicateName = newName || `${originalSession.name} (Copy)`
      
      // Create the session using the store's createSession method
      store.createSession(
        duplicateName,
        originalSession.description,
        undefined, // template parameter - not using since it doesn't exist on session type
        originalSession.participants.map(p => ({
          ...p,
          id: undefined, // Let the store generate new IDs
          joinedAt: undefined,
          messageCount: 0,
          lastActive: undefined
        }))
      )
      
      // Get the newly created session (it should be the current session after creation)
      const updatedStore = useChatStore.getState()
      const duplicateSession = updatedStore.currentSession
      
      if (!duplicateSession) {
        throw new Error('Failed to create duplicate session')
      }
      
      // If we need to include messages, add them to the new session
      if (includeMessages && originalSession.messages.length > 0) {
        originalSession.messages.forEach(msg => {
          store.addMessage({
            content: msg.content,
            participantId: msg.participantId,
            participantName: msg.participantName,
            participantType: msg.participantType
          })
        })
      }
      
      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())
      
      return {
        success: true,
        sessionId: duplicateSession.id,
        sessionData: duplicateSession,
        originalSessionId: sessionId,
        includeMessages: includeMessages,
        message: `Session duplicated successfully as "${duplicateName}"`
      }
    } catch (error) {
      console.error('Duplicate session failed:', error)
      throw new Error(`Failed to duplicate session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolImportSession(args: any): Promise<any> {
    try {
      const { sessionData, name } = args
      
      if (!sessionData || typeof sessionData !== 'object') {
        throw new Error('Valid session data is required')
      }

      this.updateStoreReference()
      
      // Prepare imported session
      const importedSession = {
        ...sessionData,
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name || sessionData.name || 'Imported Session',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Apply to store
      const store = useChatStore.getState()
      store.createSession(importedSession)
      store.setCurrentSession(importedSession.id)

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: importedSession.id,
        sessionData: importedSession,
        message: `Session "${importedSession.name}" imported successfully`
      }
    } catch (error) {
      console.error('Import session failed:', error)
      throw new Error(`Failed to import session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolListTemplates(args: any): Promise<any> {
    try {
      // Return available session templates
      const templates = [
        {
          id: 'consciousness-exploration',
          name: 'Consciousness Exploration',
          description: 'Explore the nature of consciousness through AI dialogue',
          participants: ['Claude (Philosopher)', 'GPT (Scientist)', 'Claude (Skeptic)']
        },
        {
          id: 'ethical-dilemmas',
          name: 'Ethical Dilemmas',
          description: 'Debate complex ethical scenarios',
          participants: ['Claude (Utilitarian)', 'GPT (Deontologist)', 'Claude (Virtue Ethicist)']
        },
        {
          id: 'creative-collaboration',
          name: 'Creative Collaboration',
          description: 'Collaborative creative writing and ideation',
          participants: ['Claude (Storyteller)', 'GPT (Editor)', 'Claude (Critic)']
        },
        {
          id: 'scientific-inquiry',
          name: 'Scientific Inquiry',
          description: 'Explore scientific questions and hypotheses',
          participants: ['Claude (Theorist)', 'GPT (Experimentalist)', 'Claude (Skeptic)']
        },
        {
          id: 'philosophical-debate',
          name: 'Philosophical Debate',
          description: 'Classic philosophical debates and thought experiments',
          participants: ['Claude (Rationalist)', 'GPT (Empiricist)', 'Claude (Pragmatist)']
        }
      ]

      return {
        success: true,
        templates: templates,
        count: templates.length,
        message: 'Session templates retrieved successfully'
      }
    } catch (error) {
      console.error('List templates failed:', error)
      throw new Error(`Failed to list templates: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolCreateSessionFromTemplate(args: any): Promise<any> {
    try {
      const { templateId, name, description, customizations } = args
      
      if (!templateId || !name) {
        throw new Error('Template ID and session name are required')
      }

      // Get template
      const templates = await this.toolListTemplates({})
      const template = templates.templates.find((t: any) => t.id === templateId)
      
      if (!template) {
        throw new Error(`Template ${templateId} not found`)
      }

      // Create session from template - DON'T access .template property on ChatSession
      const sessionArgs = {
        name: name,
        description: description || template.description,
        // Store template info in metadata instead of trying to access .template
        metadata: { 
          templateId: templateId,
          templateName: template.name 
        },
        participants: customizations?.participants || template.participants
      }

      // Create the session and get the actual ChatSession object
      const sessionId = await this.toolCreateSession(sessionArgs)
      
      // Get the created session object instead of passing string
      this.updateStoreReference()
      const store = useChatStore.getState()
      const createdSession = store.getSessionById(sessionId)
      
      if (createdSession) {
        store.setCurrentSession(createdSession) // Pass ChatSession object, not string
      }

      return {
        success: true,
        sessionId: sessionId,
        templateId: templateId,
        templateName: template.name,
        message: `Session "${name}" created from template "${template.name}"`
      }
    } catch (error) {
      console.error('Create session from template failed:', error)
      throw new Error(`Failed to create session from template: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 1: MESSAGE MANAGEMENT TOOLS
  // ========================================

  private async toolSendMessage(args: any): Promise<any> {
    try {
      const { sessionId, content, participantId, participantName, participantType } = args
      
      if (!sessionId || !content || !participantId || !participantName || !participantType) {
        throw new Error('Session ID, content, participant ID, name, and type are required')
      }

      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      const messageData = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: content,
        participantId: participantId,
        participantName: participantName,
        participantType: participantType,
        timestamp: new Date()
      }

      // If it's the current session, use the store method
      if (store.currentSession?.id === sessionId) {
        store.addMessage({
          content: content,
          participantId: participantId,
          participantName: participantName,
          participantType: participantType
        })
      } else {
        // For non-current sessions, add message directly
        const updatedMessages = [...targetSession.messages, messageData]
        store.updateSession(sessionId, { messages: updatedMessages })
      }
      
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        messageData: messageData,
        message: 'Message sent successfully'
      }
    } catch (error) {
      console.error('Send message failed:', error)
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 2: PARTICIPANT MANAGEMENT TOOLS
  // ========================================

  private async toolAddParticipant(args: any): Promise<any> {
    try {
      const { sessionId, name, type, provider, model, settings, characteristics } = args
      
      if (!sessionId || !name || !type) {
        throw new Error('Session ID, participant name, and type are required')
      }
      
      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Create participant data
      const participantData: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'> = {
        name: name,
        type: type,
        settings: {
          temperature: 0.7,
          maxTokens: 2000,
          responseDelay: 2000,
          model: model || 'claude-3-5-sonnet-20241022',
          ...settings // Allow overriding defaults with provided settings
        },
        characteristics: characteristics || {},
        status: 'active' as const,
        systemPrompt: '',
        avatar: undefined,
        color: undefined,
        lastActive: undefined
      }
      
      // If it's the current session, use the store method
      if (store.currentSession?.id === sessionId) {
        store.addParticipant(participantData)
      } else {
        // For non-current sessions, add participant directly to the session
        const newParticipant: Participant = {
          ...participantData,
          id: `participant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          joinedAt: new Date(),
          messageCount: 0
        }
        
        // Update the session with the new participant
        const updatedParticipants = [...targetSession.participants, newParticipant]
        store.updateSession(sessionId, { participants: updatedParticipants })
      }
      
      setMCPStoreReference(useChatStore.getState())
      
      return {
        success: true,
        sessionId: sessionId,
        participantData: participantData,
        message: `Participant "${name}" added successfully`
      }
    } catch (error) {
      console.error('Add participant failed:', error)
      throw new Error(`Failed to add participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolRemoveParticipant(args: any): Promise<any> {
    try {
      const { sessionId, participantId } = args
      
      if (!sessionId || !participantId) {
        throw new Error('Session ID and participant ID are required')
      }
      
      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      const participant = targetSession.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }
      
      // If it's the current session, use the store method
      if (store.currentSession?.id === sessionId) {
        store.removeParticipant(participantId)
      } else {
        // For non-current sessions, remove participant directly
        const updatedParticipants = targetSession.participants.filter(p => p.id !== participantId)
        store.updateSession(sessionId, { participants: updatedParticipants })
      }
      
      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())
      
      return {
        success: true,
        sessionId: sessionId,
        participantId: participantId,
        participantName: participant.name,
        message: `Participant "${participant.name}" removed successfully`
      }
    } catch (error) {
      console.error('Remove participant failed:', error)
      throw new Error(`Failed to remove participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateParticipant(args: any): Promise<any> {
    try {
      const { sessionId, participantId, updates } = args
      
      if (!sessionId || !participantId || !updates) {
        throw new Error('Session ID, participant ID, and updates are required')
      }
      
      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      const participant = targetSession.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }
      
      // If it's the current session, use the store method
      if (store.currentSession?.id === sessionId) {
        store.updateParticipant(participantId, updates)
      } else {
        // For non-current sessions, update participant directly
        const updatedParticipants = targetSession.participants.map(p => 
          p.id === participantId ? { ...p, ...updates } : p
        )
        store.updateSession(sessionId, { participants: updatedParticipants })
      }
      
      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())
      
      return {
        success: true,
        sessionId: sessionId,
        participantId: participantId,
        updates: updates,
        message: `Participant updated successfully`
      }
    } catch (error) {
      console.error('Update participant failed:', error)
      throw new Error(`Failed to update participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateParticipantStatus(args: any): Promise<any> {
    try {
      const { sessionId, participantId, status } = args
      
      if (!sessionId || !participantId || !status) {
        throw new Error('Session ID, participant ID, and status are required')
      }

      return await this.toolUpdateParticipant({
        sessionId,
        participantId,
        updates: { status }
      })
    } catch (error) {
      console.error('Update participant status failed:', error)
      throw new Error(`Failed to update participant status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolListAvailableModels(args: any): Promise<any> {
    try {
      const { provider } = args
      
      const models = {
        claude: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229'
        ],
        openai: [
          'gpt-4',
          'gpt-4-turbo',
          'gpt-3.5-turbo'
        ],
        grok: [
          'grok-3-latest',
          'grok-beta'
        ],
        gemini: [
          'gemini-2.0-flash',
          'gemini-1.5-pro',
          'gemini-1.5-flash'
        ],
        ollama: [
          'llama2',
          'mistral',
          'codellama'
        ],
        deepseek: [
          'deepseek-chat',
          'deepseek-coder'
        ],
        mistral: [
          'mistral-large-latest',
          'mistral-medium-latest',
          'mistral-small-latest'
        ],
        cohere: [
          'command-r-plus',
          'command-r',
          'command'
        ]
      }

      const result = provider ? 
        { [provider]: models[provider as keyof typeof models] || [] } : 
        models

      return {
        success: true,
        models: result,
        provider: provider || 'all',
        message: 'Available models retrieved successfully'
      }
    } catch (error) {
      console.error('List available models failed:', error)
      throw new Error(`Failed to list models: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetParticipantConfig(args: any): Promise<any> {
    try {
      const { sessionId, participantId } = args
      
      if (!sessionId || !participantId) {
        throw new Error('Session ID and participant ID are required')
      }
      
      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      const participant = targetSession.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }
      
      return {
        success: true,
        sessionId: sessionId,
        participantId: participantId,
        config: participant,
        message: 'Participant configuration retrieved successfully'
      }
    } catch (error) {
      console.error('Get participant config failed:', error)
      throw new Error(`Failed to get participant config: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 4: CONVERSATION CONTROL TOOLS
  // ========================================

  private async toolStartConversation(args: any): Promise<any> {
    try {
      const { sessionId, initialPrompt } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      store.updateSession(sessionId, { status: 'active' })

      // Add initial prompt if provided
      if (initialPrompt?.trim()) {
        // Create message data
        const messageData = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: initialPrompt.trim(),
          participantId: 'moderator',
          participantName: 'Research Moderator',
          participantType: 'moderator' as const,
          timestamp: new Date()
        }
        
        // If it's the current session, use the store method
        if (store.currentSession?.id === sessionId) {
          store.addMessage({
            content: initialPrompt.trim(),
            participantId: 'moderator',
            participantName: 'Research Moderator',
            participantType: 'moderator'
          })
        } else {
          // For non-current sessions, add message directly
          const updatedMessages = [...session.messages, messageData]
          store.updateSession(sessionId, { messages: updatedMessages })
        }
      }

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        status: 'active',
        initialPrompt: initialPrompt || null,
        message: 'Conversation started successfully'
      }
    } catch (error) {
      console.error('Start conversation failed:', error)
      throw new Error(`Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolPauseConversation(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      store.updateSession(sessionId, { status: 'paused' })

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        status: 'paused',
        message: 'Conversation paused successfully'
      }
    } catch (error) {
      console.error('Pause conversation failed:', error)
      throw new Error(`Failed to pause conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolResumeConversation(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      store.updateSession(sessionId, { status: 'active' })

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        status: 'active',
        message: 'Conversation resumed successfully'
      }
    } catch (error) {
      console.error('Resume conversation failed:', error)
      throw new Error(`Failed to resume conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolStopConversation(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      store.updateSession(sessionId, { status: 'completed' as const,})

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        status: 'completed',
        message: 'Conversation stopped successfully'
      }
    } catch (error) {
      console.error('Stop conversation failed:', error)
      throw new Error(`Failed to stop conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetConversationStatus(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      return {
        success: true,
        sessionId: sessionId,
        status: {
          sessionStatus: session.status,
          messageCount: session.messages.length,
          participantCount: session.participants.length,
          lastActivity: session.updatedAt,
          isActive: session.status === 'active'
        },
        message: 'Conversation status retrieved successfully'
      }
    } catch (error) {
      console.error('Get conversation status failed:', error)
      throw new Error(`Failed to get conversation status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetConversationStats(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Calculate stats
      const totalMessages = session.messages.length
      const participantStats = session.participants.map(p => {
        const messageCount = session.messages.filter(m => m.participantId === p.id).length
        return {
          participantId: p.id,
          participantName: p.name,
          messageCount: messageCount,
          participation: totalMessages > 0 ? (messageCount / totalMessages) * 100 : 0
        }
      })

      const stats = {
        totalMessages: totalMessages,
        totalParticipants: session.participants.length,
        averageMessagesPerParticipant: session.participants.length > 0 ? totalMessages / session.participants.length : 0,
        participantStats: participantStats,
        sessionDuration: session.updatedAt.getTime() - session.createdAt.getTime(),
        lastActivity: session.updatedAt
      }

      return {
        success: true,
        sessionId: sessionId,
        stats: stats,
        message: 'Conversation statistics retrieved successfully'
      }
    } catch (error) {
      console.error('Get conversation stats failed:', error)
      throw new Error(`Failed to get conversation stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 3: MESSAGE CONTROL TOOLS
  // ========================================

  private async toolUpdateMessage(args: any): Promise<any> {
    try {
      const { sessionId, messageId, content } = args
      
      if (!sessionId || !messageId || !content) {
        throw new Error('Session ID, message ID, and content are required')
      }

      this.updateStoreReference()
      
      // Note: This would require extending the store to support message updates
      // For now, return a placeholder implementation
      
      return {
        success: true,
        sessionId: sessionId,
        messageId: messageId,
        content: content,
        message: 'Message update not yet implemented'
      }
    } catch (error) {
      console.error('Update message failed:', error)
      throw new Error(`Failed to update message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDeleteMessage(args: any): Promise<any> {
    try {
      const { sessionId, messageId } = args
      
      if (!sessionId || !messageId) {
        throw new Error('Session ID and message ID are required')
      }

      this.updateStoreReference()
      
      // Note: This would require extending the store to support message deletion
      // For now, return a placeholder implementation
      
      return {
        success: true,
        sessionId: sessionId,
        messageId: messageId,
        message: 'Message deletion not yet implemented'
      }
    } catch (error) {
      console.error('Delete message failed:', error)
      throw new Error(`Failed to delete message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolClearMessages(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Clear messages by updating session with empty messages array
      store.updateSession(sessionId, { messages: [] })

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        message: 'Messages cleared successfully'
      }
    } catch (error) {
      console.error('Clear messages failed:', error)
      throw new Error(`Failed to clear messages: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolInjectModeratorPrompt(args: any): Promise<any> {
    try {
      const { sessionId, prompt } = args
      
      if (!sessionId || !prompt) {
        throw new Error('Session ID and prompt are required')
      }

      this.updateStoreReference()
      const store = useChatStore.getState()
      
      // Find the target session
      const targetSession = store.sessions.find(s => s.id === sessionId)
      if (!targetSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Create message data
      const messageData = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: prompt,
        participantId: 'moderator',
        participantName: 'Research Moderator',
        participantType: 'moderator' as const,
        timestamp: new Date()
      }
      
      // If it's the current session, use the store method
      if (store.currentSession?.id === sessionId) {
        store.addMessage({
          content: prompt,
          participantId: 'moderator',
          participantName: 'Research Moderator',
          participantType: 'moderator'
        })
      } else {
        // For non-current sessions, add message directly
        const updatedMessages = [...targetSession.messages, messageData]
        store.updateSession(sessionId, { messages: updatedMessages })
      }

      // Update MCP store reference
      setMCPStoreReference(useChatStore.getState())

      return {
        success: true,
        sessionId: sessionId,
        prompt: prompt,
        message: 'Moderator prompt injected successfully'
      }
    } catch (error) {
      console.error('Inject moderator prompt failed:', error)
      throw new Error(`Failed to inject moderator prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 5: EXPORT TOOLS
  // ========================================

  private async toolExportSession(args: any): Promise<any> {
    try {
      const { sessionId, format = 'json', includeAnalysis = false, includeMetadata = true } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      let exportData: any = {
        session: session
      }

      if (includeAnalysis && this.isAnalysisHandlerAvailable()) {
        exportData.analysis = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      }

      if (!includeMetadata) {
        delete exportData.session.metadata
      }

      // Format the data
      let formattedData: string
      if (format === 'csv') {
        // Simple CSV export of messages
        const headers = ['timestamp', 'participantName', 'participantType', 'content']
        const rows = session.messages.map(msg => [
          msg.timestamp.toISOString(),
          msg.participantName,
          msg.participantType,
          `"${msg.content.replace(/"/g, '""')}"`
        ])
        formattedData = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
      } else {
        formattedData = JSON.stringify(exportData, null, 2)
      }

      return {
        success: true,
        sessionId: sessionId,
        format: format,
        data: formattedData,
        size: formattedData.length,
        includeAnalysis: includeAnalysis,
        includeMetadata: includeMetadata,
        message: `Session exported successfully in ${format.toUpperCase()} format`
      }
    } catch (error) {
      console.error('Export session failed:', error)
      throw new Error(`Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolExportAnalysisTimeline(args: any): Promise<any> {
    try {
      const { sessionId, format = 'json' } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }
      
      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }
      
      const analysisData = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      let formattedData: string
      
      if (format === 'csv') {
        // CSV export of analysis timeline
        const headers = ['timestamp', 'analysisType', 'key', 'value']
        const rows: string[] = []
        
        // analysisData is already an array of AnalysisSnapshot
        analysisData.forEach((snapshot: any) => {
          const timestamp = snapshot.timestamp
          Object.entries(snapshot.analysis).forEach(([key, value]) => {
            rows.push([
              timestamp,
              snapshot.analysisType || 'unknown',
              key,
              `"${String(value).replace(/"/g, '""')}"`
            ].join(','))
          })
        })
        
        formattedData = [headers.join(','), ...rows].join('\n')
      } else {
        formattedData = JSON.stringify(analysisData, null, 2)
      }
      
      return {
        success: true,
        sessionId: sessionId,
        format: format,
        data: formattedData,
        size: formattedData.length,
        message: `Analysis timeline exported successfully in ${format.toUpperCase()} format`
      }
    } catch (error) {
      console.error('Export analysis timeline failed:', error)
      throw new Error(`Failed to export analysis timeline: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetExportPreview(args: any): Promise<any> {
    try {
      const { sessionId, format = 'json' } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      this.updateStoreReference()
      
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const preview = {
        sessionName: session.name,
        messageCount: session.messages.length,
        participantCount: session.participants.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        estimatedSize: format === 'json' ? 
          JSON.stringify(session).length : 
          session.messages.length * 100, // Rough CSV estimate
        format: format
      }

      return {
        success: true,
        sessionId: sessionId,
        preview: preview,
        message: 'Export preview generated successfully'
      }
    } catch (error) {
      console.error('Get export preview failed:', error)
      throw new Error(`Failed to get export preview: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 6: LIVE ANALYSIS TOOLS
  // ========================================

  private async toolTriggerLiveAnalysis(args: any): Promise<any> {
    try {
      const { sessionId, analysisType = 'full' } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      // Trigger analysis
      const analysisResult = await mcpAnalysisHandler.analyzeSession(sessionId, analysisType)

      return {
        success: true,
        sessionId: sessionId,
        analysisType: analysisType,
        analysis: analysisResult,
        message: 'Live analysis completed successfully'
      }
    } catch (error) {
      console.error('Trigger live analysis failed:', error)
      throw new Error(`Failed to trigger live analysis: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolSetAnalysisProvider(args: any): Promise<any> {
    try {
      const { provider } = args
      
      if (!provider) {
        throw new Error('Provider is required')
      }

      // Set analysis provider (placeholder implementation)
      return {
        success: true,
        provider: provider,
        message: `Analysis provider set to ${provider}`
      }
    } catch (error) {
      console.error('Set analysis provider failed:', error)
      throw new Error(`Failed to set analysis provider: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisProviders(args: any): Promise<any> {
    try {
      const providers = [
        {
          id: 'claude',
          name: 'Claude',
          description: 'Anthropic Claude for in-depth analysis',
          capabilities: ['sentiment', 'topics', 'patterns', 'philosophical depth']
        },
        {
          id: 'gpt',
          name: 'GPT',
          description: 'OpenAI GPT for comprehensive analysis',
          capabilities: ['sentiment', 'topics', 'engagement', 'structure']
        }
      ]

      return {
        success: true,
        providers: providers,
        count: providers.length,
        message: 'Analysis providers retrieved successfully'
      }
    } catch (error) {
      console.error('Get analysis providers failed:', error)
      throw new Error(`Failed to get analysis providers: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolAutoAnalyzeConversation(args: any): Promise<any> {
    try {
      const { sessionId, enabled } = args
      
      if (!sessionId || enabled === undefined) {
        throw new Error('Session ID and enabled flag are required')
      }

      // Set auto-analysis flag (placeholder implementation)
      return {
        success: true,
        sessionId: sessionId,
        autoAnalysisEnabled: enabled,
        message: `Auto-analysis ${enabled ? 'enabled' : 'disabled'} for session`
      }
    } catch (error) {
      console.error('Auto analyze conversation failed:', error)
      throw new Error(`Failed to set auto-analysis: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // ANALYSIS MANAGEMENT TOOLS
  // ========================================

  private async toolSaveAnalysisSnapshot(args: any): Promise<any> {
    try {
      const { sessionId, analysis, analysisType = 'manual', messageCountAtAnalysis, participantCountAtAnalysis, provider, conversationPhase, conversationContext } = args
      
      if (!sessionId || !analysis) {
        throw new Error('Session ID and analysis data are required')
      }

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      // Prepare the complete analysis data structure that matches AnalysisSnapshot
      const analysisData = {
        messageCountAtAnalysis: messageCountAtAnalysis || 0,
        participantCountAtAnalysis: participantCountAtAnalysis || 0,
        provider: provider || 'unknown',
        conversationPhase: conversationPhase || 'exploration',
        analysis: analysis, // This contains mainTopics, keyInsights, etc.
        conversationContext: conversationContext || {
          recentMessages: 0,
          activeParticipants: [],
          sessionStatus: 'active',
          moderatorInterventions: 0
        }
      }

      console.log(`💾 MCP Server: Saving analysis snapshot for session ${sessionId}`, analysisData)

      // Save analysis snapshot - AWAIT the async method
      const snapshotId = await mcpAnalysisHandler.saveAnalysisSnapshot(sessionId, analysisData)

      console.log(`✅ MCP Server: Analysis snapshot saved successfully: ${snapshotId}`)

      return {
        success: true,
        sessionId: sessionId,
        snapshotId: snapshotId,
        analysisType: analysisType,
        timestamp: new Date().toISOString(),
        message: 'Analysis snapshot saved successfully'
      }
    } catch (error) {
      console.error('Save analysis snapshot failed:', error)
      throw new Error(`Failed to save analysis snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      // Get analysis history - this returns AnalysisSnapshot[]
      const snapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)

      return {
        success: true,
        sessionId: sessionId,
        snapshots: snapshots, // Fix: Don't access .snapshots property
        count: snapshots.length, // Fix: Don't access .snapshots property
        message: 'Analysis history retrieved successfully'
      }
    } catch (error) {
      console.error('Get analysis history failed:', error)
      throw new Error(`Failed to get analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolClearAnalysisHistory(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      // Clear analysis history
      mcpAnalysisHandler.clearAnalysisHistory(sessionId)

      return {
        success: true,
        sessionId: sessionId,
        message: 'Analysis history cleared successfully'
      }
    } catch (error) {
      console.error('Clear analysis history failed:', error)
      throw new Error(`Failed to clear analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    try {
      const { sessionId, analysisType = 'full' } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      // Perform conversation analysis
      const history = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      const analysis = {
        sessionId,
        analysisType,
        snapshotCount: history.length,
        lastAnalysis: history.length > 0 ? history[history.length - 1].timestamp : null,
        message: 'Basic analysis completed'
      }

      return {
        success: true,
        sessionId: sessionId,
        analysisType: analysisType,
        analysis: analysis,
        message: 'Conversation analysis completed successfully'
      }
    } catch (error) {
      console.error('Analyze conversation failed:', error)
      throw new Error(`Failed to analyze conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // EXPERIMENT MANAGEMENT TOOLS
  // ========================================

  private async toolCreateExperiment(args: any): Promise<any> {
    try {
      const { config } = args
      
      if (!config || !config.name || !config.startingPrompt || !config.participants?.length) {
        throw new Error('Invalid experiment configuration')
      }

      // Generate ID if not provided
      const experimentId = config.id || `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      const experimentConfig: ExperimentConfig = {
        ...config,
        id: experimentId,
        createdAt: config.createdAt ? new Date(config.createdAt) : new Date(),
        lastModified: new Date()
      }

      this.experimentConfigs.set(experimentId, experimentConfig)

      return {
        success: true,
        experimentId,
        config: experimentConfig,
        message: 'Experiment configuration saved successfully'
      }
    } catch (error) {
      console.error('Create experiment failed:', error)
      throw new Error(`Failed to create experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetExperiments(args: any): Promise<any> {
    try {
      const experiments = Array.from(this.experimentConfigs.values())
      
      return {
        success: true,
        experiments,
        total: experiments.length
      }
    } catch (error) {
      console.error('Get experiments failed:', error)
      throw new Error(`Failed to get experiments: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const config = this.experimentConfigs.get(experimentId)
      const run = this.experimentRuns.get(experimentId)
      
      if (!config) {
        throw new Error(`Experiment ${experimentId} not found`)
      }

      return {
        success: true,
        config,
        run: run || null
      }
    } catch (error) {
      console.error('Get experiment failed:', error)
      throw new Error(`Failed to get experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateExperiment(args: any): Promise<any> {
    try {
      const { experimentId, updates } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const config = this.experimentConfigs.get(experimentId)
      if (!config) {
        throw new Error(`Experiment ${experimentId} not found`)
      }

      const updatedConfig = {
        ...config,
        ...updates,
        id: experimentId, // Preserve ID
        lastModified: new Date()
      }

      this.experimentConfigs.set(experimentId, updatedConfig)

      return {
        success: true,
        config: updatedConfig,
        message: 'Experiment updated successfully'
      }
    } catch (error) {
      console.error('Update experiment failed:', error)
      throw new Error(`Failed to update experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDeleteExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      // Stop experiment if running
      if (this.experimentRuns.has(experimentId)) {
        await this.toolStopExperiment({ experimentId })
      }

      this.experimentConfigs.delete(experimentId)
      this.experimentRuns.delete(experimentId)
      this.activeExperimentSessions.delete(experimentId)

      return {
        success: true,
        experimentId,
        message: 'Experiment deleted successfully'
      }
    } catch (error) {
      console.error('Delete experiment failed:', error)
      throw new Error(`Failed to delete experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolExecuteExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const config = this.experimentConfigs.get(experimentId)
      if (!config) {
        throw new Error(`Experiment ${experimentId} not found`)
      }

      // Check if already running
      if (this.experimentRuns.has(experimentId) && this.experimentRuns.get(experimentId)!.status === 'running') {
        throw new Error('Experiment is already running')
      }

      // Initialize experiment run (for tracking purposes)
      const run: ExperimentRun = {
        id: `run-${Date.now()}`,
        configId: experimentId,
        status: 'planned', // Changed from 'pending' to 'planned'
        startedAt: new Date(),
        totalSessions: config.totalSessions,
        completedSessions: 0,
        failedSessions: 0,
        activeSessions: 0,
        sessionIds: [],
        errorRate: 0,
        errors: [],
        progress: 0
      }

      this.experimentRuns.set(experimentId, run)

      // Generate execution plan instead of running async
      const executionPlan = this.generateExecutionPlan(experimentId, config)

      return {
        success: true,
        experimentId,
        runId: run.id,
        status: 'planned',
        executionPlan,
        message: 'Experiment execution plan generated. Use the plan to execute steps individually.'
      }
    } catch (error) {
      console.error('Execute experiment failed:', error)
      throw new Error(`Failed to generate execution plan: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private generateExecutionPlan(experimentId: string, config: ExperimentConfig): any {
    const steps: any[] = []
    
    console.log(`🔬 Generating execution plan for experiment: ${config.name}`)
    console.log(`📊 Config details:`, {
      totalSessions: config.totalSessions,
      maxMessageCount: config.maxMessageCount,
      participants: config.participants.map(p => ({
        type: p.type,
        name: p.name,
        model: p.model
      }))
    })
    
    // Generate steps for each session
    for (let i = 0; i < config.totalSessions; i++) {
      const sessionName = config.sessionNamePattern
        .replace('<n>', (i + 1).toString())
        .replace('<date>', new Date().toISOString().split('T')[0])
        .replace('<experiment>', config.name)
        .replace('{index}', (i + 1).toString())
        .replace('{date}', new Date().toISOString().split('T')[0])
        .replace('{experiment}', config.name)
      
      const sessionSteps = [
        {
          step: `create_session_${i + 1}`,
          tool: 'create_session',
          description: `Create session ${i + 1}/${config.totalSessions}`,
          params: {
            name: sessionName,
            systemPrompt: config.startingPrompt,
            analysisProvider: config.analysisProvider,
            analysisContextSize: config.analysisContextSize,
            metadata: {
              experimentId,
              sessionIndex: i,
              experimentName: config.name
            }
          }
        }
      ]

      // Add participant steps
      config.participants.forEach((participant, pIndex) => {
        let provider = participant.type
        if (participant.type === 'gpt') {
          provider = 'openai'
        } else if (participant.type === 'claude') {
          provider = 'anthropic'
        }

        sessionSteps.push({
          step: `add_participant_${i + 1}_${pIndex + 1}`,
          tool: 'add_participant',
          description: `Add participant ${participant.name} to session ${i + 1}`,
          params: {
            sessionId: `<session_${i + 1}_id>`,
            name: participant.name,
            type: participant.type,
            provider: provider,
            model: participant.model,
            settings: {
              temperature: participant.temperature || 0.7,
              maxTokens: participant.maxTokens || 1000,
              responseDelay: 2000,
              model: participant.model
            },
            characteristics: {
              personality: participant.personality || '',
              expertise: participant.expertise || ''
            }
          },
          dependsOn: `create_session_${i + 1}`
        })
      })

      // Add conversation steps
      sessionSteps.push({
        step: `start_conversation_${i + 1}`,
        tool: 'start_conversation',
        description: `Start conversation in session ${i + 1}`,
        params: {
          sessionId: `<session_${i + 1}_id>`,
          initialPrompt: config.startingPrompt
        },
        dependsOn: config.participants.map((_, pIndex) => `add_participant_${i + 1}_${pIndex + 1}`)
      })

      // If maxMessageCount specified, generate message exchange steps
      if (config.maxMessageCount && config.maxMessageCount > 0) {
        let messageCount = 0
        
        // Generate message steps in rounds (each participant gets a turn)
        while (messageCount < config.maxMessageCount) {
          config.participants.forEach((participant, pIndex) => {
            if (messageCount < config.maxMessageCount) {
              messageCount++
              
              // Map participant type to the correct chat tool
              let chatTool = 'claude_chat' // default
              switch (participant.type) {
                case 'claude':
                  chatTool = 'claude_chat'
                  break
                case 'gpt':
                case 'openai':
                  chatTool = 'openai_chat'
                  break
                case 'grok':
                  chatTool = 'grok_chat'
                  break
                case 'gemini':
                  chatTool = 'gemini_chat'
                  break
                case 'ollama':
                  chatTool = 'ollama_chat'
                  break
                case 'deepseek':
                  chatTool = 'deepseek_chat'
                  break
                case 'mistral':
                  chatTool = 'mistral_chat'
                  break
                case 'cohere':
                  chatTool = 'cohere_chat'
                  break
              }
              
              sessionSteps.push({
                step: `message_${i + 1}_${messageCount}`,
                tool: chatTool,
                description: `Message ${messageCount} from ${participant.name} in session ${i + 1}`,
                params: {
                  message: messageCount === 1 ? config.startingPrompt : 'Continue the conversation based on previous messages',
                  sessionId: `<session_${i + 1}_id>`,
                  participantId: `<participant_${i + 1}_${pIndex + 1}_id>`,
                  temperature: participant.temperature || 0.7,
                  maxTokens: participant.maxTokens || 1000,
                  model: participant.model,
                  systemPrompt: `You are ${participant.name}. ${participant.personality || ''} ${participant.expertise || ''}`
                },
                dependsOn: messageCount === 1 ? `start_conversation_${i + 1}` : `message_${i + 1}_${messageCount - 1}`,
                critical: false
              })
            }
          })
        }
      }

      // Add analysis step if configured
      if (config.analysisProvider) {
        sessionSteps.push({
          step: `analyze_session_${i + 1}`,
          tool: 'trigger_live_analysis',
          description: `Analyze session ${i + 1}`,
          params: {
            sessionId: `<session_${i + 1}_id>`,
            analysisType: 'full'
          },
          dependsOn: config.maxMessageCount > 0 ? `message_${i + 1}_${config.maxMessageCount}` : `start_conversation_${i + 1}`
        })
      }

      steps.push(...sessionSteps)
    }

    // Add final aggregation step
    steps.push({
      step: 'aggregate_results',
      tool: 'get_experiment_results',
      description: 'Get aggregated experiment results',
      params: {
        experimentId
      },
      dependsOn: steps.filter(s => s.step.startsWith('analyze_session_') || s.step.startsWith('start_conversation_')).map(s => s.step)
    })

    return {
      experimentId,
      experimentName: config.name,
      totalSteps: steps.length,
      estimatedDuration: `${Math.ceil(config.totalSessions * 2)} minutes`,
      concurrency: config.concurrentSessions || 1,
      steps,
      metadata: {
        totalSessions: config.totalSessions,
        participantsPerSession: config.participants.length,
        maxMessagesPerSession: config.maxMessageCount || 0,
        analysisEnabled: !!config.analysisProvider
      },
      instructions: [
        'Execute steps in order, respecting dependencies',
        'Replace placeholder IDs (e.g., <session_1_id>) with actual IDs from previous steps',
        `Process up to ${config.concurrentSessions || 1} sessions concurrently`,
        'Monitor error rate and stop if it exceeds threshold',
        'Save intermediate results for recovery'
      ]
    }
  }

  private async toolSwitchCurrentSessionWithRetry(args: any): Promise<any> {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Update store reference before each attempt
        this.updateStoreReference();
        
        const result = await this.toolSwitchCurrentSession(args);
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        console.log(`⚠️ Session switch attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        // Force a store refresh
        const store = getMCPStoreReference();
        if (store) {
          // Trigger a re-render/refresh by accessing the store
          store.sessions.length; // Access to trigger any lazy loading
        }
      }
    }
  }

  private async createAndRunExperimentSession(
    experimentId: string,
    config: ExperimentConfig,
    sessionIndex: number,
    sessionIds: Set<string>
  ): Promise<void> {
    console.log(`🔬 Creating experiment session ${sessionIndex + 1}/${config.totalSessions}`)
    
    try {
      // Generate session name with proper placeholder replacement
      const sessionName = config.sessionNamePattern
        .replace('<n>', (sessionIndex + 1).toString())
        .replace('<date>', new Date().toISOString().split('T')[0])
        .replace('<experiment>', config.name)
        // Also support the {bracket} style if needed
        .replace('{index}', (sessionIndex + 1).toString())
        .replace('{date}', new Date().toISOString().split('T')[0])
        .replace('{experiment}', config.name)
      
      // Create the session
      const createResult = await this.toolCreateSession({
        name: sessionName,
        startingPrompt: config.startingPrompt,
        analysisProvider: config.analysisProvider,
        analysisContextSize: config.analysisContextSize
      })
      
      if (!createResult.success || !createResult.sessionId) {
        throw new Error(`Failed to create session ${sessionIndex + 1}`)
      }
      
      const sessionId = createResult.sessionId
      sessionIds.add(sessionId)
      
      // Update run with new session ID
      const run = this.experimentRuns.get(experimentId)
      if (run) {
        run.sessionIds.push(sessionId)
        this.experimentRuns.set(experimentId, run)
      }
      
      // IMPORTANT: Increase wait time and update store reference multiple times
      // This ensures proper synchronization with concurrent sessions
      await new Promise(resolve => setTimeout(resolve, 500)) // Increased from 200ms
      this.updateStoreReference()
      
      await new Promise(resolve => setTimeout(resolve, 500)) // Additional wait
      this.updateStoreReference()
      
      // Switch to the new session with enhanced retry logic
      await this.toolSwitchCurrentSessionWithRetry({ sessionId })
      
      // Add participants with proper formatting
      for (const participantConfig of config.participants) {
        // Map participant type to provider if needed
        let provider = participantConfig.type;
        if (participantConfig.type === 'gpt') {
          provider = 'openai';
        } else if (participantConfig.type === 'claude') {
          provider = 'anthropic';
        }
        
        const addResult = await this.toolAddParticipant({
          sessionId,
          name: participantConfig.name,
          type: participantConfig.type,
          provider: provider,
          model: participantConfig.model,
          settings: {
            temperature: participantConfig.temperature || 0.7,
            maxTokens: participantConfig.maxTokens || 1000,
            responseDelay: 2000,
            model: participantConfig.model
          },
          characteristics: {
            personality: participantConfig.personality || '',
            expertise: participantConfig.expertise || ''
          }
        })
        
        if (!addResult.success) {
          throw new Error(`Failed to add participant ${participantConfig.name}`)
        }
      }
      
      // TODO: Add conversation logic here
      // For now, just mark as complete
      console.log(`✅ Session ${sessionIndex + 1} setup complete`)
      
    } catch (error) {
      console.error(`❌ Experiment session ${sessionIndex + 1} failed:`, error)
      throw error
    }
  }

  private async toolGetExperimentStatus(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const run = this.experimentRuns.get(experimentId)
      const config = this.experimentConfigs.get(experimentId)
      
      if (!config) {
        throw new Error(`Experiment ${experimentId} not found`)
      }
      
      // If there's a run, calculate actual progress from completed sessions
      if (run) {
        this.updateStoreReference()
        const store = useChatStore.getState()
        
        // Count sessions that belong to this experiment
        const experimentSessions = store.sessions.filter(s => 
          s.metadata?.experimentId === experimentId
        )
        
        // Update run statistics based on actual sessions
        run.completedSessions = experimentSessions.length
        run.progress = (run.completedSessions / config.totalSessions) * 100
        run.sessionIds = experimentSessions.map(s => s.id)
        
        // Update status based on progress
        if (run.status === 'planned' && run.completedSessions > 0) {
          run.status = 'running'
        } else if (run.completedSessions >= config.totalSessions) {
          run.status = 'completed'
          run.completedAt = new Date()
        }
        
        this.experimentRuns.set(experimentId, run)
      }
      
      return {
        success: true,
        status: run || null,
        config: config
      }
    } catch (error) {
      console.error('Get experiment status failed:', error)
      throw new Error(`Failed to get experiment status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolPauseExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const run = this.experimentRuns.get(experimentId)
      if (!run) {
        throw new Error(`Experiment run ${experimentId} not found`)
      }

      if (run.status !== 'running') {
        throw new Error(`Cannot pause experiment with status: ${run.status}`)
      }

      run.status = 'paused'
      run.pausedAt = new Date()
      this.experimentRuns.set(experimentId, run)

      return {
        success: true,
        experimentId,
        status: 'paused',
        message: 'Experiment marked as paused. Stop executing plan steps to pause execution.'
      }
    } catch (error) {
      console.error('Pause experiment failed:', error)
      throw new Error(`Failed to pause experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolResumeExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const run = this.experimentRuns.get(experimentId)
      if (!run) {
        throw new Error(`Experiment run ${experimentId} not found`)
      }

      if (run.status !== 'paused') {
        throw new Error(`Cannot resume experiment with status: ${run.status}`)
      }

      run.status = 'running'
      run.resumedAt = new Date()
      this.experimentRuns.set(experimentId, run)

      return {
        success: true,
        experimentId,
        status: 'running',
        message: 'Experiment marked as running. Continue executing plan steps to resume.'
      }
    } catch (error) {
      console.error('Resume experiment failed:', error)
      throw new Error(`Failed to resume experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolStopExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const run = this.experimentRuns.get(experimentId)
      if (!run) {
        throw new Error(`Experiment run ${experimentId} not found`)
      }

      run.status = 'completed'
      run.completedAt = new Date()
      this.experimentRuns.set(experimentId, run)

      return {
        success: true,
        experimentId,
        status: 'completed',
        message: 'Experiment marked as completed. No further plan steps should be executed.'
      }
    } catch (error) {
      console.error('Stop experiment failed:', error)
      throw new Error(`Failed to stop experiment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetExperimentResults(args: any): Promise<any> {
    try {
      const { experimentId } = args
      
      if (!experimentId) {
        throw new Error('Experiment ID is required')
      }

      const config = this.experimentConfigs.get(experimentId)
      const run = this.experimentRuns.get(experimentId)
      
      if (!config || !run) {
        throw new Error(`Experiment ${experimentId} not found`)
      }

      this.updateStoreReference()
      const store = useChatStore.getState()

      // Get all sessions for this experiment
      const experimentSessions = store.sessions.filter(s => 
        s.metadata?.experimentId === experimentId || 
        (run.sessionIds && run.sessionIds.includes(s.id))
      )

      // Calculate aggregate statistics
      const totalMessages = experimentSessions.reduce((sum, session) => sum + (session.messages?.length || 0), 0)
      const avgMessagesPerSession = experimentSessions.length > 0 ? totalMessages / experimentSessions.length : 0
      
      const participantStats = new Map<string, { messageCount: number, sessions: number }>()
      
      experimentSessions.forEach(session => {
        session.participants?.forEach(participant => {
          const key = `${participant.type}-${participant.settings?.model || 'default'}`
          if (!participantStats.has(key)) {
            participantStats.set(key, { messageCount: 0, sessions: 0 })
          }
          const stats = participantStats.get(key)!
          const messages = session.messages?.filter(m => m.participantId === participant.id).length || 0
          stats.messageCount += messages
          stats.sessions++
        })
      })

      return {
        success: true,
        results: {
          config,
          run,
          sessions: experimentSessions.map(s => ({
            id: s.id,
            name: s.name,
            messageCount: s.messages?.length || 0,
            participantCount: s.participants?.length || 0,
            status: s.status,
            createdAt: s.createdAt,
            lastActivity: s.updatedAt
          })),
          aggregateStats: {
            totalSessions: experimentSessions.length,
            totalMessages,
            avgMessagesPerSession,
            participantStats: Object.fromEntries(participantStats),
            errorRate: run.errorRate,
            successRate: run.totalSessions > 0 ? run.completedSessions / run.totalSessions : 0
          }
        }
      }
    } catch (error) {
      console.error('Get experiment results failed:', error)
      throw new Error(`Failed to get experiment results: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private addExperimentError(experimentId: string, type: string, message: string, sessionId?: string) {
    const run = this.experimentRuns.get(experimentId)
    if (!run) return

    const existingError = run.errors.find(e => e.type === type && e.message === message)
    if (existingError) {
      existingError.count++
      existingError.lastOccurred = new Date()
      if (sessionId && !existingError.sessionId) {
        existingError.sessionId = sessionId
      }
    } else {
      run.errors.push({
        type,
        message,
        sessionId,
        count: 1,
        lastOccurred: new Date()
      })
    }

    this.experimentRuns.set(experimentId, run)
  }

  // ========================================
  // PROMPT HANDLING (Future)
  // ========================================

  private async handleListPrompts(id: any): Promise<JSONRPCResponse> {
    return {
      jsonrpc: '2.0',
      id,
      result: { prompts: [] }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: 'Prompts not implemented yet'
      }
    }
  }

  getAPIErrors(): APIError[] {
    return [...this.errors];
  }

  clearAPIErrors(): void {
    this.errors = [];
  }

  getSessionErrors(sessionId: string): APIError[] {
    return this.errors.filter(error => error.sessionId === sessionId);
  }
}