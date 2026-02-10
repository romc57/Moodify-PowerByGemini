import { graphService, type GraphNode, type EdgeType, type NodeType } from '@/services/graph/GraphService';
import { getEdgeColor, getNodeColor } from '@/services/graph/graphColors';
import * as d3 from 'd3';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

/* ── constants ── */
const NODE_TYPES: NodeType[] = ['SONG', 'ARTIST', 'VIBE', 'GENRE', 'AUDIO_FEATURE'];
const EDGE_TYPES: EdgeType[] = ['SIMILAR', 'NEXT', 'RELATED', 'HAS_FEATURE', 'HAS_GENRE'];
type Vis = Record<string, boolean>;
const allOn = (keys: readonly string[]): Vis => Object.fromEntries(keys.map(k => [k, true]));

/* ══════════════════ MAIN SCREEN ══════════════════ */
export default function GraphDebugScreen() {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [stats, setStats] = useState({ nodes: 0, edges: 0 });
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const [nodeVis, setNodeVis] = useState<Vis>(() => allOn(NODE_TYPES));
    const [edgeVis, setEdgeVis] = useState<Vis>(() => allOn(EDGE_TYPES));
    const [svgReady, setSvgReady] = useState(false);

    const attachSvg = useCallback((el: SVGSVGElement | null) => {
        svgRef.current = el;
        if (el) setSvgReady(true);
    }, []);

    useEffect(() => { if (svgReady) loadGraph(); }, [svgReady]);

    useEffect(() => applyVisibility(svgRef.current, nodeVis, edgeVis), [nodeVis, edgeVis]);

    const loadGraph = async () => {
        const snap = await graphService.getGraphSnapshot();
        setStats({ nodes: snap.nodes.length, edges: snap.edges.length });
        renderGraph(svgRef.current, snap.nodes, snap.edges, setSelected);
    };

    const handleClear = async () => {
        await graphService.clearGraph();
        setStats({ nodes: 0, edges: 0 });
        if (Platform.OS === 'web') window.location.href = '/';
    };

    return (
        <View style={s.root}>
            <Header stats={stats} onRefresh={loadGraph} onClear={handleClear} />
            <FilterBar label="Nodes" types={NODE_TYPES} vis={nodeVis} setVis={setNodeVis} colorFn={getNodeColor} />
            <FilterBar label="Edges" types={EDGE_TYPES} vis={edgeVis} setVis={setEdgeVis} colorFn={getEdgeColor} />
            <Canvas attachSvg={attachSvg} />
            {selected && <DetailCard node={selected} />}
        </View>
    );
}

/* ══════════════════ COMPONENTS ══════════════════ */

function Header({ stats, onRefresh, onClear }: { stats: { nodes: number; edges: number }; onRefresh: () => void; onClear: () => void }) {
    return (
        <View style={s.row}>
            <Text style={s.title}>Graph</Text>
            <Text style={s.stat}>N: {stats.nodes}</Text>
            <Text style={s.stat}>E: {stats.edges}</Text>
            <Btn label="Refresh" color="#1DB954" outline onPress={onRefresh} />
            <Btn label="Clear & Re-ingest" color="#FF5722" onPress={onClear} />
        </View>
    );
}

function FilterBar({ label, types, vis, setVis, colorFn }: {
    label: string; types: readonly string[]; vis: Vis;
    setVis: React.Dispatch<React.SetStateAction<Vis>>; colorFn: (t: any) => string;
}) {
    return (
        <View style={s.row}>
            <Text style={s.label}>{label}:</Text>
            {types.map(t => (
                <Btn key={t} label={t.replace('_', ' ')} color={vis[t] ? colorFn(t) : '#444'}
                    onPress={() => setVis(p => ({ ...p, [t]: !p[t] }))} />
            ))}
        </View>
    );
}

