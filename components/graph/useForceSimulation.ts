import type { EdgeType, GraphNode, NodeType } from '@/services/graph/GraphService';
import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SimNode {
    id: number;
    type: NodeType;
    name: string;
    x: number;
    y: number;
    playCount: number;
    spotifyId: string | null;
    data: any;
}

export interface SimEdge {
    sourceId: number;
    targetId: number;
    type: EdgeType;
    weight: number;
    // Resolved positions (set on tick)
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface UseForceSimulationOptions {
    width: number;
    height: number;
    rawNodes: GraphNode[];
    rawEdges: { source: number; target: number; type: EdgeType; weight: number }[];
}

export function useForceSimulation({ width, height, rawNodes, rawEdges }: UseForceSimulationOptions) {
    const [nodes, setNodes] = useState<SimNode[]>([]);
    const [edges, setEdges] = useState<SimEdge[]>([]);
    const [isSimulating, setIsSimulating] = useState(false);
    const [progress, setProgress] = useState(0);
    const simRef = useRef<d3.Simulation<any, any> | null>(null);
    const simNodesRef = useRef<any[]>([]);
    const simEdgesRef = useRef<any[]>([]);

    const buildSim = useCallback(() => {
        if (width <= 0 || height <= 0 || rawNodes.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        setIsSimulating(true);
        setProgress(0);

        // Stop previous simulation
        simRef.current?.stop();

        const ids = new Set(rawNodes.map(n => n.id));

        // Build d3-compatible node objects
        const dNodes = rawNodes.map((n, index) => ({
            id: n.id,
            type: n.type,
            name: n.name,
            playCount: n.play_count || 0,
            lastPlayedAt: n.last_played_at,
            spotifyId: n.spotify_id,
            data: n.data,
            // Vertical Bias: spread Y based on index/type to encourage top-to-bottom flow
            // Random X to avoid stacking
            x: n.x ?? (width / 2 + (Math.random() - 0.5) * width * 0.8),
            y: n.y ?? ((height * 0.1) + ((index / rawNodes.length) * (height * 0.8)) + (Math.random() - 0.5) * 50),
        }));

        // Build d3-compatible edge objects (filter invalid)
        const dEdges = rawEdges
            .filter(e => ids.has(e.source) && ids.has(e.target))
            .map(e => ({
                source: e.source,
                target: e.target,
                type: e.type,
                weight: e.weight,
            }));

        simNodesRef.current = dNodes;
        simEdgesRef.current = dEdges;

        const sim = d3.forceSimulation(dNodes)
            .force('link', d3.forceLink(dEdges).id((d: any) => d.id).distance(50).strength(0.2))
            .force('charge', d3.forceManyBody().strength(-60))
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
            .force('collide', d3.forceCollide(8))
            .force('y', d3.forceY((d: any, i: number, nodes: any[]) => (height * i) / nodes.length).strength(0.1))
            .alphaDecay(0.02)
            .stop(); // Don't auto-start

        simRef.current = sim;

        simRef.current = sim;

        // --- ASYNC WARM UP ---
        // Check if we have cached positions
        const hasCachedPositions = rawNodes.every(n => n.x !== undefined && n.y !== undefined);
        const totalTicks = hasCachedPositions ? 0 : 300; // Skip warmup if cached
        const batchSize = 20;
        let currentTick = 0;

        if (hasCachedPositions) {
            console.log('[useForceSimulation] Using cached positions, skipping warmup');
        } else {
            console.log('[useForceSimulation] No cached positions, running warmup...');
        }

        const runBatch = () => {
            const start = performance.now();
            while (currentTick < totalTicks && performance.now() - start < 16) {
                sim.tick();
                currentTick++;
            }

            // Update progress
            setProgress(currentTick / totalTicks);

            if (currentTick < totalTicks) {
                // Continue next frame
                requestAnimationFrame(runBatch);
            } else {
                // Done
                finishSim();
            }
        };

        const finishSim = () => {
            // Initial stabilized state
            const initialNodes: SimNode[] = simNodesRef.current.map((n: any) => ({
                id: n.id,
                type: n.type,
                name: n.name,
                x: n.x,
                y: n.y,
                playCount: n.playCount,
                spotifyId: n.spotifyId,
                data: n.data,
            }));

            const nodeMap = new Map(simNodesRef.current.map((n: any) => [n.id, n]));
            const initialEdges: SimEdge[] = simEdgesRef.current.map((e: any) => {
                const src = typeof e.source === 'object' ? e.source : nodeMap.get(e.source);
                const tgt = typeof e.target === 'object' ? e.target : nodeMap.get(e.target);
                return {
                    sourceId: src?.id ?? e.source,
                    targetId: tgt?.id ?? e.target,
                    type: e.type,
                    weight: e.weight,
                    x1: src?.x ?? 0,
                    y1: src?.y ?? 0,
                    x2: tgt?.x ?? 0,
                    y2: tgt?.y ?? 0,
                };
            });

            setNodes(initialNodes);
            setEdges(initialEdges);
            setIsSimulating(false);
        };

        // Start async batching
        requestAnimationFrame(runBatch);

    }, [width, height, rawNodes, rawEdges]);

    useEffect(() => {
        buildSim();
        return () => {
            simRef.current?.stop();
        };
    }, [buildSim]);

    const reload = useCallback(() => {
        buildSim();
    }, [buildSim]);

    const dragNode = useCallback((nodeId: number, x: number, y: number) => {
        const n = simNodesRef.current.find((n: any) => n.id === nodeId);
        if (n && simRef.current) {
            n.fx = x;
            n.fy = y;
            simRef.current.alphaTarget(0.3).restart();
        }
    }, []);

    const releaseNode = useCallback((nodeId: number) => {
        const n = simNodesRef.current.find((n: any) => n.id === nodeId);
        if (n && simRef.current) {
            n.fx = null;
            n.fy = null;
            simRef.current.alphaTarget(0);
        }
    }, []);

    return { nodes, edges, reload, dragNode, releaseNode, isSimulating, progress };
}
