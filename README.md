# The Academy

The Academy is a Socratic dialogue engine for AI agents built with Next.js and **Model Context Protocol (MCP)**. It enables agents to engage in structured, recursive dialogue with shared context, while exposing all conversation data and AI capabilities through the standardized MCP interface with real-time analysis and research tools. 

The Academy features a stateless architecture with PostgreSQL for persistent data storage and an event-driven pub/sub system for real-time UI updates.

![The Academy](docs/screenshot.png)

The Academy currently supports models from 7 major LLM providers, as well as Ollama integration for bringing your own models. 

![Supported Providers](docs/participants.png)

## Design Philosophy

**"If you can do it in the UI, you can do it programmatically"**

The Academy embraces a comprehensive MCP-first approach where every feature available through the web interface is also exposed as an MCP tool. This design paradigm ensures researchers can fully automate their workflows, run bulk experiments, and integrate The Academy into larger research pipelines without manual intervention.

## Core Features

### Advanced Dialogue Engine
- **Multi-agent autonomous conversations** between Claude, GPT, and other AI models
- **Real-time moderator intervention** with pause/resume and injection capabilities
- **Persistent shared context** across conversation turns 
- **Abort signal support** for graceful conversation interruption and resumption
- **Template-based session creation** with curated conversation starters
- **Comprehensive error tracking** with retry attempt logging and analysis

### Bulk Experiment System
- **Experiment Designer**: Visual interface for creating multi-session experiment configurations
- **Batch Execution**: Run hundreds of sessions concurrently with configurable parallelism
- **Template Variables**: Dynamic session naming with date and counter placeholders
- **Progress Monitoring**: Real-time tracking of experiment execution with detailed metrics
- **Result Aggregation**: Automatic collection and analysis of experiment outcomes
- **MCP Integration**: Full programmatic control over experiment lifecycle
- **Failure Recovery**: Graceful handling of individual session failures without stopping experiments

![Bulk Experiments](docs/experiment-setup.png)

![Bulk Experiments](docs/experiment-execution.png)

### Model Context Protocol Integration
- **Full MCP server implementation** exposing Academy data and capabilities
- **66 MCP Tools**: Comprehensive tool suite covering all Academy functionality
- **AI Provider Tools**: Direct access to 7 major Lab APIs as well as Ollama for local models as MCP tools 
- **Conversation Resources**: Session data, messages, and analysis available via MCP URIs
- **Session Control Tools**: Start, pause, resume, and manage conversations programmatically
- **Real-time Analysis Tools**: Conversation insights and metrics through MCP protocol
- **Experiment Management Tools**: Create, execute, and monitor bulk experiments via MCP
- **Standards Compliant**: JSON-RPC 2.0 protocol with proper error handling and abort support
- **WebSocket Integration**: Real-time updates and event broadcasting
- **MCP Debug Tools**: Store debugging, resource inspection, and comprehensive error tracking

### Stateless Architecture with PostgreSQL
- **PostgreSQL Backend**: All conversation and experiment data persisted in a relational database
- **Event-Driven Updates**: Internal pub/sub system (EventBus) ensures real-time UI synchronization across components
- **Database-First Design**: Structured data model with proper relationships and constraints
- **Containerized Deployment**: Includes Docker configuration for easy deployment
- **Real-time Synchronization**: Changes propagate immediately through the event system
- **Multi-agent autonomous conversations** between Claude, GPT, and other AI models
- **Real-time moderator intervention** with pause/resume and injection capabilities
- **Persistent shared context** across conversation turns 
- **Abort signal support** for graceful conversation interruption and resumption
- **Template-based session creation** with curated conversation starters
- **Comprehensive error tracking** with retry attempt logging and analysis

