"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Match, Participant } from "@/lib/types";

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  participant: Participant;
  degree: number;
}

interface Props {
  participants: Participant[];
  matches: Match[];
  selectedId: string | null;
  onSelectParticipant: (id: string | null) => void;
  onSelectMatch: (m: Match | null) => void;
  selectedMatch: Match | null;
}

const NODE_COLORS = [
  "#a78bfa",
  "#22d3ee",
  "#f0abfc",
  "#34d399",
  "#fbbf24",
  "#93c5fd",
];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return NODE_COLORS[h % NODE_COLORS.length];
}

export default function NetworkGraph({
  participants,
  matches,
  selectedId,
  onSelectParticipant,
  onSelectMatch,
  selectedMatch,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const [renderNodes, setRenderNodes] = useState<Node[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Show only edges with score >= 30 to keep the graph readable; all
  // evaluated pairs are still stored and shown on /matches.
  const visibleMatches = useMemo(
    () => matches.filter((m) => m.score >= 30),
    [matches]
  );

  // Sync node set with props.
  useEffect(() => {
    const prev = nodesRef.current;
    const next = new Map<string, Node>();
    const degree = new Map<string, number>();
    for (const m of visibleMatches) {
      degree.set(m.person_a_id, (degree.get(m.person_a_id) ?? 0) + 1);
      degree.set(m.person_b_id, (degree.get(m.person_b_id) ?? 0) + 1);
    }
    participants.forEach((p, i) => {
      const existing = prev.get(p.id);
      if (existing) {
        next.set(p.id, { ...existing, participant: p, degree: degree.get(p.id) ?? 0 });
      } else {
        const angle = (i / Math.max(participants.length, 1)) * Math.PI * 2;
        const ring = 120 + (i % 4) * 40;
        next.set(p.id, {
          id: p.id,
          x: 600 + Math.cos(angle) * ring,
          y: 300 + Math.sin(angle) * ring * 0.62,
          vx: (Math.sin(i) * 0.4),
          vy: (Math.cos(i) * 0.4),
          participant: p,
          degree: degree.get(p.id) ?? 0,
        });
      }
    });
    nodesRef.current = next;
  }, [participants, visibleMatches]);

  // Force simulation.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const nodes = Array.from(nodesRef.current.values());
      const edges = visibleMatches
        .map((m) => ({
          a: nodesRef.current.get(m.person_a_id),
          b: nodesRef.current.get(m.person_b_id),
        }))
        .filter((e) => e.a && e.b);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(dist2);
          const repel = 90000 / dist2;
          const fx = (dx / dist) * repel * 0.08;
          const fy = (dy / dist) * repel * 0.08;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
        // Gentle centering spring.
        nodes[i].vx += (600 - nodes[i].x) * 0.0012;
        nodes[i].vy += (300 - nodes[i].y) * 0.0012;
      }
      for (const e of edges) {
        const a = e.a!;
        const b = e.b!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = 150;
        const force = (dist - rest) * 0.012;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const n of nodes) {
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(50, Math.min(1150, n.x));
        n.y = Math.max(50, Math.min(550, n.y));
      }
      // Snapshot positions for render without reading refs during render.
      setRenderNodes([...nodesRef.current.values()]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visibleMatches]);

  const nodes = renderNodes;

  const nameById = new Map(participants.map((p) => [p.id, p]));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a0d1f]">
      <svg
        ref={svgRef}
        viewBox="0 0 1200 600"
        className="block h-[520px] w-full sm:h-[600px]"
        onClick={() => {
          onSelectParticipant(null);
          onSelectMatch(null);
        }}
      >
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#05060f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="600" fill="url(#bgGlow)" />

        {/* Edges */}
        {visibleMatches.map((m) => {
          const a = nodes.find((n) => n.id === m.person_a_id);
          const b = nodes.find((n) => n.id === m.person_b_id);
          if (!a || !b) return null;
          const isSelected =
            selectedMatch?.person_a_id === m.person_a_id &&
            selectedMatch?.person_b_id === m.person_b_id;
          const strong = m.score >= 75;
          return (
            <g key={m.id}>
              {/* fat invisible hit target */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={18}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMatch(m);
                  onSelectParticipant(null);
                }}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={strong ? "#22d3ee" : "#8b5cf6"}
                strokeWidth={strong ? 2.4 : 1.2}
                strokeOpacity={isSelected ? 1 : strong ? 0.85 : 0.5}
                strokeDasharray={strong ? "6 5" : "3 6"}
                className="edge-line pointer-events-none"
              />
              {isSelected && (
                <circle cx={b.x} cy={b.y} r={10} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const color = colorFor(n.id);
          const isSelected = selectedId === n.id;
          const isHover = hoverId === n.id;
          const r = n.participant.is_demo ? 16 : 18 + Math.min(6, n.degree);
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectParticipant(isSelected ? null : n.id);
                onSelectMatch(null);
              }}
            >
              <circle cx={n.x} cy={n.y} r={r + 12} fill={color} opacity="0.08" />
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill="#0a0d1f"
                stroke={color}
                strokeWidth={isSelected || isHover ? 3 : 2}
                className="glow-node"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="800"
                fill="white"
                pointerEvents="none"
              >
                {n.participant.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </text>
              <text
                x={n.x}
                y={n.y + r + 20}
                textAnchor="middle"
                fontSize="13"
                fontWeight={isSelected || isHover ? 700 : 500}
                fill="white"
                fillOpacity={isSelected || isHover ? 1 : 0.75}
                pointerEvents="none"
              >
                {n.participant.name} {n.participant.is_demo ? "· demo" : ""}
              </text>
            </g>
          );
        })}

        {participants.length === 0 && (
          <text x="600" y="300" textAnchor="middle" fill="white" fontSize="18" opacity="0.6">
            No participants yet — be the first to join
          </text>
        )}
      </svg>

      {/* Selected edge / node detail overlay */}
      {selectedMatch && (
        <div className="absolute inset-x-4 bottom-4 sm:left-auto sm:right-4 sm:w-[420px] rounded-2xl border border-cyan-300/30 bg-black/85 p-4 backdrop-blur-xl fade-up">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-bold">
              {nameById.get(selectedMatch.person_a_id)?.name} ↔{" "}
              {nameById.get(selectedMatch.person_b_id)?.name}
            </div>
            <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-200">
              {selectedMatch.score}% match
            </span>
          </div>
          <p className="mt-1 text-sm text-white/80">{selectedMatch.reason}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            <span className="text-white font-semibold">Ask: </span>
            {selectedMatch.conversation_starter}
          </p>
          <button
            onClick={() => onSelectMatch(null)}
            className="mt-3 text-xs text-white/50 hover:text-white"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
