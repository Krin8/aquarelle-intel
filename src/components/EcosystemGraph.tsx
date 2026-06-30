'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { getEcosystemGraph, getEcosystemProgress, startCrawlAction, clearEcosystem } from '@/actions/ecosystem-actions';

// ─── CUSTOM NODE COMPONENT ───────────────────────────────────────────────────
const CustomNode = ({ data }: any) => {
  const getColors = (type: string) => {
    switch (type) {
      case 'brand': return { bg: 'var(--bg-card)', border: 'var(--accent-cyan)' };
      case 'supplier': return { bg: 'var(--bg-card)', border: 'var(--accent-emerald)' };
      case 'technology': return { bg: 'var(--bg-card)', border: 'var(--accent-purple)' };
      case 'logistics': return { bg: 'var(--bg-card)', border: 'var(--accent-amber)' };
      case 'investor': return { bg: 'var(--bg-card)', border: 'var(--text-primary)' };
      case 'competitor': return { bg: 'var(--bg-card)', border: 'var(--accent-rose)' };
      case 'person': return { bg: 'var(--bg-card)', border: 'var(--text-muted)' };
      default: return { bg: 'var(--bg-card)', border: 'var(--border-subtle)' };
    }
  };

  const colors = getColors(data.type);

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '12px',
      minWidth: '150px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      color: 'var(--text-primary)'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: colors.border }} />
      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: colors.border, fontWeight: 'bold', marginBottom: '4px' }}>
        {data.type}
      </div>
      <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
        {data.name}
      </div>
      {data.url && (
        <a href={data.url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: 'var(--accent-cyan)', textDecoration: 'none' }}>
          {new URL(data.url).hostname.replace('www.', '')}
        </a>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// ─── AUTO LAYOUT ─────────────────────────────────────────────────────────────
const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 200;
  const nodeHeight = 100;

  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function EcosystemGraph({ brandId }: { brandId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [progress, setProgress] = useState<any>(null);
  
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxNodes, setMaxNodes] = useState(150);

  const fetchGraph = useCallback(async () => {
    const data = await getEcosystemGraph(brandId);
    
    const initialNodes = data.nodes.map((n: any) => ({
      id: n.id,
      type: 'custom',
      data: { name: n.name, type: n.type, url: n.url, description: n.description },
      position: { x: 0, y: 0 },
    }));

    const initialEdges = data.edges.map((e: any) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.relationType.replace(/_/g, ' '),
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: 'var(--text-muted)' },
      labelStyle: { fill: 'var(--text-muted)', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: 'var(--bg-primary)' },
    }));

    if (initialNodes.length > 0) {
      const layouted = getLayoutedElements(initialNodes, initialEdges);
      setNodes(layouted.nodes as any);
      setEdges(layouted.edges as any);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [brandId, setNodes, setEdges]);

  const fetchProgress = useCallback(async () => {
    const p = await getEcosystemProgress(brandId);
    setProgress(p);
    if (p.isScanning) {
      fetchGraph(); // live update the graph while scanning
    }
  }, [brandId, fetchGraph]);

  useEffect(() => {
    fetchGraph();
    fetchProgress();
    const interval = setInterval(fetchProgress, 3000);
    return () => clearInterval(interval);
  }, [fetchGraph, fetchProgress]);

  const handleStart = async () => {
    await startCrawlAction(brandId, maxDepth, maxNodes);
    fetchProgress();
  };

  const handleClear = async () => {
    if (confirm('Clear entire ecosystem graph?')) {
      await clearEcosystem(brandId);
      fetchGraph();
      fetchProgress();
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Settings Bar */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Max Depth</label>
            <input 
              type="number" 
              value={maxDepth} 
              onChange={e => setMaxDepth(Number(e.target.value))}
              className="input-field" 
              style={{ width: '80px', padding: '4px 8px' }} 
              min={1} 
              max={10} 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Max Nodes</label>
            <input 
              type="number" 
              value={maxNodes} 
              onChange={e => setMaxNodes(Number(e.target.value))}
              className="input-field" 
              style={{ width: '100px', padding: '4px 8px' }} 
              min={10} 
              max={1000} 
            />
          </div>

          {progress && (
            <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '13px', marginLeft: 'var(--space-lg)' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Total:</span> {progress.total}</div>
              <div><span style={{ color: 'var(--accent-cyan)' }}>Crawling:</span> {progress.crawling}</div>
              <div><span style={{ color: 'var(--accent-emerald)' }}>Done:</span> {progress.completed}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Pending:</span> {progress.pending}</div>
              {progress.failed > 0 && <div><span style={{ color: 'var(--accent-rose)' }}>Failed:</span> {progress.failed}</div>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {nodes.length > 0 && !progress?.isScanning && (
            <button onClick={handleClear} className="btn btn-ghost" style={{ color: 'var(--accent-rose)' }}>
              Clear
            </button>
          )}
          <button 
            className="btn btn-primary" 
            onClick={handleStart} 
            disabled={progress?.isScanning}
            style={progress?.isScanning ? { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' } : {}}
          >
            {progress?.isScanning ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="scan-pulse" /> Scanning...
              </span>
            ) : nodes.length > 0 ? 'Expand Graph' : 'Start Ecosystem Crawl'}
          </button>
        </div>
      </div>

      {/* Graph Area */}
      <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
          minZoom={0.1}
        >
          <Background color="var(--border-subtle)" gap={16} />
          <Controls />
          <MiniMap 
            nodeColor={(node) => {
              switch (node.data.type) {
                case 'brand': return '#00f0ff';
                case 'supplier': return '#10b981';
                case 'technology': return '#a855f7';
                case 'logistics': return '#f59e0b';
                case 'competitor': return '#f43f5e';
                default: return '#52525b';
              }
            }}
            maskColor="rgba(9, 9, 11, 0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