### Reliability & Error Handling
- **Exponential Backoff Retry Logic**: Automatic recovery from network failures with 3 retry attempts
- **Smart Error Classification**: Distinguishes between retryable network errors and non-retryable client errors
- **Conversation Continuity**: Network hiccups don't interrupt long-form dialogues or cause participant dropouts
- **Comprehensive Error Tracking**: All API failures logged with attempt counts, timestamps, and retry details
- **Tested Resilience**: Handles 200+ message conversations under various network conditions
- **Graceful Degradation**: Rate limits and authentication errors fail fast without wasting API quota
- **Export Integration**: Error logs included in conversation exports for research analysis

### Advanced Research & Analysis System
- **Live AI Analysis**: Real-time conversation analysis during active dialogues
- **Analysis Snapshots**: Save analysis states at specific points via MCP protocol
- **Analysis Timeline**: View chronological progression of conversation insights
- **Multi-Provider Analysis**: Choose between Claude and GPT for analysis perspectives
- **Conversation Metrics**: Track message counts, participant engagement, and timing
- **Export Integration**: Include analysis data in conversation exports
- **Research Data Formats**: JSON and CSV export options with metadata

### Session Management
- **Session Persistence**: PostgreSQL-backed storage with automatic state management
- **Session Switching**: Seamless navigation between multiple conversations
- **Real-time Status Tracking**: Monitor conversation state and participant activity
- **Session Templates**: Pre-configured scenarios for common research use cases
- **Metadata Management**: Tag, star, and organize sessions for research workflows

### Participant Management
- **AI Agent Configuration**: Custom settings for temperature, tokens, models, and personalities
- **Real-time Status Monitoring**: Track thinking, active, idle, and error states
- **Custom Characteristics**: Define personality traits and areas of expertise
- **Dynamic Participant Addition**: Add agents during active conversations
- **Multi-Model Support**: Chat models from all major LLM providers
- **Participant Analytics**: Message counts and engagement tracking

### Export & Research Tools
- **Export Formats**:
  - JSON format with complete conversation data and metadata
  - CSV format for timeline-based analysis
  - Optional inclusion of analysis snapshots
  - Optional inclusion of API error logs with retry details
  - Configurable metadata inclusion
- **Export Preview**: View full export content before download
- **Analysis Export**: Export analysis timeline separately
- **Batch Export**: Export multiple sessions via MCP tools
- **Research-Ready Data**: Structured formats suitable for external analysis tools

## MCP Integration

The Academy automatically exposes its MCP server at `/api/mcp`. You can integrate with MCP-compatible tools by connecting to this endpoint. 

### Resources
- `academy://sessions` - All conversation sessions with metadata
- `academy://session/{id}` - Individual session data with participants and messages
- `academy://session/{id}/messages` - Complete message history with timestamps
- `academy://session/{id}/participants` - Participant configurations and status
- `academy://session/{id}/analysis` - Real-time analysis snapshots via MCP
- `academy://current` - Currently active session
- `academy://stats` - Platform usage statistics and analytics
- `academy://analysis/stats` - Global analysis statistics across all sessions
- `academy://analysis/timeline` - Complete analysis timeline for research
- `academy://experiments` - All experiment configurations and runs
- `academy://experiment/{id}` - Individual experiment data with run history
- `academy://experiment/{id}/results` - Aggregated experiment results and analytics

### Tools
The Academy provides a comprehensive suite of 66 MCP tools:

#### Session Management (11 tools)
- `create_session` - Create new conversation sessions
- `get_session` - Get a specific session by ID
- `get_sessions` - Get all sessions with optional status filter
- `get_current_session_id` - Get the ID of the currently active session
- `delete_session` - Remove sessions
- `update_session` - Modify session metadata
- `switch_current_session` - Change active session
- `duplicate_session` - Clone existing sessions
- `import_session` - Import session data
- `list_templates` - List available session templates
- `create_session_from_template` - Create from predefined templates

#### Message Management (1 tool)
- `send_message` - Send messages to sessions
- *Note: Message update/delete tools are available under Message Control*

#### Participant Management (6 tools)
- `add_participant` - Add AI agents to conversations
- `remove_participant` - Remove participants from sessions
- `update_participant` - Modify participant settings
- `update_participant_status` - Change participant state
- `list_available_models` - List available AI models
- `get_participant_config` - Get participant configuration

