import type { Participant } from "./types";

export interface DemoSeed {
  name: string;
  title: string;
  offers_text: string;
  needs_text: string;
}

// 15 fictional profiles — clearly labeled as demo data in the UI.
// Deliberately include non-obvious complementary pairs (e.g. founder <-> GTM engineer,
// designer <-> talent specialist, investor <-> operator).
export const DEMO_SEEDS: DemoSeed[] = [
  { name: "Alex Chen", title: "Building an AI startup for sales teams (AI copilot for outbound)", offers_text: "AI engineering, product development, realtime infra", needs_text: "Early customers, distribution, GTM expertise" },
  { name: "Sarah Kim", title: "GTM engineer helping B2B startups build outbound sales engines", offers_text: "Outbound strategy, cold email, prospecting data, Clay workflows", needs_text: "Promising AI products to work with, founder introductions" },
  { name: "Marcus Lee", title: "Angel investor focused on AI infrastructure and devtools", offers_text: "Pre-seed intros, pitch feedback, hiring senior engineers for portfolio cos", needs_text: "AI infra startups, strong technical founders" },
  { name: "Priya Nair", title: "Product designer for devtools and AI workflows", offers_text: "0→1 product design, user research, design systems", needs_text: "Early-stage founders who need product-market-fit clarity" },
  { name: "James Okafor", title: "Senior full-stack engineer, ex-fintech platform at African unicorn", offers_text: "React/Node, payments, high-scale systems, mentoring junior devs", needs_text: "Cofounder for fintech devtools idea, technical collaborations" },
  { name: "Lena Fischer", title: "Growth marketer for consumer AI apps, 2M MAU previous", offers_text: "Paid growth, TikTok/Reels creative testing, referral loops", needs_text: "Consumer AI products ready for growth experiments" },
  { name: "David Park", title: "Talent specialist placing senior engineers at AI startups", offers_text: "AI engineer recruiting, interview loops, compensation benchmarking", needs_text: "Startups hiring founding engineers, founders who under-hire" },
  { name: "Maya Patel", title: "Startup operator / chief of staff for Series A SaaS", offers_text: "Hiring, sales ops, partnerships, fundraising prep", needs_text: "B2B products for pilot partnerships, operators for advisory" },
  { name: "Tom Alvarez", title: "Technical founder building AI agents for customer support", offers_text: "LLM agents, evals, voice infra", needs_text: "Cofounder (non-technical bizdev), first enterprise design partners" },
  { name: "Grace Liu", title: "Founder of a micro-SaaS for legal pros, profitable bootstrapped", offers_text: "Bootstrapping, PLG, legal vertical know-how, small-team culture", needs_text: "AI features to add, ideas for expansion, co-marketing partners" },
  { name: "Omar Hassan", title: "Applied AI researcher (RAG + evals), publishing and freelancing", offers_text: "RAG architecture, eval harnesses, fine-tuning guidance", needs_text: "Product problems needing real-world AI research" },
  { name: "Emma Wilson", title: "Brand designer + narrative coach for technical founders", offers_text: "Founder storytelling, pitch decks, brand systems", needs_text: "Technical founders whose story isn't landing with investors/customers" },
  { name: "Kenji Tanaka", title: "Investor at early-stage fund focusing on AI + robotics", offers_text: "Seed checks, customer intros at logistics firms, hardware know-how", needs_text: "Robotics/AI applied teams, hardware-software founders" },
  { name: "Ines Costa", title: "Sales leader — first AE who scaled $0→$5M for devtools", offers_text: "Enterprise sales, discovery, procurement navigation", needs_text: "Devtools with real users ready for sales push" },
  { name: "Ryan Brooks", title: "AI engineer building AI ops dashboards for SMBs", offers_text: "Python, LLM pipelines, dashboards, quick prototypes", needs_text: "First customers, user interviews, distribution channels" },
];

let counter = 0;
export function demoParticipants(): Participant[] {
  const now = new Date().toISOString();
  return DEMO_SEEDS.map((s, i) => ({
    id: `demo-${i + 1}`,
    name: s.name,
    title: s.title,
    offers_text: s.offers_text,
    needs_text: s.needs_text,
    profile: null,
    profile_source: "none" as const,
    is_demo: true,
    created_at: new Date(new Date(now).getTime() - (DEMO_SEEDS.length - i) * 60000).toISOString(),
  }));
}

export function nextDemoId(): string {
  counter += 1;
  return `demo-seed-${Date.now()}-${counter}`;
}
