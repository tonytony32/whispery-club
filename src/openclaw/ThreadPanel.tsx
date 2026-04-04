/**
 * ThreadPanel — tree-structured thread view + thought drawer + HitL toolbar.
 *
 * Renders messages in a tree using parentId references.
 * Max visual depth: 4 — beyond that collapses to "[ver subárbol]".
 */

import { useRef, useEffect, useState } from 'react'
import { useOpenClawStore } from './store'
import AgentBubble from './AgentBubble'
import ThoughtStream from './ThoughtStream'
import HumanControls from './HumanControls'
import type { AgentMessage } from './types'

const MAX_DEPTH = 4

interface TreeNode {
  msg:      AgentMessage
  depth:    number
  children: TreeNode[]
}

function buildTree(messages: AgentMessage[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const msg of messages) {
    byId.set(msg.id, { msg, depth: 0, children: [] })
  }

  for (const msg of messages) {
    const node = byId.get(msg.id)!
    if (msg.parentId && byId.has(msg.parentId)) {
      const parent = byId.get(msg.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function renderTree(nodes: TreeNode[]): React.ReactNode[] {
  const result: React.ReactNode[] = []

  function walk(node: TreeNode) {
    if (node.depth >= MAX_DEPTH) {
      result.push(
        <div key={node.msg.id + '-collapsed'} style={{
          marginLeft: node.depth * 24,
          color: '#475569', fontSize: 10,
          fontFamily: '"IBM Plex Mono", monospace',
          marginBottom: 6, cursor: 'default',
        }}>
          [ver subárbol — {countDescendants(node)} mensajes]
        </div>
      )
      return
    }
    result.push(
      <AgentBubble key={node.msg.id} msg={node.msg} depth={node.depth} />
    )
    for (const child of node.children) walk(child)
  }

  for (const root of nodes) walk(root)
  return result
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0)
}

// ── CollapsibleSubtree placeholder for deep nesting ──────────────────────────

export default function ThreadPanel() {
  const messages = useOpenClawStore(s => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const tree = buildTree(messages)
  const nodes = renderTree(tree)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: '#0b0b0e',
    }}>
      {/* Toolbar row */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        padding: '10px 16px 0',
        flexShrink: 0,
      }}>
        <HumanControls />
      </div>

      {/* Thread scroll area */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 16px',
        minHeight: 0,
      }}>
        {messages.length === 0 ? (
          <div style={{
            color: '#334155', fontSize: 12,
            fontFamily: '"IBM Plex Mono", monospace',
            margin: '40px auto', textAlign: 'center',
          }}>
            Esperando agentes…
          </div>
        ) : nodes}
        <div ref={bottomRef} />
      </div>

      {/* Thought stream drawer */}
      <div style={{ flexShrink: 0 }}>
        <ThoughtStream />
      </div>
    </div>
  )
}
