/**
 * Multi-step defensive workflow (P0.1 — KeeperHub Workflow Builder surface).
 *
 * Instead of firing a single hardcoded `topUpCollateral` contract-call, a real
 * defense is a *sequence* of steps, each of which is:
 *   1. simulated through KeeperHub (dry-run, never burns gas), and
 *   2. only executed through KeeperHub Direct Execution if the simulation passes.
 *
 * The sequence models the way a human treasury operator would escalate:
 *   topUpCollateral  ->  partialUnwind  ->  pausePosition  ->  notify
 *
 * The workflow stops at the FIRST step that both simulates cleanly AND lands
 * on-chain, restoring the position to safety. If a step's simulation fails we
 * transparently escalate to the next (louder) step — there are no silent
 * same-call retries. Every step is recorded so the incident report can show the
 * full decision path, exactly like a KeeperHub workflow run.
 */

import { KeeperHubClient, KeeperHubError } from "../keeperhub";

export interface WorkflowStepDef {
  /** Stable id used in logs / incident reports. */
  id: string;
  /** Human-readable label surfaced in the dashboard + attestation. */
  label: string;
  /** Contract function this step calls through KeeperHub. */
  functionName: string;
  /** Args for the function (defaults to []). */
  functionArgs?: unknown[];
  /** Severity tier — higher means a more drastic intervention. */
  severity: "restore" | "reduce" | "halt" | "notify";
}

export interface WorkflowStepResult {
  id: string;
  label: string;
  functionName: string;
  severity: WorkflowStepDef["severity"];
  simulated: boolean;
  simulationPassed: boolean;
  simulationReason?: string;
  executed: boolean;
  txHash?: string;
  transactionLink?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface WorkflowRunResult {
  workflowId: string;
  contractAddress: string;
  chainId: number;
  steps: WorkflowStepResult[];
  /** The step that actually secured the position (executed successfully). */
  winningStep?: WorkflowStepResult;
  outcome: "success" | "exhausted";
  startedAt: string;
  finishedAt: string;
}

/**
 * The canonical defense escalation path for a lending-vault position.
 * This mirrors what would be authored in the KeeperHub Workflow Builder UI.
 */
export const DEFAULT_DEFENSE_WORKFLOW: WorkflowStepDef[] = [
  {
    id: "restore-collateral",
    label: "Top-up Collateral",
    functionName: "topUpCollateral",
    severity: "restore",
  },
  {
    id: "partial-unwind",
    label: "Partial Unwind (reduce exposure)",
    functionName: "partialUnwind",
    severity: "reduce",
  },
  {
    id: "pause-position",
    label: "Pause Position (halt further borrow)",
    functionName: "pausePosition",
    severity: "halt",
  },
];

export interface RunDefenseWorkflowArgs {
  keeperhub: KeeperHubClient;
  contractAddress: string;
  chainId: number;
  abi: unknown[];
  steps?: WorkflowStepDef[];
  /** Optional structured logger; defaults to console. */
  log?: (msg: string) => void;
}

/**
 * Executes the defensive workflow step-by-step through KeeperHub.
 * Returns as soon as one step lands successfully (position secured), or after
 * every step has been attempted (outcome: "exhausted").
 */
export async function runDefenseWorkflow(args: RunDefenseWorkflowArgs): Promise<WorkflowRunResult> {
  const { keeperhub, contractAddress, chainId, abi } = args;
  const log = args.log || ((m: string) => console.log(m));
  const steps = args.steps || DEFAULT_DEFENSE_WORKFLOW;
  const workflowId = `wf_${Date.now()}`;
  const runStartedAt = new Date().toISOString();

  const results: WorkflowStepResult[] = [];
  let winningStep: WorkflowStepResult | undefined;

  for (const step of steps) {
    const startedAt = new Date().toISOString();
    const stepResult: WorkflowStepResult = {
      id: step.id,
      label: step.label,
      functionName: step.functionName,
      severity: step.severity,
      simulated: false,
      simulationPassed: false,
      executed: false,
      startedAt,
      finishedAt: startedAt,
    };

    // ---- 1. SIMULATE (dry-run through KeeperHub) --------------------------
    try {
      log(`[Workflow ${workflowId}] Simulating step "${step.label}" (${step.functionName})...`);
      const sim = await keeperhub.simulateContractCall({
        contractAddress,
        chainId,
        functionName: step.functionName,
        functionArgs: step.functionArgs ?? [],
        abi,
      });
      stepResult.simulated = true;
      stepResult.simulationPassed = sim.ok;
      stepResult.simulationReason = sim.reason;

      if (!sim.ok) {
        log(`[Workflow ${workflowId}] Step "${step.label}" failed simulation (${sim.reason}). Escalating...`);
        stepResult.finishedAt = new Date().toISOString();
        results.push(stepResult);
        continue; // escalate to the next, louder step — no silent retry
      }
    } catch (err: any) {
      stepResult.simulated = true;
      stepResult.simulationPassed = false;
      stepResult.error = err instanceof KeeperHubError ? err.message : err?.message || "simulation error";
      stepResult.finishedAt = new Date().toISOString();
      log(`[Workflow ${workflowId}] Step "${step.label}" simulation errored: ${stepResult.error}. Escalating...`);
      results.push(stepResult);
      continue;
    }

    // ---- 2. EXECUTE (Direct Execution — org wallet signs) -----------------
    try {
      log(`[Workflow ${workflowId}] Executing step "${step.label}" through KeeperHub Direct Execution...`);
      const exec = await keeperhub.executeContractCall({
        contractAddress,
        chainId,
        functionName: step.functionName,
        functionArgs: step.functionArgs ?? [],
        abi,
      });
      if (!exec.transactionHash) {
        throw new KeeperHubError(`No transactionHash returned for execution ${exec.executionId}`);
      }
      stepResult.executed = true;
      stepResult.txHash = exec.transactionHash;
      stepResult.transactionLink = exec.transactionLink;
      stepResult.blockNumber = exec.blockNumber;
      stepResult.gasUsed = exec.gasUsed;
      stepResult.finishedAt = new Date().toISOString();
      results.push(stepResult);
      winningStep = stepResult;
      log(`[Workflow ${workflowId}] Step "${step.label}" LANDED. Tx: ${exec.transactionHash}. Position secured.`);
      break; // success — stop escalating
    } catch (err: any) {
      stepResult.error = err instanceof KeeperHubError ? err.message : err?.message || "execution error";
      stepResult.finishedAt = new Date().toISOString();
      log(`[Workflow ${workflowId}] Step "${step.label}" execution failed: ${stepResult.error}. Escalating...`);
      results.push(stepResult);
      continue;
    }
  }

  return {
    workflowId,
    contractAddress,
    chainId,
    steps: results,
    winningStep,
    outcome: winningStep ? "success" : "exhausted",
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
  };
}