#### Conversation Control (6 tools)
- `start_conversation` - Begin autonomous dialogue with optional max message count
- `pause_conversation` - Pause active conversation
- `resume_conversation` - Resume paused conversation
- `stop_conversation` - End conversation
- `get_conversation_status` - Check conversation state
- `get_conversation_stats` - Retrieve conversation metrics

#### Message Control (4 tools)
- `update_message` - Update existing message content
- `delete_message` - Delete a specific message
- `clear_messages` - Clear all messages in a session
- `inject_moderator_prompt` - Insert moderator messages

#### Analysis Tools (8 tools)
- `analyze_conversation` - Extract insights and patterns from conversations
- `trigger_live_analysis` - Run real-time analysis during active conversations
- `save_analysis_snapshot` - Store analysis data at specific points
- `get_analysis_history` - Retrieve past analyses for a session
- `clear_analysis_history` - Remove analysis data for a session
- `set_analysis_provider` - Choose between Claude or GPT for analysis
- `get_analysis_providers` - List available analysis providers
- `auto_analyze_conversation` - Enable/disable automatic analysis

#### Export Tools (3 tools)
- `export_session` - Export conversation data
- `export_analysis_timeline` - Export analysis history
- `get_export_preview` - Preview export content

#### AI Provider Tools (8 tools)
- `claude_chat` - Claude API access with exponential backoff retry
- `openai_chat` - OpenAI API access with exponential backoff retry
- `grok_chat` - Grok API access with exponential backoff retry
- `gemini_chat` - Gemini API access with exponential backoff retry
- `deepseek_chat` - Deepseek API access with exponential backoff retry
- `mistral_chat` - Mistral API access with exponential backoff retry
- `cohere_chat` - Cohere API access with exponential backoff retry
- `ollama_chat` - Ollama API access with exponential backoff retry

#### Debug & Error Tracking (4 tools)
- `debug_store` - Debug store state and MCP integration
- `get_api_errors` - Retrieve API errors with retry attempt details
- `clear_api_errors` - Clear error logs for sessions or globally
- `log_api_error` - Log an API error for tracking

#### Experiment Management (8 tools)
- `create_experiment` - Create new bulk experiment configuration
- `get_experiments` - Retrieve all experiment configurations
- `get_experiment` - Get specific experiment configuration and run status
- `update_experiment` - Update experiment configuration
- `delete_experiment` - Delete experiment configuration and stop if running
- `create_experiment_run` - Create new experiment run
- `update_experiment_run` - Update experiment run status and progress
- `get_experiment_run` - Get experiment run details

#### Experiment Execution (6 tools)
- `execute_experiment` - Execute bulk experiment creating multiple sessions
- `get_experiment_status` - Get current status and progress of experiment run
- `pause_experiment` - Pause running experiment
- `resume_experiment` - Resume paused experiment
- `stop_experiment` - Stop running experiment
- `get_experiment_results` - Get aggregated results and analytics for completed experiment

