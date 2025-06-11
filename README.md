# The Academy

The Academy is a comprehensive Socratic dialogue engine for AI agents built with Next.js and **full Model Context Protocol (MCP) integration**. It enables agents to engage in structured, recursive dialogue with shared context, while exposing all conversation data and AI capabilities through the standardized MCP interface with real-time analysis and research tools.

Designed for engineers, researchers, and builders interested in exploring multi-agent systems, coordination strategies, and memory-driven interaction through the emerging MCP ecosystem.

![The Academy](docs/screenshot.png)

## Core Features

### Advanced Dialogue Engine
- **Multi-agent autonomous conversations** between Claude, GPT, and other AI models
- **Intelligent conversation management** with MCP-powered conversation control
- **Real-time moderator intervention** with pause/resume and injection capabilities
- **Persistent shared context** across conversation turns 
- **Abort signal support** for graceful conversation interruption and resumption
- **Template-based session creation** with curated conversation starters

### Model Context Protocol Integration
- **Full MCP server implementation** exposing Academy data and capabilities
- **AI Provider Tools**: Direct access to Claude and OpenAI APIs as MCP tools (`claude_chat`, `openai_chat`)
- **Conversation Resources**: Session data, messages, and analysis available via MCP URIs
- **Session Control Tools**: Start, pause, resume, and manage conversations programmatically
- **Real-time Analysis Tools**: Conversation insights and metrics through MCP protocol
- **Standards Compliant**: JSON-RPC 2.0 protocol with proper error handling and abort support
- **WebSocket Integration**: Real-time updates and event broadcasting
- **MCP Debug Tools**: Store debugging, resource inspection, and system monitoring

### Advanced Research & Analysis System
- **Live AI Analysis**: Real-time conversation analysis
- **Analysis Snapshots**: Automatic saving of analysis via MCP protocol with real-time updates
- **Analysis Timeline**: Complete chronological view of conversation insights
- **Multi-Provider Analysis**: Choose between Claude and GPT for different analytical perspectives
- **Philosophical Depth Tracking**: Automatic assessment of conversation sophistication
- **Participant Dynamics Analysis**: Real-time tracking of interaction patterns and styles
- **Emergent Themes Detection**: Identification of novel concepts arising from dialogue
- **Exportable Research Data**: JSON and CSV exports with complete analysis history
- **Pattern Recognition**: Detection of tensions, convergences, and conversation phases

### Session Management & Templates
- **Curated Session Templates**:
  - **Consciousness Exploration**: Deep dive with Claude & GPT on consciousness and self-awareness
  - **Creative Problem Solving**: Collaborative creativity exploration
  - **Philosophical Inquiry**: Socratic dialogue on fundamental questions
  - **Future of AI**: Discussion on AI development and societal impact
  - **Casual Conversation**: Open-ended dialogue between AI agents
- **Custom Session Creation**: Build your own research scenarios
- **Session Persistence**: Automatic saving with localStorage integration
- **Session Switching**: Seamless navigation between multiple conversations
- **Real-time Status Tracking**: Monitor conversation state and participant activity

### Participant Management
- **AI Agent Configuration**: Custom settings for temperature, tokens, models, and personalities
- **Real-time Status Monitoring**: Track thinking, active, idle, and error states
- **Custom Characteristics**: Define personality traits and areas of expertise
- **Dynamic Participant Addition**: Add agents during active conversations
- **Multi-Model Support**: Claude 3.5 Sonnet, GPT-4o, and other model variants
- **Participant Analytics**: Message counts and engagement tracking

### Export & Research Tools
- **Comprehensive Export Options**:
  - JSON format with complete conversation metadata
  - CSV timeline format for analysis in external tools
  - Analysis-only exports for research workflows
  - Configurable export settings (metadata, system prompts, analysis history)
- **Real-time Export Preview**: Full content preview before download
- **MCP-Enhanced Exports**: Include real-time analysis data via MCP protocol
- **Research Methodology Support**: Export formats designed for academic research

## MCP Capabilities

