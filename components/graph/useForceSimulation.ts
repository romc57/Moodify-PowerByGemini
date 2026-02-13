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

        // Exclude AUDIO_FEATURE nodes from simulation — they are super-hubs connected
        // to every song, making the force layout extremely slow on large graphs.
        // Also exclude HAS_FEATURE edges (one per song per feature = 6x songs).
        const SIM_EXCLUDE_NODE_TYPES = new Set(['AUDIO_FEATURE']);
        const SIM_EXCLUDE_EDGE_TYPES = new Set(['HAS_FEATURE']);

        const simRawNodes = rawNodes.filter(n => !SIM_EXCLUDE_NODE_TYPES.has(n.type));
        const simRawEdges = rawEdges.filter(e => !SIM_EXCLUDE_EDGE_TYPES.has(e.type));

        const ids = new Set(simRawNodes.map(n => n.id));

        // Build d3-compatible node objects
        const dNodes = simRawNodes.map((n, index) => ({
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
            y: n.y ?? ((height * 0.1) + ((index / simRawNodes.length) * (height * 0.8)) + (Math.random() - 0.5) * 50),
        }));

        // Build d3-compatible edge objects (filter invalid)
        const dEdges = simRawEdges
            .filter(e => ids.has(e.source) && ids.has(e.target))
            .map(e => ({
                source: e.source,
                target: e.target,
                type: e.type,
                weight: e.weight,
            }));

        simNodesRef.current = dNodes;
        simEdgesRef.current = dEdges;

        console.log(`[useForceSimulation] Sim input: ${dNodes.length} nodes, ${dEdges.length} edges (excluded ${rawNodes.length - simRawNodes.length} nodes, ${rawEdges.length - simRawEdges.length} edges)`);

        // Scale forces for graph size
        const isLarge = dNodes.length > 500;
        const linkDistance = isLarge ? 30 : 50;
        const chargeStrength = isLarge ? -30 : -60;
        const alphaDecay = isLarge ? 0.05 : 0.02;

        const sim = d3.forceSimulation(dNodes)
            .force('link', d3.forceLink(dEdges).id((d: any) => d.id).distance(linkDistance).strength(0.2))
            .force('charge', d3.forceManyBody().strength(chargeStrength))
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
            .force('collide', d3.forceCollide(8))
            .force('y', d3.forceY((d: any, i: number, nodes: any[]) => (height * i) / nodes.length).strength(0.1))
            .alphaDecay(alphaDecay)
            .stop(); // Don't auto-start

        simRef.current = sim;

        // --- ASYNC WARM UP ---
        // Check if most nodes have cached positions (>80% threshold)
        const cachedCount = simRawNodes.filter(n => n.x !== undefined && n.y !== undefined).length;
        const cachedRatio = simRawNodes.length > 0 ? cachedCount / simRawNodes.length : 0;
        const hasCachedPositions = cachedRatio > 0.8;
        // Skip warmup if cached; aggressively cap ticks for large graphs
        const totalTicks = hasCachedPositions ? 0 : (isLarge ? Math.min(60, Math.max(30, dNodes.length / 20)) : Math.min(150, Math.max(50, dNodes.length / 5)));
        let currentTick = 0;

        if (hasCachedPositions) {
            console.log(`[useForceSimulation] ${cachedCount}/${simRawNodes.length} cached positions, skipping warmup`);
        } else {
            console.log(`[useForceSimulation] ${cachedCount}/${simRawNodes.length} cached, running ${totalTicks}-tick warmup (${isLarge ? 'large' : 'normal'} graph)...`);
        }

        const finishSim = () => {
            try {
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
            } catch (e) {
                console.error('[useForceSimulation] finishSim error:', e);
            } finally {
                setIsSimulating(false);
            }
        };

        // Safety timeout: if simulation hasn't finished in 15s, force-finish
        const safetyTimer = setTimeout(() => {
            if (currentTick < totalTicks) {
                console.warn(`[useForceSimulation] Safety timeout at tick ${currentTick}/${totalTicks}, force-finishing`);
                sim.stop();
                finishSim();
            }
        }, 15000);

        const runBatch = () => {
            try {
                const start = performance.now();
                while (currentTick < totalTicks && performance.now() - start < 16) {
                    sim.tick();
                    currentTick++;
                }

                setProgress(totalTicks > 0 ? currentTick / totalTicks : 1);

                if (currentTick < totalTicks) {
                    requestAnimationFrame(runBatch);
                } else {
                    clearTimeout(safetyTimer);
                    finishSim();
                }
            } catch (e) {
                console.error('[useForceSimulation] Tick error, finishing with current state:', e);
                clearTimeout(safetyTimer);
                finishSim();
            }
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
