// src/app/api/mcp/route.ts - Updated to import types instead of defining locally
import { NextRequest, NextResponse } from 'next/server'
import { MCPServer } from '@/lib/mcp/server'
import { JSONRPCRequest, JSONRPCResponse } from '@/lib/mcp/types'

const mcpServer = new MCPServer()

export async function POST(request: NextRequest) {
  try {
    const rpcRequest: JSONRPCRequest = await request.json()

    // Validate JSON-RPC format
    if (rpcRequest.jsonrpc !== '2.0') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: rpcRequest.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      } as JSONRPCResponse)
    }

    // Handle MCP methods
    const response = await mcpServer.handleRequest(rpcRequest)
    
    return NextResponse.json(response)

  } catch (error) {
    console.error('MCP Server error:', error)
    
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    } as JSONRPCResponse)
  }
}

// Handle preflight requests for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}