export type IncidentOutcome = "success" | "reverted" | "no_action";

export interface Position {
  id: string;
  label: string;
  address: string;
}

export interface StatusResponse {
  healthFactor: string;
  previousHealthFactor?: string;
  isAgentOnline: boolean;
  lastCheckedAt: string;
  chain: string;
  bannerMessage?: string;
  positions?: Position[];
  activePositionId?: string;
}

export interface Incident {
  id: string;
  triggerCondition: string;
  actionTaken: string;
  txHash?: string;
  gasUsed?: string;
  outcome: IncidentOutcome;
  timestamp: string;
}

export interface Attestation {
  incident_id: string;
  position_id?: string;
  chain_id?: number;
  trigger: Record<string, string>;
  simulation_result: Record<string, string>;
  tx_hash: string;
  block_number?: number;
  final_state: Record<string, string>;
  timestamp: string;
  payload: string;
  verifier_pubkey: string;
  signature: string;
}

export interface HistoryPoint {
  timestamp: string;
  value: number;
}

// Client for talking to our backend (or mock backend)
export const api = {
  async getStatus(): Promise<StatusResponse> {
    const res = await fetch("/api/status", { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch status");
    return res.json();
  },

  async getHistory(timeframe: 'Hour' | 'Day' | 'Week'): Promise<HistoryPoint[]> {
    const res = await fetch(`/api/status/history?timeframe=${timeframe}`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch history");
    return res.json();
  },

  async getIncidents(): Promise<Incident[]> {
    const res = await fetch("/api/incidents", { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch incidents");
    return res.json();
  },

  async getAttestation(id: string): Promise<Attestation> {
    const res = await fetch(`/api/attestation/${id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch attestation");
    return res.json();
  },

  async triggerChaosMode(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch("/api/chaos-mode/trigger", { method: "POST" });
    if (!res.ok) throw new Error("Failed to trigger chaos mode");
    return res.json();
  },

  async setActivePosition(positionId: string): Promise<StatusResponse> {
    const res = await fetch("/api/status/position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error("Failed to switch position");
    return res.json();
  },
};