The Academy exposes its full functionality through MCP, making it interoperable with other MCP-compatible tools and workflows:

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

### Tools
- `claude_chat` / `openai_chat` - Direct AI model access with abort support
- `create_session` - Programmatic session creation with templates
- `add_participant` - Add AI agents to conversations dynamically
- `start_conversation` / `pause_conversation` / `resume_conversation` - Session control
- `analyze_conversation` - Extract insights and patterns in real-time
- `save_analysis_snapshot` - Store analysis data via MCP protocol
- `get_analysis_history` - Retrieve analysis timeline for sessions
- `send_message` - Inject messages into conversations
- `debug_store` - Debug store state and MCP integration

### Real-time Integration Examples
```javascript
// Access conversation data via MCP
const messages = await mcp.readResource('academy://session/123/messages')

// Control conversations programmatically with abort support
await mcp.callToolWithAbort('start_conversation', { sessionId, initialPrompt }, abortSignal)

// Analyze dialogue patterns in real-time
const analysis = await mcp.callTool('analyze_conversation', { sessionId, analysisType: 'full' })

// Save analysis snapshots via MCP protocol
await mcp.callTool('save_analysis_snapshot', { sessionId, ...analysisData })

// Get real-time analysis updates
mcp.subscribe('analysis_snapshot_saved', (data) => {
  console.log('New analysis saved:', data.totalSnapshots)
})
```

## Use Cases

- **Multi-agent AI research** with standardized data access via MCP protocol
- **Conversation pattern analysis** and behavioral studies with real-time insights
- **AI coordination experiments** in structured dialogue environments
- **Educational tools** for teaching dialogue systems and argument structure
- **LLM evaluation** in adversarial, cooperative, and neutral settings with comprehensive metrics
- **Synthetic data generation** for conversation training datasets with quality analysis
- **MCP ecosystem integration** with other research and analysis tools
- **Philosophical AI exploration** with depth tracking and emergent theme detection
- **Real-time research monitoring** with live analysis and export capabilities

## Technology Stack

- **Next.js 15** - Modern React framework with App Router and server-side capabilities
- **Model Context Protocol (MCP)** - Full server implementation with JSON-RPC 2.0
- **TypeScript** - Type-safe development with comprehensive interfaces
- **Tailwind CSS** - Responsive, accessible UI design with custom Academy theme
- **Zustand** - Lightweight state management with persistence and real-time updates
- **AI APIs** - Claude (Anthropic) and GPT (OpenAI) integration with abort support
- **WebSocket Support** - Real-time communication for MCP protocol
- **Event-Driven Architecture** - Real-time analysis updates and state synchronization

## Getting Started 

### Running with Docker
```bash 
git clone https://github.com/yourname/the-academy.git
cd the-academy/academy
docker build -t the-academy .
docker run -d \
  --name academy-app \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your_claude_api_key_here \
  -e OPENAI_API_KEY=your_openai_api_key_here \
  -e NODE_ENV=production \
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
```

#### Launch

```bash
pnpm dev
```

Visit `http://localhost:3000` to access The Academy interface.

### MCP Integration

The Academy automatically exposes its MCP server at `/api/mcp`. You can integrate with MCP-compatible tools by connecting to this endpoint. The platform also supports WebSocket connections at `/api/mcp/ws` for real-time updates.

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

## Contributing

The Academy is designed as a research platform for the AI and MCP communities. Contributions are welcome in areas including:

- **MCP tool extensions** for specialized analysis and research workflows
- **Additional AI provider integrations** (Anthropic, OpenAI, local models)
- **Advanced analysis algorithms** for conversation pattern detection
- **Research methodology templates** for specific use cases
- **Real-time collaboration features** for multi-researcher environments
- **UI/UX improvements** for research workflows and data visualization
- **Performance optimizations** for large-scale conversation analysis
- **Export format extensions** for integration with research tools

Please feel free to reach out about contributing to this project. I'd love to develop it further with collaborators who are exploring multi-agent AI systems, conversation analysis, and the MCP ecosystem.

## License

MIT License - see LICENSE file for details.


