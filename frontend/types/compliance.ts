export interface DetectedDeclaration {
  id: string;
  key: string;
  label: string;
  value: string;
  confidence: number;
  reviewRequired?: boolean;
  warningNote?: string;
  evidenceImageUrl?: string;
}

export interface QualityCheckItem {
  id: string;
  title: string;
  statusText: string;
  status: 'good' | 'warning' | 'error' | 'pending';
  icon: string;
}

export interface PipelineStage {
  id: 'read' | 'understand' | 'check' | 'explain';
  name: string;
  progress: number;
  status: 'active' | 'pending' | 'complete';
  icon: string;
  description: string;
}

export interface AnalysisLog {
  id: string;
  message: string;
  status: 'complete' | 'running' | 'pending';
  timestamp?: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  clause: string;
  legal_reference?: string;
  requirement?: string;
  mandatory: boolean;
  applicability?: 'all' | 'imported' | 'domestic' | 'conditional' | 'perishable';
  standardPenalty: string;
  description: string;
  source?: string;
  version?: string;
  effective_from?: string;
}

export type ComplianceStatus =
  | 'PASS'
  | 'REVIEW'
  | 'FAIL'
  | 'UNCERTAIN'
  | 'DRAFT'
  | 'NOT_APPLICABLE'
  | 'good'
  | 'warning'
  | 'error'
  | 'pending';
