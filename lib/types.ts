export interface ExtractedProfile {
  role: string;
  industry: string;
  skills: string[];
  offers: string[];
  needs: string[];
  interests: string[];
}

export interface Participant {
  id: string;
  name: string;
  title: string; // "What do you do?"
  offers_text: string; // "What can you help with?"
  needs_text: string; // "What are you looking for?"
  profile: ExtractedProfile | null;
  profile_source: "muse-ember" | "raw" | "none";
  is_demo: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  person_a_id: string;
  person_b_id: string;
  score: number;
  reason: string;
  value_for_a: string;
  value_for_b: string;
  conversation_starter: string;
  created_at: string;
}

export interface Interest {
  id: string;
  from_id: string;
  to_id: string;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  kind: "extract" | "match";
  participant_id: string | null;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null; // null when OpenRouter did not return verifiable cost
  created_at: string;
}

export interface UsageTotals {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_cost_usd: number | null; // null if any cost unavailable
  has_unavailable_cost: boolean;
  records: UsageRecord[];
}

export interface NetworkPayload {
  participants: Participant[];
  matches: Match[];
  interests: Interest[];
  usage: UsageTotals;
  ai_enabled: boolean;
  storage: "supabase" | "local";
}
