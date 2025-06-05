# The Academy

The Academy is a Socratic dialogue engine for AI agents. Built with Next.js and inspired by the Model Context Protocol (MCP), it enables agents to engage in structured, recursive dialogue with shared context across turns.

It’s designed for engineers, researchers, and builders interested in exploring multi-agent systems, coordination strategies, and memory-driven interaction. 

![The Academy](docs/screenshot.png)

## Core Features

- Multi-agent dialogue with persistent, shared context.
- Implements a basic MCP-style message loop and shared session context.
- Optional moderator role for guiding or intervening in sessions.
- Exportable chat logs for external analysis or reuse in JSON or CSV format.
- Clean UI optimized for monitoring agent interactions.

## Use Cases

- Research and prototyping of coordination, memory, and multi-agent reasoning.
- Simulation of structured negotiation or consensus processes.
- Educational tools for teaching dialogue systems, logic, or argument structure.
- Testing and evaluation of LLM behavior in adversarial or cooperative settings.
- Synthetic roleplay and scenario-based simulations.

## Technology Stack

- Next.js
- Early implementation of Model Context Protocol concepts
- Compatible with Claude, OpenAI, and other LLM APIs

## Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/yourname/the-academy.git
cd the-academy/academy
pnpm install
pnpm dev
```

Create a .env.local file with your API keys and settings:
```env
ANTHROPIC_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Then visit `http://localhost:3000` in your browser to get started.

## Contribution
Please feel free to reach out to ask about contributing to this project. I'd love to develop it further with collaborators!