function Canvas({ attachSvg }: { attachSvg: (el: SVGSVGElement | null) => void }) {
    return (
        <View style={s.canvas}>
            {/* @ts-ignore RN Web renders div/svg */}
            <div style={{ width: '100%', height: '100%', background: '#0e0e0e' }}>
                <svg ref={attachSvg} style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
        </View>
    );
}

function DetailCard({ node }: { node: GraphNode }) {
    return (
        <View style={s.detail}>
            <Text style={s.detailTitle}>{node.name}</Text>
            <Text style={s.detailText}>{node.type} | ID {node.id} | Plays {node.play_count}</Text>
            <Text style={s.detailText}>Spotify: {node.spotify_id || '—'}</Text>
        </View>
    );
}

function Btn({ label, color, onPress, outline }: { label: string; color: string; onPress: () => void; outline?: boolean }) {
    const bg = outline ? 'transparent' : color;
    return (
        // @ts-ignore onClick works on RN Web
        <View style={[s.btn, { backgroundColor: bg, borderColor: color }]} onClick={onPress} accessibilityRole="button">
            <Text style={[s.btnTxt, outline && { color }]}>{label}</Text>
        </View>
    );
}

/* ══════════════════ D3 RENDERING ══════════════════ */

function renderGraph(
    svg: SVGSVGElement | null,
    rawNodes: GraphNode[],
    rawEdges: { source: number; target: number; type: EdgeType; weight: number }[],
    onSelect: (n: GraphNode) => void
) {
    if (!svg) return;
    const w = svg.parentElement?.clientWidth || 800;
    const h = svg.parentElement?.clientHeight || 500;
    const pad = 40;

    const nodes = rawNodes.map(n => ({ ...n }));
    const ids = new Set(nodes.map(n => n.id));
    const edges = rawEdges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e }));

    d3.select(svg).selectAll('*').remove();
    const root = d3.select(svg).attr('width', w).attr('height', h);
    const g = root.append('g');

    assignDepths(nodes, edges);
    spreadInitialPositions(nodes, w, h, pad);

    const sim = buildSimulation(nodes, edges, w, h, pad);
    const linkSel = drawEdges(g, edges);
    const nodeSel = drawNodes(g, nodes, sim, onSelect);

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.03, 6])
        .on('zoom', ev => g.attr('transform', ev.transform));
    d3.select(svg).call(zoom);

    attachTick(sim, linkSel, nodeSel, () => fitView(svg, nodes, w, h, pad, zoom));
}

function assignDepths(nodes: any[], edges: any[]) {
    const map = new Map(nodes.map(n => [n.id, n]));
    const adj = new Map<number, number[]>();
    edges.forEach(e => { if (!adj.has(e.source)) adj.set(e.source, []); adj.get(e.source)!.push(e.target); });
    const rootId = nodes.length ? nodes.reduce((a, b) => a.id < b.id ? a : b).id : 0;
    nodes.forEach(n => { n.depth = 0; });
    const q = [rootId], seen = new Set([rootId]);
    while (q.length) {
        const id = q.shift()!;
        for (const t of adj.get(id) ?? []) {
            if (seen.has(t)) continue;
            seen.add(t);
            const tn = map.get(t);
            if (tn) tn.depth = (map.get(id)?.depth ?? 0) + 1;
            q.push(t);
        }
    }
}

function spreadInitialPositions(nodes: any[], w: number, h: number, pad: number) {
    const maxD = Math.max(1, ...nodes.map((n: any) => n.depth ?? 0));
    nodes.forEach(n => {
        const a = Math.random() * Math.PI * 2;
        n.x = w / 2 + Math.cos(a) * (60 + Math.random() * 120);
        n.y = pad + ((n.depth ?? 0) / maxD) * (h - 2 * pad) + (Math.random() - 0.5) * 50;
    });
}

function buildSimulation(nodes: any[], edges: any[], w: number, h: number, pad: number) {
    const maxD = Math.max(1, ...nodes.map((n: any) => n.depth ?? 0));
    return d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(55).strength(0.25))
        .force('charge', d3.forceManyBody().strength(-70))
        .force('x', d3.forceX(w / 2).strength(0.04))
        .force('y', d3.forceY((d: any) => pad + ((d.depth ?? 0) / maxD) * (h - 2 * pad)).strength(0.05))
        .force('collide', d3.forceCollide(7));
}

