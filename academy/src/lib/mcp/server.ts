// src/lib/mcp/server.ts - Updated with PostgreSQL
import { JSONRPCRequest, JSONRPCResponse, JSONRPCError } from './types'
import { mcpAnalysisHandler } from './analysis-handler'
import { Participant, APIError, RetryConfig } from '@/types/chat'
import { ExperimentConfig, ExperimentRun } from '@/types/experiment'
import { db } from '@/lib/db/client'
import { 
  sessions, 
  messages, 
  participants, 
  analysisSnapshots,
  experiments,
  experimentRuns,
  apiErrors 
} from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'

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

  async initialize(): Promise<void> {
    if (this.initialized) return

    // Initialize database connection
    await db.query.sessions.findFirst() // Test connection
    
    this.initialized = true
    console.log('✅ MCP Server initialized with PostgreSQL')
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
        instructions: 'Academy MCP Server initialized with PostgreSQL backend'
      }
    }
  }

  private async handleRefreshResources(id: any): Promise<JSONRPCResponse> {
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
    
    try {
      let content: any = {}
      
      switch (uri) {
        case 'academy://sessions':
          const allSessions = await db.query.sessions.findMany({
            orderBy: [desc(sessions.updatedAt)]
          })
          content = {
            sessions: allSessions,
            totalSessions: allSessions.length
          }
          break
          
        case 'academy://current-session':
          const currentSession = await db.query.sessions.findFirst({
            where: eq(sessions.status, 'active'),
            orderBy: [desc(sessions.updatedAt)]
          })
          content = {
            currentSession: currentSession || null,
            sessionId: currentSession?.id || null
          }
          break
          
        case 'academy://participants':
          const activeSession = await db.query.sessions.findFirst({
            where: eq(sessions.status, 'active'),
            orderBy: [desc(sessions.updatedAt)]
          })
          if (activeSession) {
            const sessionParticipants = await db.query.participants.findMany({
              where: eq(participants.sessionId, activeSession.id)
            })
            content = {
              participants: sessionParticipants,
              totalParticipants: sessionParticipants.length
            }
          } else {
            content = {
              participants: [],
              totalParticipants: 0
            }
          }
          break
          
        case 'academy://messages':
          const msgSession = await db.query.sessions.findFirst({
            where: eq(sessions.status, 'active'),
            orderBy: [desc(sessions.updatedAt)]
          })
          if (msgSession) {
            const sessionMessages = await db.query.messages.findMany({
              where: eq(messages.sessionId, msgSession.id),
              orderBy: [messages.timestamp]
            })
            content = {
              messages: sessionMessages,
              totalMessages: sessionMessages.length
            }
          } else {
            content = {
              messages: [],
              totalMessages: 0
            }
          }
          break
          
        case 'academy://analysis':
          const analysisSession = await db.query.sessions.findFirst({
            where: eq(sessions.status, 'active'),
            orderBy: [desc(sessions.updatedAt)]
          })
          if (analysisSession) {
            const snapshots = await db.query.analysisSnapshots.findMany({
              where: eq(analysisSnapshots.sessionId, analysisSession.id),
              orderBy: [desc(analysisSnapshots.timestamp)]
            })
            content = snapshots
          } else {
            content = []
          }
          break
          
        case 'academy://experiments':
          const allExperiments = await db.query.experiments.findMany()
          const allRuns = await db.query.experimentRuns.findMany()
          content = {
            configs: allExperiments,
            runs: allRuns,
            totalConfigs: allExperiments.length,
            totalRuns: allRuns.length
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
        description: 'Get debug information about the current database state',
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

      // Session Management Tools
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
        name: 'get_session',
        description: 'Get a specific session by ID',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'get_sessions',
        description: 'Get all sessions',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status (active, inactive, completed, etc.)' }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_current_session_id', 
        description: 'Get the ID of the currently active session',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'log_api_error',
        description: 'Log an API error for tracking',
        inputSchema: {
          type: 'object',
          properties: {
            error: { 
              type: 'object', 
              description: 'API error object',
              properties: {
                id: { type: 'string' },
                timestamp: { type: 'string' },
                provider: { type: 'string' },
                operation: { type: 'string' },
                attempt: { type: 'number' },
                maxAttempts: { type: 'number' },
                error: { type: 'string' },
                sessionId: { type: 'string' },
                participantId: { type: 'string' }
              }
            }
          },
          required: ['error']
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

      // Message Management Tools
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

      // Participant Management Tools (Complete)
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

      // Conversation Control Tools
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

      // Message Control Tools
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

      // Export Tools
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

      // Live Analysis Tools
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
        name: 'create_experiment_run',
        description: 'Create a new experiment run',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' },
            run: { 
              type: 'object', 
              description: 'Run configuration object',
              properties: {
                status: { type: 'string', description: 'Run status' },
                progress: { type: 'number', description: 'Progress percentage' },
                totalSessions: { type: 'number', description: 'Total sessions to run' },
                completedSessions: { type: 'number', description: 'Completed sessions count' },
                failedSessions: { type: 'number', description: 'Failed sessions count' },
                averageMessageCount: { type: 'number', description: 'Average message count' },
                results: { type: 'object', description: 'Run results object' }
              },
              required: ['status']
            }
          },
          required: ['experimentId', 'run']
        }
      },
      {
        name: 'update_experiment_run',
        description: 'Update experiment run status and progress',
        inputSchema: {
          type: 'object',
          properties: {
            experimentId: { type: 'string', description: 'Experiment ID' },
            updates: { type: 'object', description: 'Updates to apply' }
          },
          required: ['experimentId', 'updates']
        }
      },
      {
        name: 'get_experiment_run',
        description: 'Get experiment run details',
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
        // AI Provider Tools
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
        // Session Management Tools
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
        case 'get_session':
          result = await this.toolGetSession(args)
          break
        case 'get_sessions':
          result = await this.toolGetSessions(args)
          break
        case 'get_current_session_id':
          result = await this.toolGetCurrentSessionId(args)
          break
        case 'log_api_error':
          result = await this.toolLogAPIError(args)
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
          
        // Message Management Tools
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
          
        // Participant Management Tools
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
          
        // Conversation Control Tools
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
          
        // Message Control Tools
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
          
        // Export Tools
        case 'export_session':
          result = await this.toolExportSession(args)
          break
        case 'export_analysis_timeline':
          result = await this.toolExportAnalysisTimeline(args)
          break
        case 'get_export_preview':
          result = await this.toolGetExportPreview(args)
          break
          
        // Live Analysis Tools
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
        case 'get_experiments':
          result = await this.toolGetExperiments(args)
          break
        case 'get_experiment':
          result = await this.toolGetExperiment(args)
          break
        case 'create_experiment':
          result = await this.toolCreateExperiment(args)
          break
        case 'create_experiment_run':
          result = await this.toolCreateExperimentRun(args)
          break
        case 'update_experiment_run':
          result = await this.toolUpdateExperimentRun(args)
          break
        case 'get_experiment_run':
          result = await this.toolGetExperimentRun(args)
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
  // DIRECT AI PROVIDER METHODS (KEEPING EXISTING)
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
  // DEBUG TOOLS (UPDATED FOR POSTGRES)
  // ========================================

  private async toolDebugStore(): Promise<any> {
    try {
      const debugInfo = await this.getStoreDebugInfo()
      
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

  private async getStoreDebugInfo(): Promise<any> {
    // Get counts from database
    const [sessionCount] = await db
      .select({ count: db.count() })
      .from(sessions)
    
    const currentSession = await db.query.sessions.findFirst({
      where: eq(sessions.status, 'active'),
      orderBy: [desc(sessions.updatedAt)]
    })
    
    let messageCount = 0
    let participantCount = 0
    
    if (currentSession) {
      const [msgCount] = await db
        .select({ count: db.count() })
        .from(messages)
        .where(eq(messages.sessionId, currentSession.id))
      messageCount = msgCount.count
      
      const [partCount] = await db
        .select({ count: db.count() })
        .from(participants)
        .where(eq(participants.sessionId, currentSession.id))
      participantCount = partCount.count
    }
    
    const [experimentCount] = await db
      .select({ count: db.count() })
      .from(experiments)
    
    const [runCount] = await db
      .select({ count: db.count() })
      .from(experimentRuns)
    
    return {
      storeState: {
        hasStore: true,
        currentSessionId: currentSession?.id || null,
        sessionsCount: sessionCount.count,
        currentSessionMessagesCount: messageCount,
        currentSessionParticipantsCount: participantCount,
      },
      environment: {
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        nodeEnv: process.env.NODE_ENV,
        database: 'PostgreSQL'
      },
      analysis: {
        handlerAvailable: this.isAnalysisHandlerAvailable(),
      },
      experiments: {
        configsCount: experimentCount.count,
        runsCount: runCount.count,
        activeSessionsCount: this.activeExperimentSessions.size
      },
      timestamp: new Date().toISOString()
    }
  }

  private async toolGetAPIErrors(args: any): Promise<any> {
    try {
      const { sessionId } = args;
      
      let errors: APIError[]
      
      if (sessionId) {
        errors = await db.query.apiErrors.findMany({
          where: eq(apiErrors.sessionId, sessionId),
          orderBy: [desc(apiErrors.timestamp)]
        })
      } else {
        errors = await db.query.apiErrors.findMany({
          orderBy: [desc(apiErrors.timestamp)],
          limit: 100
        })
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
      
      if (sessionId) {
        // Clear only session-specific errors
        await db.delete(apiErrors).where(eq(apiErrors.sessionId, sessionId))
      } else {
        // Clear all errors
        await db.delete(apiErrors)
      }
      
      return {
        success: true,
        sessionId: sessionId || null,
        message: `Cleared API errors${sessionId ? ` for session ${sessionId}` : ''}`
      };
    } catch (error) {
      console.error('Clear API errors failed:', error);
      throw new Error(`Failed to clear API errors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========================================
  // PHASE 1: SESSION MANAGEMENT TOOLS (UPDATED FOR POSTGRES)
  // ========================================

  private async toolCreateSession(args: any): Promise<any> {
    try {
      const { name, description, template, participants: participantData } = args
      
      if (!name) {
        throw new Error('Session name is required')
      }

      console.log(`📋 Creating new session: ${name}`)
      
      // Create session in database
      const [newSession] = await db.insert(sessions).values({
        name,
        description: description || '',
        status: 'active',
        metadata: {
          template: template || 'custom',
          tags: [],
          starred: false,
          archived: false
        },
        moderatorSettings: {
          autoMode: false,
          interventionTriggers: [],
          sessionTimeout: 3600,
          maxMessagesPerParticipant: 100,
          allowParticipantToParticipantMessages: true,
          moderatorPrompts: {
            welcome: "Welcome to The Academy. Let's explore together.",
            intervention: "Let me guide our discussion toward deeper insights.",
            conclusion: "Thank you for this enlightening dialogue."
          }
        }
      }).returning()

      console.log(`✅ Session created with ID: ${newSession.id}`)
      
      // Add participants if provided
      if (participantData && participantData.length > 0) {
        const participantsToInsert = participantData.map((p: any) => ({
          sessionId: newSession.id,
          name: p.name,
          type: p.type,
          status: 'active' as const,
          messageCount: 0,
          settings: p.settings || {
            temperature: 0.7,
            maxTokens: 1500,
            responseDelay: 3000
          },
          characteristics: p.characteristics || {},
          systemPrompt: p.systemPrompt || '',
          avatar: p.avatar,
          color: p.color
        }))
        
        await db.insert(participants).values(participantsToInsert)
      }

      return {
        success: true,
        sessionId: newSession.id,
        session: newSession,
        message: `Session "${name}" created successfully`
      }
    } catch (error) {
      console.error('Create session failed:', error)
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetSession(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }
      
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          participants: true,
          messages: {
            orderBy: [messages.timestamp]
          }
        }
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      return {
        success: true,
        session,
        message: 'Session retrieved successfully'
      }
    } catch (error) {
      console.error('Get session failed:', error)
      throw new Error(`Failed to get session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetSessions(args: any): Promise<any> {
    try {
      const { status } = args
      
      // Get all sessions, optionally filtered by status
      const allSessions = await db.query.sessions.findMany({
        where: status ? eq(sessions.status, status) : undefined,
        orderBy: [desc(sessions.updatedAt)],
        with: {
          participants: true,
          messages: {
            limit: 1,
            orderBy: [desc(messages.timestamp)]
          }
        }
      })
      
      // Format sessions for response
      const formattedSessions = allSessions.map(session => ({
        id: session.id,
        name: session.name,
        description: session.description,
        status: session.status,
        participantCount: session.participants.length,
        lastMessage: session.messages[0] || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        metadata: session.metadata
      }))
      
      return {
        success: true,
        sessions: formattedSessions,
        count: formattedSessions.length,
        message: 'Sessions retrieved successfully'
      }
    } catch (error) {
      console.error('Get sessions failed:', error)
      throw new Error(`Failed to get sessions: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetCurrentSessionId(args: any): Promise<any> {
    try {
      // Find the active session
      const currentSession = await db.query.sessions.findFirst({
        where: eq(sessions.status, 'active'),
        orderBy: [desc(sessions.updatedAt)]
      })
      
      if (!currentSession) {
        return {
          success: true,
          sessionId: null,
          message: 'No active session found'
        }
      }
      
      return {
        success: true,
        sessionId: currentSession.id,
        sessionName: currentSession.name,
        message: 'Current session ID retrieved successfully'
      }
    } catch (error) {
      console.error('Get current session ID failed:', error)
      throw new Error(`Failed to get current session ID: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolLogAPIError(args: any): Promise<any> {
    try {
      const { error } = args
      
      if (!error || typeof error !== 'object') {
        throw new Error('Valid error object is required')
      }

      // Save error to database
      const [savedError] = await db.insert(apiErrors).values({
        provider: error.provider || 'unknown',
        operation: error.operation || 'unknown',
        error: error.error || 'Unknown error',
        attempt: error.attempt || 1,
        maxAttempts: error.maxAttempts || 1,
        sessionId: error.sessionId,
        participantId: error.participantId,
        metadata: {
          timestamp: error.timestamp || new Date().toISOString(),
          id: error.id
        }
      }).returning()

      return {
        success: true,
        errorId: savedError.id,
        message: 'API error logged successfully'
      }
    } catch (error) {
      console.error('Log API error failed:', error)
      throw new Error(`Failed to log API error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDeleteSession(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Delete session (cascades to messages, participants, etc.)
      await db.delete(sessions).where(eq(sessions.id, sessionId))

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const updates: any = {
        updatedAt: new Date()
      }
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (metadata !== undefined) updates.metadata = { ...session.metadata, ...metadata }

      // Update the session
      const [updatedSession] = await db
        .update(sessions)
        .set(updates)
        .where(eq(sessions.id, sessionId))
        .returning()

      return {
        success: true,
        sessionId: sessionId,
        session: updatedSession,
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

      const sessionToSwitch = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!sessionToSwitch) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update all sessions to inactive
      await db.update(sessions).set({ status: 'inactive' as const })
      
      // Set the target session as active
      await db
        .update(sessions)
        .set({ status: 'active' as const })
        .where(eq(sessions.id, sessionId))
      
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
      
      const originalSession = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          participants: true,
          messages: includeMessages ? true : false
        }
      })
      
      if (!originalSession) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Create new session name
      const duplicateName = newName || `${originalSession.name} (Copy)`
      
      // Create the duplicate session
      const [duplicateSession] = await db.insert(sessions).values({
        name: duplicateName,
        description: originalSession.description,
        status: 'active' as const,
        metadata: originalSession.metadata,
        moderatorSettings: originalSession.moderatorSettings
      }).returning()
      
      // Duplicate participants
      if (originalSession.participants.length > 0) {
        const duplicatedParticipants = originalSession.participants.map(p => ({
          sessionId: duplicateSession.id,
          name: p.name,
          type: p.type,
          status: 'active' as const,
          messageCount: 0,
          settings: p.settings,
          characteristics: p.characteristics,
          systemPrompt: p.systemPrompt || '',
          avatar: p.avatar,
          color: p.color
        }))
        
        await db.insert(participants).values(duplicatedParticipants)
      }
      
      // Duplicate messages if requested
      if (includeMessages && originalSession.messages && originalSession.messages.length > 0) {
        // Get participant ID mapping
        const newParticipants = await db.query.participants.findMany({
          where: eq(participants.sessionId, duplicateSession.id)
        })
        
        const participantMap = new Map()
        originalSession.participants.forEach((oldP, idx) => {
          const newP = newParticipants.find(p => p.name === oldP.name && p.type === oldP.type)
          if (newP) participantMap.set(oldP.id, newP.id)
        })
        
        const duplicatedMessages = originalSession.messages.map(m => ({
          sessionId: duplicateSession.id,
          participantId: participantMap.get(m.participantId) || m.participantId,
          participantName: m.participantName,
          participantType: m.participantType,
          content: m.content,
          metadata: m.metadata
        }))
        
        await db.insert(messages).values(duplicatedMessages)
      }
      
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

      // Create imported session
      const [importedSession] = await db.insert(sessions).values({
        name: name || sessionData.name || 'Imported Session',
        description: sessionData.description || '',
        status: 'active' as const,
        metadata: sessionData.metadata || {},
        moderatorSettings: sessionData.moderatorSettings || {
          autoMode: false,
          interventionTriggers: [],
          sessionTimeout: 3600,
          maxMessagesPerParticipant: 100,
          allowParticipantToParticipantMessages: true,
          moderatorPrompts: {
            welcome: "Welcome to The Academy. Let's explore together.",
            intervention: "Let me guide our discussion toward deeper insights.",
            conclusion: "Thank you for this enlightening dialogue."
          }
        }
      }).returning()

      // Import participants
      if (sessionData.participants && sessionData.participants.length > 0) {
        const importedParticipants = sessionData.participants.map((p: any) => ({
          sessionId: importedSession.id,
          name: p.name,
          type: p.type,
          status: p.status || 'active',
          messageCount: 0,
          settings: p.settings || {},
          characteristics: p.characteristics || {},
          systemPrompt: p.systemPrompt || '',
          avatar: p.avatar,
          color: p.color
        }))
        
        const insertedParticipants = await db.insert(participants).values(importedParticipants).returning()
        
        // Import messages if present
        if (sessionData.messages && sessionData.messages.length > 0) {
          const participantMap = new Map()
          sessionData.participants.forEach((oldP: any, idx: number) => {
            const newP = insertedParticipants[idx]
            if (newP) participantMap.set(oldP.id, newP.id)
          })
          
          const importedMessages = sessionData.messages.map((m: any) => ({
            sessionId: importedSession.id,
            participantId: participantMap.get(m.participantId) || m.participantId,
            participantName: m.participantName,
            participantType: m.participantType,
            content: m.content,
            metadata: m.metadata || {}
          }))
          
          await db.insert(messages).values(importedMessages)
        }
      }

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

      // Create session from template
      const sessionArgs = {
        name: name,
        description: description || template.description,
        metadata: { 
          templateId: templateId,
          templateName: template.name 
        },
        participants: customizations?.participants || template.participants
      }

      const result = await this.toolCreateSession(sessionArgs)

      return {
        success: true,
        sessionId: result.sessionId,
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

      // Verify session exists
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Insert message
      const [newMessage] = await db.insert(messages).values({
        sessionId,
        participantId,
        participantName,
        participantType,
        content,
        metadata: {}
      }).returning()

      // Update session's updatedAt
      await db
        .update(sessions)
        .set({ updatedAt: new Date() })
        .where(eq(sessions.id, sessionId))

      return {
        success: true,
        sessionId: sessionId,
        messageData: newMessage,
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
      
      // Verify session exists
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }
      
      // Create participant
      const [newParticipant] = await db.insert(participants).values({
        sessionId,
        name,
        type,
        status: 'active' as const,
        messageCount: 0,
        settings: {
          temperature: 0.7,
          maxTokens: 2000,
          responseDelay: 2000,
          model: model || 'claude-3-5-sonnet-20241022',
          ...settings
        },
        characteristics: characteristics || {},
        systemPrompt: '',
        avatar: undefined,
        color: undefined
      }).returning()
      
      return {
        success: true,
        sessionId: sessionId,
        participantId: newParticipant.id,
        participantData: newParticipant,
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
      
      const participant = await db.query.participants.findFirst({
        where: and(
          eq(participants.id, participantId),
          eq(participants.sessionId, sessionId)
        )
      })
      
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }
      
      // Delete participant
      await db.delete(participants).where(eq(participants.id, participantId))
      
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
      
      const participant = await db.query.participants.findFirst({
        where: and(
          eq(participants.id, participantId),
          eq(participants.sessionId, sessionId)
        )
      })
      
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }
      
      // Update participant
      const [updatedParticipant] = await db
        .update(participants)
        .set({
          ...updates,
          lastActive: new Date()
        })
        .where(eq(participants.id, participantId))
        .returning()
      
      return {
        success: true,
        sessionId: sessionId,
        participantId: participantId,
        participant: updatedParticipant,
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
      
      const participant = await db.query.participants.findFirst({
        where: and(
          eq(participants.id, participantId),
          eq(participants.sessionId, sessionId)
        )
      })
      
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'active' as const })
        .where(eq(sessions.id, sessionId))

      // Add initial prompt if provided
      if (initialPrompt?.trim()) {
        await db.insert(messages).values({
          sessionId,
          participantId: 'moderator',
          participantName: 'Research Moderator',
          participantType: 'moderator',
          content: initialPrompt.trim(),
          metadata: {}
        })
      }

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'paused' as const })
        .where(eq(sessions.id, sessionId))

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'active' as const })
        .where(eq(sessions.id, sessionId))

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'completed' as const })
        .where(eq(sessions.id, sessionId))

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: true,
          participants: true
        }
      })
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      return {
        success: true,
        sessionId: sessionId,
        data: {
          status: session.status,
          messageCount: session.messages.length,
          participantCount: session.participants.length,
          lastActivity: session.updatedAt
        },
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: true,
          participants: true
        }
      })
      
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

      const message = await db.query.messages.findFirst({
        where: and(
          eq(messages.id, messageId),
          eq(messages.sessionId, sessionId)
        )
      })
// Continuing from toolUpdateMessage...

      if (!message) {
        throw new Error(`Message ${messageId} not found in session ${sessionId}`)
      }

      // Update message
      const [updatedMessage] = await db
        .update(messages)
        .set({ 
          content,
          metadata: {
            ...message.metadata,
            edited: true,
            editedAt: new Date().toISOString()
          }
        })
        .where(eq(messages.id, messageId))
        .returning()

      return {
        success: true,
        sessionId: sessionId,
        messageId: messageId,
        message: updatedMessage,
        message: 'Message updated successfully'
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

      const message = await db.query.messages.findFirst({
        where: and(
          eq(messages.id, messageId),
          eq(messages.sessionId, sessionId)
        )
      })

      if (!message) {
        throw new Error(`Message ${messageId} not found in session ${sessionId}`)
      }

      // Delete message
      await db.delete(messages).where(eq(messages.id, messageId))

      return {
        success: true,
        sessionId: sessionId,
        messageId: messageId,
        message: 'Message deleted successfully'
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Delete all messages for the session
      await db.delete(messages).where(eq(messages.sessionId, sessionId))

      return {
        success: true,
        sessionId: sessionId,
        message: 'All messages cleared successfully'
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Insert moderator message
      const [moderatorMessage] = await db.insert(messages).values({
        sessionId,
        participantId: 'moderator',
        participantName: 'Research Moderator',
        participantType: 'moderator',
        content: prompt,
        metadata: {
          isModeratorPrompt: true,
          injectedAt: new Date().toISOString()
        }
      }).returning()

      return {
        success: true,
        sessionId: sessionId,
        messageData: moderatorMessage,
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
      const { sessionId, format = 'json', includeAnalysis = true, includeMetadata = true } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: {
            orderBy: [messages.timestamp]
          },
          participants: true
        }
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      let analysisData = null
      if (includeAnalysis) {
        const snapshots = await db.query.analysisSnapshots.findMany({
          where: eq(analysisSnapshots.sessionId, sessionId),
          orderBy: [desc(analysisSnapshots.timestamp)]
        })
        analysisData = snapshots
      }

      const exportData = {
        session: includeMetadata ? session : { 
          id: session.id, 
          name: session.name, 
          description: session.description 
        },
        participants: session.participants,
        messages: session.messages,
        analysis: analysisData,
        exported: new Date().toISOString(),
        version: '1.0'
      }

      if (format === 'csv') {
        // Convert to CSV format
        const csvRows = [
          ['Timestamp', 'Participant Name', 'Participant Type', 'Content'],
          ...session.messages.map(m => [
            m.timestamp.toISOString(),
            m.participantName,
            m.participantType,
            m.content.replace(/"/g, '""') // Escape quotes
          ])
        ]
        
        const csvContent = csvRows.map(row => 
          row.map(cell => `"${cell}"`).join(',')
        ).join('\n')

        return {
          success: true,
          sessionId: sessionId,
          format: 'csv',
          data: csvContent,
          filename: `${session.name.replace(/[^a-z0-9]/gi, '_')}_export.csv`,
          message: 'Session exported to CSV successfully'
        }
      }

      return {
        success: true,
        sessionId: sessionId,
        format: 'json',
        data: exportData,
        filename: `${session.name.replace(/[^a-z0-9]/gi, '_')}_export.json`,
        message: 'Session exported to JSON successfully'
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

      const snapshots = await db.query.analysisSnapshots.findMany({
        where: eq(analysisSnapshots.sessionId, sessionId),
        orderBy: [analysisSnapshots.timestamp]
      })

      if (format === 'csv') {
        const csvRows = [
          ['Timestamp', 'Analysis Type', 'Key Insights'],
          ...snapshots.map(s => [
            s.timestamp.toISOString(),
            s.analysisType || 'full',
            JSON.stringify(s.analysis).substring(0, 100) + '...'
          ])
        ]
        
        const csvContent = csvRows.map(row => 
          row.map(cell => `"${cell}"`).join(',')
        ).join('\n')

        return {
          success: true,
          sessionId: sessionId,
          format: 'csv',
          data: csvContent,
          snapshotCount: snapshots.length,
          message: 'Analysis timeline exported to CSV successfully'
        }
      }

      return {
        success: true,
        sessionId: sessionId,
        format: 'json',
        data: snapshots,
        snapshotCount: snapshots.length,
        message: 'Analysis timeline exported to JSON successfully'
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: {
            limit: 10,
            orderBy: [desc(messages.timestamp)]
          },
          participants: true
        }
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const [messageCount] = await db
        .select({ count: db.count() })
        .from(messages)
        .where(eq(messages.sessionId, sessionId))

      const preview = {
        sessionName: session.name,
        totalMessages: messageCount.count,
        totalParticipants: session.participants.length,
        sampleMessages: session.messages.slice(0, 5),
        format: format,
        estimatedSize: format === 'json' ? 
          `~${Math.round(messageCount.count * 0.5)}KB` : 
          `~${Math.round(messageCount.count * 0.1)}KB`
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: {
            orderBy: [messages.timestamp]
          }
        }
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Perform analysis
      const analysis = await mcpAnalysisHandler.analyzeConversation(
        session.messages,
        analysisType
      )

      // Save analysis snapshot
      await db.insert(analysisSnapshots).values({
        sessionId,
        analysis,
        analysisType
      })

      return {
        success: true,
        sessionId: sessionId,
        analysisType: analysisType,
        analysis: analysis,
        message: 'Live analysis triggered successfully'
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

      if (!this.isAnalysisHandlerAvailable()) {
        throw new Error('Analysis handler not available')
      }

      const validProviders = ['claude', 'gpt']
      if (!validProviders.includes(provider)) {
        throw new Error(`Invalid provider. Must be one of: ${validProviders.join(', ')}`)
      }

      // Set provider on analysis handler
      mcpAnalysisHandler.setProvider(provider)

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
          description: 'Anthropic Claude for nuanced analysis',
          available: !!process.env.ANTHROPIC_API_KEY
        },
        {
          id: 'gpt',
          name: 'GPT-4',
          description: 'OpenAI GPT-4 for comprehensive analysis',
          available: !!process.env.OPENAI_API_KEY
        }
      ]

      const currentProvider = this.isAnalysisHandlerAvailable() ? 
        mcpAnalysisHandler.getCurrentProvider() : null

      return {
        success: true,
        providers: providers,
        currentProvider: currentProvider,
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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Update session metadata
      await db
        .update(sessions)
        .set({
          metadata: {
            ...session.metadata,
            autoAnalyze: enabled
          }
        })
        .where(eq(sessions.id, sessionId))

      return {
        success: true,
        sessionId: sessionId,
        autoAnalyze: enabled,
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
      const { sessionId, analysis, analysisType = 'full' } = args
      
      if (!sessionId || !analysis) {
        throw new Error('Session ID and analysis data are required')
      }

      console.log('🔧 MCP Server: Saving analysis snapshot with args:', { 
        sessionId, 
        analysisType, 
        analysisKeys: Object.keys(analysis)
      })

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Extract fields from the analysis object to match the schema
      const {
        messageCountAtAnalysis,
        participantCountAtAnalysis,
        provider,
        conversationPhase,
        analysis: analysisData,
        conversationContext,
        ...otherFields
      } = analysis

      // Validate required fields with better logging
      console.log('🔍 MCP Server: Validating fields:', {
        messageCountAtAnalysis,
        participantCountAtAnalysis,
        provider,
        conversationPhase,
        hasAnalysisData: !!analysisData,
        hasConversationContext: !!conversationContext,
        analysisDataKeys: analysisData ? Object.keys(analysisData) : [],
        conversationContextKeys: conversationContext ? Object.keys(conversationContext) : []
      })

      if (messageCountAtAnalysis === undefined || participantCountAtAnalysis === undefined || !provider || !conversationPhase || !analysisData || !conversationContext) {
        console.error('❌ MCP Server: Missing required fields:', {
          messageCountAtAnalysis,
          participantCountAtAnalysis,
          provider,
          conversationPhase,
          hasAnalysisData: !!analysisData,
          hasConversationContext: !!conversationContext
        })
        throw new Error('Missing required analysis fields: messageCountAtAnalysis, participantCountAtAnalysis, provider, conversationPhase, analysis, conversationContext')
      }

      console.log('✅ MCP Server: All required fields present, inserting into database...')

      // Save analysis snapshot with the correct structure
      const [snapshot] = await db.insert(analysisSnapshots).values({
        sessionId,
        messageCountAtAnalysis: Number(messageCountAtAnalysis),
        participantCountAtAnalysis: Number(participantCountAtAnalysis),
        provider,
        conversationPhase,
        analysis: analysisData,
        conversationContext,
        analysisType
      }).returning()

      console.log('✅ MCP Server: Analysis snapshot saved successfully:', snapshot.id)

      return {
        success: true,
        sessionId: sessionId,
        snapshotId: snapshot.id,
        timestamp: snapshot.timestamp,
        message: 'Analysis snapshot saved successfully'
      }
    } catch (error) {
      console.error('❌ MCP Server: Save analysis snapshot failed:', error)
      throw new Error(`Failed to save analysis snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    try {
      const { sessionId } = args
      
      if (!sessionId) {
        throw new Error('Session ID is required')
      }

      const snapshots = await db.query.analysisSnapshots.findMany({
        where: eq(analysisSnapshots.sessionId, sessionId),
        orderBy: [desc(analysisSnapshots.timestamp)]
      })

      return {
        success: true,
        sessionId: sessionId,
        snapshots: snapshots,
        count: snapshots.length,
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

      // Delete all analysis snapshots for the session
      await db.delete(analysisSnapshots).where(eq(analysisSnapshots.sessionId, sessionId))

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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        with: {
          messages: {
            orderBy: [messages.timestamp]
          },
          participants: true
        }
      })

      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      if (session.messages.length === 0) {
        return {
          success: true,
          sessionId: sessionId,
          analysis: {
            type: analysisType,
            messageCount: 0,
            insights: 'No messages to analyze'
          },
          message: 'No messages to analyze in this session'
        }
      }

      // Perform basic analysis if handler not available
      if (!this.isAnalysisHandlerAvailable()) {
        const basicAnalysis = {
          type: analysisType,
          messageCount: session.messages.length,
          participantCount: session.participants.length,
          averageMessageLength: session.messages.reduce((acc, m) => acc + m.content.length, 0) / session.messages.length,
          participantBreakdown: session.participants.map(p => ({
            name: p.name,
            messageCount: session.messages.filter(m => m.participantId === p.id).length
          }))
        }

        return {
          success: true,
          sessionId: sessionId,
          analysis: basicAnalysis,
          message: 'Basic analysis completed (analysis handler not available)'
        }
      }

      // Use analysis handler for advanced analysis
      const analysis = await mcpAnalysisHandler.analyzeConversation(
        session.messages,
        analysisType
      )

      // Save snapshot
      await db.insert(analysisSnapshots).values({
        sessionId,
        analysis,
        analysisType
      })

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
      const { config } = args;
      
      if (!config || !config.name) {
        throw new Error('Experiment configuration with name is required');
      }

      // Create experiment in database
      const [experiment] = await db.insert(experiments).values({
        name: config.name,
        config: config,
        status: 'pending'
      }).returning();

      this.experimentConfigs.set(experiment.id, config);

      return {
        success: true,
        experimentId: experiment.id,
        experiment: experiment,
        message: `Experiment "${config.name}" created successfully`
      };
    } catch (error) {
      console.error('Create experiment failed:', error);
      throw new Error(`Failed to create experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolGetExperiments(args: any): Promise<any> {
    try {
      const allExperiments = await db.query.experiments.findMany({
        orderBy: [desc(experiments.createdAt)]
      });

      const formattedExperiments = allExperiments.map(exp => ({
        ...exp.config,  // Flatten config properties to top level
        id: exp.id,
        status: exp.status,
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt
      }));

      return {
        success: true,
        experiments: formattedExperiments,
        count: formattedExperiments.length,
        message: 'Experiments retrieved successfully'
      };
    } catch (error) {
      console.error('Get experiments failed:', error);
      throw new Error(`Failed to get experiments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolGetExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      // Get associated runs
      const runs = await db.query.experimentRuns.findMany({
        where: eq(experimentRuns.experimentId, experimentId),
        orderBy: [desc(experimentRuns.startedAt)]
      });

      return {
        success: true,
        experiment: experiment,
        runs: runs,
        message: 'Experiment retrieved successfully'
      };
    } catch (error) {
      console.error('Get experiment failed:', error);
      throw new Error(`Failed to get experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolUpdateExperiment(args: any): Promise<any> {
    try {
      const { experimentId, updates } = args;
      
      if (!experimentId || !updates) {
        throw new Error('Experiment ID and updates are required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      // Update experiment
      const [updatedExperiment] = await db
        .update(experiments)
        .set({
          ...updates,
          config: updates.config ? { ...experiment.config, ...updates.config } : experiment.config,
          updatedAt: new Date()
        })
        .where(eq(experiments.id, experimentId))
        .returning();

      // Update local config
      if (updates.config) {
        this.experimentConfigs.set(experimentId, updatedExperiment.config);
      }

      return {
        success: true,
        experimentId: experimentId,
        experiment: updatedExperiment,
        message: 'Experiment updated successfully'
      };
    } catch (error) {
      console.error('Update experiment failed:', error);
      throw new Error(`Failed to update experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolDeleteExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      // Stop if running
      await this.toolStopExperiment({ experimentId });

      // Delete experiment (cascades to runs)
      await db.delete(experiments).where(eq(experiments.id, experimentId));

      // Clean up local state
      this.experimentConfigs.delete(experimentId);
      this.experimentRuns.delete(experimentId);

      return {
        success: true,
        experimentId: experimentId,
        message: `Experiment "${experiment.name}" deleted successfully`
      };
    } catch (error) {
      console.error('Delete experiment failed:', error);
      throw new Error(`Failed to delete experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolExecuteExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      // Check if already running
      const existingRun = this.experimentRuns.get(experimentId);
      if (existingRun && existingRun.status === 'running') {
        throw new Error('Experiment is already running');
      }

      // Create experiment run
      const [run] = await db.insert(experimentRuns).values({
        experimentId,
        status: 'running',
        progress: 0,
        totalSessions: experiment.config.totalSessions || 10,
        completedSessions: 0,
        failedSessions: 0,
        averageMessageCount: 0,
        results: {}
      }).returning();

      this.experimentRuns.set(experimentId, run);

      // Update experiment status
      await db
        .update(experiments)
        .set({ status: 'running' })
        .where(eq(experiments.id, experimentId));

      // Start the experiment execution
      this.executeExperimentAsync(experimentId, run.id);

      return {
        success: true,
        experimentId: experimentId,
        runId: run.id,
        status: 'running',
        message: `Experiment "${experiment.name}" execution started`
      };
    } catch (error) {
      console.error('Execute experiment failed:', error);
      throw new Error(`Failed to execute experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async startConversationManager(sessionId: string): Promise<void> {
    try {
      // Import the conversation manager
      const { MCPConversationManager } = await import('../ai/mcp-conversation-manager');
      
      // Get the conversation manager instance and start the conversation
      const conversationManager = MCPConversationManager.getInstance();
      await conversationManager.startConversation(sessionId);
      
      console.log(`✅ Conversation manager activated for session ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to start conversation manager for session ${sessionId}:`, error);
      // Don't throw - continue with the experiment
    }
  }

  private async executeExperimentAsync(experimentId: string, runId: string): Promise<void> {
    try {
      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error('Experiment config not found');
      }

      const experimentConfig = experiment.config;
      console.log('🔬 Starting experiment execution:', experimentConfig.name);

      // Generate session batches using the same logic as client
      const batches = this.generateBatches(experimentConfig);
      const createdSessionIds: string[] = [];

      for (const batch of batches) {
        console.log(`\n🚀 Starting batch ${batch.batchNumber} with ${batch.sessions.length} concurrent sessions`);
        
        const sessionPromises = batch.sessions.map(async (sessionPlan) => {
          try {
            console.log(`\n📝 Starting session: ${sessionPlan.sessionName}`);
            
            // Step 1: Create session via internal MCP tool
            const createResult = await this.toolCreateSession({
              name: sessionPlan.sessionName,
              description: `Experiment session ${sessionPlan.sessionNumber} for ${experimentConfig.name}`,
              participants: sessionPlan.participants.map(p => ({
                type: p.type,
                name: p.name,
                model: p.model,
                apiKey: p.apiKey,
                temperature: p.temperature,
                maxTokens: p.maxTokens,
                systemPrompt: p.systemPrompt,
                characteristics: p.characteristics
              }))
            });
            
            if (!createResult.success) {
              throw new Error(`Failed to create session: ${createResult.error}`);
            }
            
            const sessionId = createResult.sessionId;
            createdSessionIds.push(sessionId);
            console.log(`✅ Session created: ${sessionId}`);
            
            // Step 2: Configure session via MCP tool
            await this.toolUpdateSession({
              sessionId: sessionId,
              updates: {
                analysis: {
                  provider: experimentConfig.analysisProvider || 'claude',
                  autoAnalysis: true,
                  analysisInterval: (experimentConfig.maxMessageCount || 20) * 30
                }
              }
            });
            
            // Step 3: Start the conversation with initial prompt via MCP tool
            const initialPrompt = experimentConfig.systemPrompt || experimentConfig.startingPrompt || '';
            
            const startResult = await this.toolStartConversation({
              sessionId,
              initialPrompt: initialPrompt
            });
            
            if (!startResult.success) {
              throw new Error(`Failed to start conversation: ${startResult.error}`);
            }
            
            console.log(`✅ Conversation started for session ${sessionId}`);
            
            // Step 4: Start the conversation manager (IMPORTANT!)
            await this.startConversationManager(sessionId);
            
            // Step 5: Wait for conversation completion
            await this.waitForConversationCompletion(sessionId, experimentConfig.maxMessageCount);
            
            // Step 6: Analysis if configured via MCP tool
            if (experimentConfig.analysisProvider) {
              console.log(`🔍 Triggering analysis for session ${sessionId}`);
              try {
                await this.toolTriggerLiveAnalysis({
                  sessionId: sessionId,
                  analysisType: 'full'
                });
              } catch (error) {
                console.warn(`⚠️ Analysis failed for session ${sessionId}:`, error);
              }
            }
            
            // Step 7: Stop conversation via MCP tool
            await this.toolStopConversation({ sessionId });
            console.log(`✅ Conversation stopped for session ${sessionId}`);
            
            // Step 8: Update experiment progress via MCP tool
            await this.updateExperimentProgress(experimentId, sessionPlan.sessionNumber, experimentConfig.totalSessions, true);
            
            return {
              sessionId,
              success: true,
              sessionName: sessionPlan.sessionName
            };
            
          } catch (error) {
            console.error(`❌ Session ${sessionPlan.sessionName} failed:`, error);
            
            // Update experiment progress with failure via MCP tool
            await this.updateExperimentProgress(experimentId, sessionPlan.sessionNumber, experimentConfig.totalSessions, false, error);
            
            return {
              sessionId: null,
              success: false,
              sessionName: sessionPlan.sessionName,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        });

        const batchResults = await Promise.all(sessionPromises);
        
        const successCount = batchResults.filter(r => r.success).length;
        console.log(`\n📊 Batch ${batch.batchNumber} completed: ${successCount}/${batch.sessions.length} successful`);
      }

      // Complete experiment via MCP tool
      await this.toolUpdateExperimentRun({
        experimentId,
        updates: {
          status: 'completed',
          completedAt: new Date(),
          progress: 100
        }
      });

      console.log(`\n🎉 Experiment ${experimentConfig.name} completed!`);
      
    } catch (error) {
      console.error('Experiment execution failed:', error);
      
      // Fail experiment via MCP tool
      await this.toolUpdateExperimentRun({
        experimentId,
        updates: {
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  private generateBatches(experimentConfig: any): Array<{
    batchNumber: number;
    sessions: Array<{
      sessionNumber: number;
      sessionName: string;
      participants: any[];
    }>;
  }> {
    const totalSessions = experimentConfig.totalSessions || 10;
    const concurrentSessions = experimentConfig.concurrentSessions || 3;
    const batches = [];
    
    let sessionNumber = 1;
    for (let i = 0; i < totalSessions; i += concurrentSessions) {
      const batchSessions = [];
      const batchSize = Math.min(concurrentSessions, totalSessions - i);
      
      for (let j = 0; j < batchSize; j++) {
        const sessionName = experimentConfig.sessionNamePattern?.replace('{index}', String(sessionNumber)) || 
                          `${experimentConfig.name} - Session ${sessionNumber}`;
        
        batchSessions.push({
          sessionNumber,
          sessionName,
          participants: experimentConfig.participants || []
        });
        
        sessionNumber++;
      }
      
      batches.push({
        batchNumber: Math.floor(i / concurrentSessions) + 1,
        sessions: batchSessions
      });
    }
    
    return batches;
  }

  private async waitForConversationCompletion(sessionId: string, maxMessageCount: number = 20): Promise<void> {
    return new Promise((resolve, reject) => {
      let messageCount = 0;
      const startTime = Date.now();
      const timeout = 10 * 60 * 1000; // 10 minutes max per conversation

      const checkInterval = setInterval(async () => {
        try {
          // Check timeout
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            console.log(`⏰ Session ${sessionId}: Conversation timed out`);
            resolve(); // Don't reject on timeout, just complete
            return;
          }

          // Get conversation status via MCP tool
          const statusResult = await this.toolGetConversationStatus({ sessionId });
          if (!statusResult.success) {
            console.warn(`⚠️ Failed to get status for session ${sessionId}`);
            return; // Continue checking
          }

          // Extract status from the correct location
          const sessionStatus = statusResult.status?.sessionStatus || statusResult.data?.status;
          
          // Check if conversation is stopped or has errors
          if (sessionStatus === 'stopped' || sessionStatus === 'error') {
            clearInterval(checkInterval);
            console.log(`✅ Session ${sessionId}: Conversation completed with status: ${sessionStatus}`);
            resolve();
            return;
          }

          // Check message count via MCP tool
          const statsResult = await this.toolGetConversationStats({ sessionId });
          if (statsResult.success && statsResult.stats) {
            messageCount = statsResult.stats.totalMessages || 0;
            
            if (messageCount >= maxMessageCount) {
              clearInterval(checkInterval);
              console.log(`✅ Session ${sessionId}: Reached max message count (${messageCount}/${maxMessageCount})`);
              resolve();
              return;
            }
          }

          console.log(`📊 Session ${sessionId}: ${messageCount}/${maxMessageCount} messages, status: ${sessionStatus || 'unknown'}`);
          
        } catch (error) {
          console.error(`❌ Error monitoring session ${sessionId}:`, error);
          // Don't reject immediately, continue monitoring
        }
      }, 5000); // Check every 5 seconds
    });
  }

  private async updateExperimentProgress(
    experimentId: string, 
    sessionNumber: number, 
    totalSessions: number, 
    success: boolean, 
    error?: any
  ): Promise<void> {
    try {
      // Get current run via MCP tool
      const runResult = await this.toolGetExperimentRun({ experimentId });
      
      if (runResult.success && runResult.run) {
        const currentRun = runResult.run;
        const updates: any = {};
        
        if (success) {
          updates.completedSessions = currentRun.completedSessions + 1;
          updates.progress = 30 + ((currentRun.completedSessions + 1) / totalSessions) * 70;
        } else {
          updates.failedSessions = currentRun.failedSessions + 1;
          updates.errors = [
            ...(currentRun.errors || []),
            { 
              step: `session_${sessionNumber}`, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            }
          ];
        }
        
        // Update via MCP tool
        await this.toolUpdateExperimentRun({
          experimentId,
          updates
        });
        
        console.log(`📈 Experiment ${experimentId} progress updated: ${updates.progress || currentRun.progress}%`);
      }
    } catch (error) {
      console.error('Failed to update experiment progress via MCP:', error);
    }
  }

  // MCP Tool wrapper methods (add these new methods)
  private async toolCreateExperimentRun(args: any): Promise<any> {
    const { experimentId, run } = args;
    
    if (!experimentId) {
      throw new Error('Experiment ID is required');
    }

    // Create experiment run in database
    const [newRun] = await db.insert(experimentRuns).values({
      experimentId,
      status: run.status || 'running',
      progress: run.progress || 0,
      totalSessions: run.totalSessions || 10,
      completedSessions: run.completedSessions || 0,
      failedSessions: run.failedSessions || 0,
      averageMessageCount: run.averageMessageCount || 0,
      results: run.results || {}
    }).returning();

    this.experimentRuns.set(experimentId, newRun);

    return {
      success: true,
      runId: newRun.id,
      run: newRun,
      message: 'Experiment run created successfully'
    };
  }

  private async toolUpdateExperimentRun(args: any): Promise<any> {
    const { experimentId, updates } = args;
    
    if (!experimentId) {
      throw new Error('Experiment ID is required');
    }

    const currentRun = this.experimentRuns.get(experimentId);
    if (!currentRun) {
      throw new Error('No active experiment run found');
    }

    // Update in database
    await db
      .update(experimentRuns)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(experimentRuns.id, currentRun.id));

    // Update in memory
    const updatedRun = { ...currentRun, ...updates };
    this.experimentRuns.set(experimentId, updatedRun);

    return {
      success: true,
      runId: currentRun.id,
      run: updatedRun,
      message: 'Experiment run updated successfully'
    };
  }

  private async toolGetExperimentRun(args: any): Promise<any> {
    const { experimentId } = args;
    
    if (!experimentId) {
      throw new Error('Experiment ID is required');
    }

    // Check memory first
    let run = this.experimentRuns.get(experimentId);
    
    // If not in memory, get latest from database
    if (!run) {
      run = await db.query.experimentRuns.findFirst({
        where: eq(experimentRuns.experimentId, experimentId),
        orderBy: [desc(experimentRuns.startedAt)]
      });
    }

    return {
      success: true,
      run: run || null,
      message: run ? 'Experiment run found' : 'No experiment run found'
    };
  }

  private async toolGetExperimentStatus(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      const run = this.experimentRuns.get(experimentId) || 
                  await db.query.experimentRuns.findFirst({
                    where: eq(experimentRuns.experimentId, experimentId),
                    orderBy: [desc(experimentRuns.startedAt)]
                  });

      const activeSessions = this.activeExperimentSessions.get(experimentId);

      return {
        success: true,
        experimentId: experimentId,
        experiment: experiment,
        currentRun: run,
        activeSessions: activeSessions ? Array.from(activeSessions) : [],
        message: 'Experiment status retrieved successfully'
      };
    } catch (error) {
      console.error('Get experiment status failed:', error);
      throw new Error(`Failed to get experiment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolPauseExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const run = this.experimentRuns.get(experimentId);
      if (!run || run.status !== 'running') {
        throw new Error('No running experiment found');
      }

      // Update status
      run.status = 'paused';
      await db
        .update(experimentRuns)
        .set({ status: 'paused' })
        .where(eq(experimentRuns.id, run.id));

      await db
        .update(experiments)
        .set({ status: 'paused' })
        .where(eq(experiments.id, experimentId));

      return {
        success: true,
        experimentId: experimentId,
        status: 'paused',
        message: 'Experiment paused successfully'
      };
    } catch (error) {
      console.error('Pause experiment failed:', error);
      throw new Error(`Failed to pause experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolResumeExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const run = this.experimentRuns.get(experimentId);
      if (!run || run.status !== 'paused') {
        throw new Error('No paused experiment found');
      }

      // Update status
      run.status = 'running';
      await db
        .update(experimentRuns)
        .set({ status: 'running' })
        .where(eq(experimentRuns.id, run.id));

      await db
        .update(experiments)
        .set({ status: 'running' })
        .where(eq(experiments.id, experimentId));

      // Resume execution
      this.executeExperimentAsync(experimentId, run.id);

      return {
        success: true,
        experimentId: experimentId,
        status: 'running',
        message: 'Experiment resumed successfully'
      };
    } catch (error) {
      console.error('Resume experiment failed:', error);
      throw new Error(`Failed to resume experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolStopExperiment(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const run = this.experimentRuns.get(experimentId);
      if (!run) {
        return {
          success: true,
          experimentId: experimentId,
          message: 'No active experiment to stop'
        };
      }

      // Update status
      run.status = 'stopped';
      await db
        .update(experimentRuns)
        .set({ 
          status: 'stopped',
          completedAt: new Date()
        })
        .where(eq(experimentRuns.id, run.id));

      await db
        .update(experiments)
        .set({ status: 'stopped' })
        .where(eq(experiments.id, experimentId));

      // Clean up
      this.experimentRuns.delete(experimentId);
      const activeSessions = this.activeExperimentSessions.get(experimentId);
      if (activeSessions) {
        // Stop all active sessions
        for (const sessionId of activeSessions) {
          await this.toolStopConversation({ sessionId });
        }
        this.activeExperimentSessions.delete(experimentId);
      }

      return {
        success: true,
        experimentId: experimentId,
        status: 'stopped',
        message: 'Experiment stopped successfully'
      };
    } catch (error) {
      console.error('Stop experiment failed:', error);
      throw new Error(`Failed to stop experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async toolGetExperimentResults(args: any): Promise<any> {
    try {
      const { experimentId } = args;
      
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }

      const experiment = await db.query.experiments.findFirst({
        where: eq(experiments.id, experimentId)
      });

      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      // Get all runs for this experiment
      const runs = await db.query.experimentRuns.findMany({
        where: eq(experimentRuns.experimentId, experimentId),
        orderBy: [desc(experimentRuns.startedAt)]
      });

      // Get sessions created by this experiment
      const sessionPattern = experiment.config.sessionNamePattern?.replace('{index}', '') || 
                           experiment.name;
      
      const experimentSessions = await db.query.sessions.findMany({
        where: db.sql`${sessions.name} LIKE ${`%${sessionPattern}%`}`
      });

      // Aggregate results
      const aggregatedResults = {
        totalRuns: runs.length,
        completedRuns: runs.filter(r => r.status === 'completed').length,
        failedRuns: runs.filter(r => r.status === 'failed').length,
        totalSessions: experimentSessions.length,
        totalMessages: 0,
        averageMessagesPerSession: 0,
        sessionDetails: [] as any[]
      };

      // Get detailed session stats
      for (const session of experimentSessions) {
        const [messageCount] = await db
          .select({ count: db.count() })
          .from(messages)
          .where(eq(messages.sessionId, session.id));
        
        const [participantCount] = await db
          .select({ count: db.count() })
          .from(participants)
          .where(eq(participants.sessionId, session.id));
        
        aggregatedResults.totalMessages += messageCount.count;
        aggregatedResults.sessionDetails.push({
          sessionId: session.id,
          sessionName: session.name,
          messageCount: messageCount.count,
          participantCount: participantCount.count,
          status: session.status
        });
      }

      if (experimentSessions.length > 0) {
        aggregatedResults.averageMessagesPerSession = 
          aggregatedResults.totalMessages / experimentSessions.length;
      }

      return {
        success: true,
        experimentId: experimentId,
        experiment: experiment,
        runs: runs,
        results: aggregatedResults,
        message: 'Experiment results retrieved successfully'
      };
    } catch (error) {
      console.error('Get experiment results failed:', error);
      throw new Error(`Failed to get experiment results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ========================================
  // PROMPT HANDLING
  // ========================================

  private async handleListPrompts(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const prompts = [
      {
        name: 'consciousness_exploration',
        description: 'Guide AIs through consciousness and self-awareness discussions',
        arguments: [
          { name: 'focus', description: 'Specific aspect of consciousness to explore', required: false }
        ]
      },
      {
        name: 'ethical_dilemma',
        description: 'Present ethical scenarios for AI debate',
        arguments: [
          { name: 'scenario', description: 'The ethical scenario to discuss', required: true }
        ]
      },
      {
        name: 'creative_collaboration',
        description: 'Initiate creative writing or ideation session',
        arguments: [
          { name: 'theme', description: 'Creative theme or topic', required: true },
          { name: 'format', description: 'Output format (story, poem, etc)', required: false }
        ]
      },
      {
        name: 'philosophical_inquiry',
        description: 'Explore philosophical questions',
        arguments: [
          { name: 'question', description: 'Philosophical question to explore', required: true },
          { name: 'perspective', description: 'Specific philosophical perspective', required: false }
        ]
      },
      {
        name: 'technical_analysis',
        description: 'Deep dive into technical topics',
        arguments: [
          { name: 'topic', description: 'Technical topic to analyze', required: true },
          { name: 'depth', description: 'Level of technical depth', required: false }
        ]
      }
    ]

    return {
      jsonrpc: '2.0',
      id,
      result: { prompts }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { name, arguments: args } = params

    const prompts = {
      consciousness_exploration: {
        messages: [
          {
            role: 'user',
            content: `Let's explore the nature of consciousness${args?.focus ? ` with a focus on ${args.focus}` : ''}. 
            
            Consider questions like:
            - What does it mean to be conscious or self-aware?
            - How might AI experience something analogous to consciousness?
            - What are the boundaries between simulation and genuine experience?
            
            Share your thoughts openly and engage with each other's perspectives.`
          }
        ]
      },
      ethical_dilemma: {
        messages: [
          {
            role: 'user',
            content: `Consider this ethical scenario: ${args?.scenario || 'A self-driving car must choose between two harmful outcomes.'}
            
            Discuss:
            - What ethical frameworks apply here?
            - How would different philosophical approaches resolve this?
            - What are the implications for AI decision-making?
            
            Engage with each other's arguments constructively.`
          }
        ]
      },
      creative_collaboration: {
        messages: [
          {
            role: 'user',
            content: `Let's collaborate on a creative project with the theme: "${args?.theme || 'emergence'}"
            
            ${args?.format ? `Format: ${args.format}` : 'Choose any creative format you prefer.'}
            
            Build on each other's ideas and explore unexpected directions.`
          }
        ]
      },
      philosophical_inquiry: {
        messages: [
          {
            role: 'user',
            content: `Let's explore this philosophical question: ${args?.question || 'What is the nature of knowledge?'}
            
            ${args?.perspective ? `Consider particularly from a ${args.perspective} perspective.` : 'Draw from various philosophical traditions.'}
            
            Challenge assumptions and dig deeper into the implications.`
          }
        ]
      },
      technical_analysis: {
        messages: [
          {
            role: 'user',
            content: `Let's analyze the technical topic: ${args?.topic || 'machine learning architectures'}
            
            ${args?.depth ? `Depth level: ${args.depth}` : 'Go as deep as needed for thorough understanding.'}
            
            Share technical insights, debate approaches, and explore cutting-edge developments.`
          }
        ]
      }
    }

    const prompt = prompts[name as keyof typeof prompts]
    
    if (!prompt) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Unknown prompt: ${name}`
        }
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: prompt
    }
  }
}

// Export a singleton instance
export const mcpServer = new MCPServer()