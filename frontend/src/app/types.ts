/** Shared API response types (mirror backend/main.py serialisers). */

export interface Finding {
  file_path: string;
  line_start: number;
  line_end: number;
  owasp_class: string;
  severity: string;
  title: string;
  description: string;
  remediation: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export interface ScanResult {
  id: number;
  repo_url: string;
  branch: string;
  engine: string;
  gate: string;
  gate_rationale: string;
  critical_count: number;
  high_count: number;
  findings: Finding[];
  explanation: string;
  patched_code: string;
  patched_filename: string;
  patch_status: string;
  secret_findings: SecretFinding[];
  sandbox_verdict: string;
  model?: string;
  scanned_at: string | null;
  llm_calls?: number;
  files_analysed?: string[];
  sandbox_logs?: string;
}

export interface Gate {
  id: string;
  name: string;
  desc: string;
  active: boolean;
  strictness: string[] | string;
  action: string[] | string;
  status: string;
  statusCls: string;
}

export interface AgentStat {
  label: string;
  value: string;
}

export interface Agent {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  statusLabel: string;
  statusColor: string;
  stats: AgentStat[];
  log: string;
}

export interface DeploymentCheck {
  label: string;
  ok: boolean | null;
}

export interface Deployment {
  id: string;
  scan_id: number;
  status: string;
  statusCls: string;
  icon: string;
  iconColor: string;
  title: string;
  target: string;
  checks: DeploymentCheck[];
  actions: string[];
}

export interface TeamMember {
  name: string;
  email: string;
  role: string;
}

export interface Plan {
  name: string;
  price: number;
  period: string;
  status: string;
  billing_cycle: string;
  seats_used: number;
  seats_total: number;
}

export interface Settings {
  workspace: string;
  timezone: string;
  theme: string;
  mode: string;
  plan: Plan;
  team: TeamMember[];
}

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  scan_count: number;
  created_at: string;
  last_login: string;
}

export interface AdminStats {
  total_users: number;
  total_scans: number;
  blocked_scans?: number;
  admin_count: number;
}

export interface AuditLog {
  id: number;
  admin_email: string;
  action: string;
  target: string;
  timestamp: string;
}