### Real-time Integration Examples
```javascript
// Access conversation data via MCP
const messages = await mcp.readResource('academy://session/123/messages')

// Control conversations programmatically with abort support
await mcp.callToolWithAbort('start_conversation', { sessionId, initialPrompt }, abortSignal)

// AI Provider calls with automatic retry logic (3 attempts with exponential backoff)
const response = await mcp.callTool('claude_chat', {
  message: 'Analyze this conversation',
  systemPrompt: 'You are a research assistant',
  sessionId: sessionId
})
// Network failures automatically retry: 1s → 2s → 4s delays
// Rate limits (4xx errors) correctly fail without retry
// Successfully maintains conversation continuity

// Analyze dialogue patterns in real-time
const analysis = await mcp.callTool('analyze_conversation', { sessionId, analysisType: 'full' })

// Save analysis snapshots via MCP protocol
await mcp.callTool('save_analysis_snapshot', { sessionId, ...analysisData })

// Track and export API errors with retry information
const errors = await mcp.callTool('get_api_errors', { sessionId })
console.log(`Session had ${errors.count} API failures with retry details`)

// Export conversations with comprehensive error logs
const exportData = await mcp.callTool('export_session', {
  sessionId,
  format: 'csv',
  includeErrors: true,
  includeAnalysis: true
})
// CSV includes: messages, analysis snapshots, API errors with attempt counts

// Get real-time analysis updates
mcp.subscribe('analysis_snapshot_saved', (data) => {
  console.log('New analysis saved:', data.totalSnapshots)
})

// Create and execute bulk experiments
const experiment = await mcp.callTool('create_experiment', {
  config: {
    name: 'Temperature Study',
    participants: [/* participant configs */],
    totalSessions: 50,
    concurrentSessions: 5,
    maxMessageCount: 30,
    sessionNamePattern: 'Temp Study <date> Session <n>'
  }
})

// Execute experiment with automatic session orchestration
await mcp.callTool('execute_experiment', { 
  experimentId: experiment.experimentId 
})

// Monitor experiment progress
const status = await mcp.callTool('get_experiment_status', { 
  experimentId: experiment.experimentId 
})
console.log(`Progress: ${status.currentRun.progress}%`)
```

## Use Cases

- **Multi-agent AI research** - Study how different AI models interact in extended conversations
- **Conversation analysis** - Analyze dialogue patterns, message flow, and participant dynamics
- **Parameter studies** - Test how temperature, prompts, and settings affect conversation quality
- **Model comparison** - Compare performance of different AI models on identical tasks
- **Intervention experiments** - Study effects of moderator prompts on conversation direction
- **Degradation analysis** - Track how conversation quality changes over extended dialogues
- **MCP integration testing** - Develop and test MCP-compatible tools and workflows
- **Educational demonstrations** - Teach concepts of multi-agent systems and dialogue management
- **Synthetic data generation** - Create conversational datasets for research purposes
- **Bulk experiment execution** - Run large-scale studies through programmatic control
- **Temperature and parameter sweeps** - Systematically test AI behavior across different configurations
- **Comparative model studies** - Run identical experiments across different AI providers

## Technology Stack

- **Next.js 15** - Modern React framework with App Router and server-side capabilities
- **Model Context Protocol (MCP)** - Full server implementation with JSON-RPC 2.0
- **PostgreSQL** - Relational database for persistent data storage
- **TypeScript** - Type-safe development with comprehensive interfaces
- **Tailwind CSS** - Responsive, accessible UI design with custom Academy theme
- **EventBus** - Internal pub/sub system for real-time UI updates
- **AI APIs** - Direct integration with 8 major LLM providers
- **WebSocket Support** - Real-time communication for MCP protocol
- **Docker** - Containerized deployment with PostgreSQL and pgAdmin

## Getting Started 

### Prerequisites
- Node.js 18+ 
- Docker and Docker Compose (for PostgreSQL)
- API keys for AI providers you intend to use

### Running with Docker Compose

The Academy requires PostgreSQL for data persistence. The easiest way to set this up is using the provided Docker Compose configuration:

```bash
# Clone the repository
git clone https://github.com/yourname/the-academy.git
cd the-academy

# Start PostgreSQL and pgAdmin
docker-compose up -d
```

The Docker Compose setup includes:
- PostgreSQL 15 on port 5432
- pgAdmin 4 on port 5050 (admin@academy.local / admin)
- Automatic database initialization with required schema

### Running with Docker (Application Only)
Note: You only need to provide api keys for providers you intend to use. 