function drawEdges(g: d3.Selection<any, any, any, any>, edges: any[]) {
    return g.append('g').attr('stroke-opacity', 0.55)
        .selectAll('line').data(edges).join('line')
        .attr('class', (d: any) => `eg-${d.type}`)
        .attr('stroke', (d: any) => getEdgeColor(d.type))
        .attr('stroke-width', (d: any) => Math.max(0.4, Math.sqrt(d.weight || 1)));
}

function drawNodes(g: d3.Selection<any, any, any, any>, nodes: any[], sim: any, onSelect: (n: any) => void) {
    const sel = g.append('g').attr('stroke', '#fff').attr('stroke-width', 0.8)
        .selectAll('circle').data(nodes).join('circle')
        .attr('class', (d: any) => `nd-${d.type}`)
        .attr('r', (d: any) => d.type === 'VIBE' ? 9 : d.type === 'AUDIO_FEATURE' || d.type === 'GENRE' ? 3.5 : 4.5)
        .attr('fill', (d: any) => getNodeColor(d.type))
        .on('click', (_: any, d: any) => onSelect(d))
        .call(makeDrag(sim) as any);
    sel.append('title').text((d: any) => d.name);
    return sel;
}

function attachTick(sim: any, links: any, nodes: any, fitFn: () => void) {
    let ticks = 0;
    sim.on('tick', () => {
        links.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
            .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
        nodes.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
        if (++ticks === 100) fitFn();
    });
    sim.on('end', fitFn);
}

function fitView(svg: SVGSVGElement, nodes: any[], w: number, h: number, pad: number, zoom: any) {
    const xs = nodes.map((n: any) => n.x as number).filter(Number.isFinite);
    const ys = nodes.map((n: any) => n.y as number).filter(Number.isFinite);
    if (!xs.length) return;
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const k = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1), (h - 2 * pad) / Math.max(y1 - y0, 1), 1.5);
    const tx = w / 2 - k * (x0 + x1) / 2;
    const ty = h / 2 - k * (y0 + y1) / 2;
    d3.select(svg).transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}

function applyVisibility(svg: SVGSVGElement | null, nv: Vis, ev: Vis) {
    if (!svg) return;
    const sel = d3.select(svg);
    NODE_TYPES.forEach(t => sel.selectAll(`.nd-${t}`).attr('display', nv[t] ? null : 'none'));
    EDGE_TYPES.forEach(t => sel.selectAll(`.eg-${t}`).attr('display', ev[t] ? null : 'none'));
}

function makeDrag(sim: any) {
    return d3.drag()
        .on('start', (ev: any) => { if (!ev.active) sim.alphaTarget(0.3).restart(); ev.subject.fx = ev.subject.x; ev.subject.fy = ev.subject.y; })
        .on('drag', (ev: any) => { ev.subject.fx = ev.x; ev.subject.fy = ev.y; })
        .on('end', (ev: any) => { if (!ev.active) sim.alphaTarget(0); ev.subject.fx = null; ev.subject.fy = null; });
}

/* ══════════════════ STYLES ══════════════════ */
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000', padding: 8 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 4, marginBottom: 4 },
    title: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginRight: 12 },
    stat: { color: '#888', fontSize: 12, marginRight: 10, lineHeight: 26 },
    label: { color: '#666', fontSize: 10, fontWeight: '700', marginRight: 4, textTransform: 'uppercase', lineHeight: 26 },
    btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 4, marginBottom: 2, borderWidth: 1, cursor: 'pointer' as any },
    btnTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
    canvas: { flex: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
    detail: { padding: 8, marginTop: 4, backgroundColor: '#151515', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#1DB954' },
    detailTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
    detailText: { color: '#999', fontSize: 10, fontFamily: 'monospace' },
});
