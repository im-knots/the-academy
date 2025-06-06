# The Academy

The Academy is a Socratic dialogue engine for AI agents built with Next.js and **full Model Context Protocol (MCP) integration**. It enables agents to engage in structured, recursive dialogue with shared context, while exposing all conversation data and AI capabilities through the standardized MCP interface.

Designed for engineers, researchers, and builders interested in exploring multi-agent systems, coordination strategies, and memory-driven interaction through the emerging MCP ecosystem.

![The Academy](docs/screenshot.png)

## Core Features

### Dialogue Engine
- **Multi-agent autonomous conversations** between Claude, GPT, and other AI models
- **Persistent shared context** across conversation turns and sessions
- **Real-time moderator intervention** and guidance capabilities
- **Session management** with templates, export, and analysis tools

### Model Context Protocol Integration
- **Full MCP server implementation** exposing Academy data and capabilities
- **AI Provider Tools**: Access Claude and OpenAI APIs as MCP tools (`claude_chat`, `openai_chat`)
- **Conversation Resources**: Session data, messages, and analysis available via MCP URIs
- **Session Control Tools**: Start, pause, resume, and manage conversations programmatically
- **Real-time Analysis**: Conversation insights and metrics through MCP tools
- **Standards Compliant**: JSON-RPC 2.0 protocol with proper error handling

### Research & Analysis
- **Exportable conversation logs** in JSON and CSV formats with metadata
- **Built-in conversation analysis** for patterns, sentiment, and engagement
- **Session templates** for reproducible experimental conditions
- **Real-time participant monitoring** and status tracking

## MCP Capabilities

The Academy exposes its full functionality through MCP, making it interoperable with other MCP-compatible tools and workflows:

### Resources
- `academy://sessions` - All conversation sessions
- `academy://session/{id}` - Individual session data
- `academy://session/{id}/messages` - Complete message history
- `academy://current` - Currently active session
- `academy://stats` - Platform usage statistics

### Tools
- `claude_chat` / `openai_chat` - Direct AI model access
- `create_session` - Programmatic session creation
- `add_participant` - Add AI agents to conversations
- `start_conversation` / `pause_conversation` - Session control
- `analyze_conversation` - Extract insights and patterns
- `send_message` - Inject messages into conversations

### Integration Examples
```javascript
// Access conversation data via MCP
const messages = await mcp.readResource('academy://session/123/messages')

// Control conversations programmatically  
await mcp.callTool('start_conversation', { sessionId, initialPrompt })

// Analyze dialogue patterns
const analysis = await mcp.callTool('analyze_conversation', { sessionId })
```

## Use Cases

- **Multi-agent AI research** with standardized data access via MCP
- **Conversation pattern analysis** and behavioral studies
- **AI coordination experiments** in structured dialogue environments
- **Educational tools** for teaching dialogue systems and argument structure
- **LLM evaluation** in adversarial, cooperative, and neutral settings
- **Synthetic data generation** for conversation training datasets
- **MCP ecosystem integration** with other research and analysis tools

## Technology Stack

- **Next.js 15** - Modern React framework with server-side capabilities
- **Model Context Protocol (MCP)** - Full server implementation with JSON-RPC 2.0
- **TypeScript** - Type-safe development with comprehensive interfaces
- **Tailwind CSS** - Responsive, accessible UI design
- **Zustand** - Lightweight state management with persistence
- **AI APIs** - Claude (Anthropic) and GPT (OpenAI) integration

## Getting Started

### Prerequisites
- Node.js 18+ 
- API keys for Anthropic and/or OpenAI

### Installation

```bash
git clone https://github.com/yourname/the-academy.git
cd the-academy/academy
pnpm install
```

### Configuration

Create a `.env.local` file with your API keys:
```env
ANTHROPIC_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

### Launch

```bash
pnpm dev
```

Visit `http://localhost:3000` to access The Academy interface.

### MCP Integration

The Academy automatically exposes its MCP server at `/api/mcp`. You can integrate with MCP-compatible tools by connecting to this endpoint.

## Example Workflows

### Basic AI Dialogue
1. Create a new session with a research question
2. Add Claude and GPT as participants  
3. Send an opening prompt to begin autonomous conversation
4. Monitor the dialogue and interject as needed
5. Export conversation data for analysis

### MCP-Powered Research
1. Use MCP tools to programmatically create multiple sessions
2. Run controlled experiments with different prompts/participants
3. Access all conversation data via MCP resources
4. Perform batch analysis across sessions
5. Integrate results with external research tools

## Contributing

The Academy is designed as a research platform for the AI and MCP communities. Contributions are welcome in areas including:

- **MCP tool extensions** for specialized analysis
- **Additional AI provider integrations** 
- **Research methodology templates**
- **Conversation analysis algorithms**
- **UI/UX improvements** for research workflows

Please feel free to reach out about contributing to this project. We'd love to develop it further with collaborators who are exploring multi-agent AI systems and the MCP ecosystem.

## License

MIT License - see LICENSE file for details.