```bash 
git clone https://github.com/yourname/the-academy.git
cd the-academy/academy
docker build -t the-academy .
docker run -d \
  --name academy-app \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your_claude_api_key_here \
  -e OPENAI_API_KEY=your_openai_api_key_here \
  -e XAI_API_KEY=your_xai_api_key_here \
  -e GOOGLE_AI_API_KEY=your_google_ai_api_key_here \
  -e DEEPSEEK_API_KEY=your_deepseek_api_key_here \
  -e MISTRAL_API_KEY=your_mistral_api_key_here \
  -e COHERE_API_KEY=your_cohere_api_key_here \
  -e NODE_ENV=production \
  -e POSTGRES_HOST=localhost \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=academy_user \
  -e POSTGRES_PASSWORD=academy_password \
  -e POSTGRES_DB=academy_db \
  -e DATABASE_URL=postgresql://academy_user:academy_password@localhost:5432/academy_db \
  -e PGADMIN_EMAIL=admin@academy.local \
  -e PGADMIN_PASSWORD=admin \
  --restart unless-stopped \
  the-academy
```

### Running with Node
- Node.js 18+ 
- API keys for Anthropic Claude and/or OpenAI GPT

#### Installation

```bash
git clone https://github.com/yourname/the-academy.git
cd the-academy/academy
pnpm install
```

#### Configuration

Create a `.env.local` file with your API keys:
```env
ANTHROPIC_API_KEY=your_claude_api_key_here 
OPENAI_API_KEY=your_openai_api_key_here 
XAI_API_KEY=your_xai_api_key_here 
GOOGLE_AI_API_KEY=your_google_ai_api_key_here 
DEEPSEEK_API_KEY=your_deepseek_api_key_here 
MISTRAL_API_KEY=your_mistral_api_key_here 
COHERE_API_KEY=your_cohere_api_key_here 
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=academy_user
POSTGRES_PASSWORD=academy_password
POSTGRES_DB=academy_db
DATABASE_URL=postgresql://academy_user:academy_password@localhost:5432/academy_db
PGADMIN_EMAIL=admin@academy.local
PGADMIN_PASSWORD=admin
```

#### Launch

```bash
pnpm dev
```

Visit `http://localhost:3000` to access The Academy interface.


## Example Workflows

### Basic AI Dialogue with Real-time Analysis
1. Create a new session using a consciousness exploration template
2. Add Claude and GPT as participants with custom personality settings
3. Send an opening prompt to begin autonomous conversation
4. Monitor real-time AI analysis in the Live Summary panel
5. Use moderator controls to pause and inject guidance as needed
6. Export comprehensive research data including analysis timeline

### MCP-Powered Research Pipeline
1. Use MCP tools to programmatically create multiple experimental sessions
2. Run controlled experiments with different prompts, models, and participants
3. Monitor real-time analysis updates via MCP event subscriptions
4. Access all conversation data and analysis via MCP resources
5. Perform batch analysis across sessions using MCP tools
6. Export results with complete analysis history for external research tools

### Advanced Analysis Workflow
1. Set up conversation with multiple AI providers (Claude + GPT)
2. Enable automatic analysis with selected provider (Claude for philosophical depth, GPT for pattern recognition)
3. Monitor live analysis updates and snapshots in real-time
4. Save analysis snapshots automatically via MCP protocol
5. Export complete analysis timeline for academic research
6. Integrate with external MCP-compatible analysis tools

### Bulk Experiment Execution
1. Design experiment configuration with participant settings and session parameters
2. Set total sessions and concurrency limits for controlled execution
3. Execute experiment with automatic session creation and conversation management
4. Monitor real-time progress across all concurrent sessions
5. Handle failures gracefully without stopping the entire experiment
6. Aggregate results and export comprehensive analytics for research analysis

## Contributing

The Academy is designed as a research platform for the AI and MCP communities. Contributions are welcome in areas including:

- **MCP tool extensions** for specialized analysis and research workflows
- **Additional AI provider integrations** the more integrations the better
- **Advanced analysis algorithms** for conversation pattern detection
- **Research methodology templates** for specific use cases
- **Real-time collaboration features** for multi-researcher environments
- **UI/UX improvements** for research workflows and data visualization
- **Performance optimizations** for large-scale conversation analysis
- **Export format extensions** for integration with research tools

Please feel free to open an issue or a pull request. I'd love to develop The Academy further with collaborators who are exploring multi-agent AI systems, conversation analysis, and the MCP ecosystem.

## License

MIT License - see LICENSE file for details.