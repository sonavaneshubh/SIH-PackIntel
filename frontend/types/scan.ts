export type ComplianceStatus = "PASS" | "REVIEW" | "FAIL";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ScanRecord {
  id: string;
  productName: string;
  category: string;
  date: string;
  status: ComplianceStatus;
  confidence: number;
  issueCount: number;
  manufacturer: string;
  mrp: string;
  netQuantity: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  riskScore?: number;
  riskLevel?: RiskLevel;
  primaryIssue?: string;
}

export interface KPIStats {
  totalScans: number;
  totalScansGrowth: string;
  passCount: number;
  passPercentage: number;
  reviewCount: number;
  reviewPercentage: number;
  failCount: number;
  failPercentage: number;
  highPriorityCount?: number;
  highPriorityDescription?: string;
}

export interface ProductFormData {
  productName: string;
  category: string;
  manufacturer: string;
  isImported: boolean;
}

export interface HighPriorityInspection {
  id: string;
  productName: string;
  manufacturer: string;
  category: string;
  riskScore: number;
  riskLevel: RiskLevel;
  mainIssue: string;
  scanDate: string;
  thumbnailUrl: string;
  riskFactors: string[];
  statutoryRule: string;
  evidence: EvidenceDetails;
}

export interface CrossSurfaceInconsistency {
  id: string;
  productName: string;
  attribute: string;
  surfaceA: {
    surface: "Front" | "Back" | "Side" | "Top/Bottom";
    value: string;
    imageUrl?: string;
  };
  surfaceB: {
    surface: "Front" | "Back" | "Side" | "Top/Bottom";
    value: string;
    imageUrl?: string;
  };
  status: "Potential Mismatch" | "Unverified";
  confidence: number;
  evidenceDetails: EvidenceDetails;
}

export interface HistoricalChangeRecord {
  id: string;
  productName: string;
  attribute: string;
  previousValue: string;
  currentValue: string;
  changeType: string;
  date: string;
  severity: "High" | "Medium" | "Low";
  impactNote: string;
}

export interface ViolationPattern {
  id: string;
  title: string;
  percentage: number;
  occurrences: number;
  category: string;
  ruleClause: string;
  trend: "up" | "down" | "neutral";
}

export interface EvidenceDetails {
  id: string;
  inspectionId?: string;
  productName: string;
  attribute: string;
  detectedValue: string;
  conflictingValue?: string;
  conflictingSource?: string;
  ocrConfidence: number | null;
  applicableRule: string;
  ruleVersion: string;
  detectedIssue: string;
  explanation: string;
  complianceStatus: ComplianceStatus;
  riskScore: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  imageUrl: string | null;
  boundingRegion?: {
    top: string;
    left: string;
    width: string;
    height: string;
    label: string;
  };
  secondaryImageUrl?: string;
  secondaryBoundingRegion?: {
    top: string;
    left: string;
    width: string;
    height: string;
    label: string;
  };
}
