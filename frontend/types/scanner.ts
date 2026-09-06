export type ScannerPhase =
  | 'front'
  | 'back';

export type ScannerState =
  | 'initializing'
  | 'permission_required'
  | 'camera_ready'
  | 'searching_for_package'
  | 'package_detected'
  | 'stabilizing'
  | 'capturing_front'
  | 'front_captured'
  | 'turn_package'
  | 'searching_back'
  | 'back_detected'
  | 'capturing_back'
  | 'processing'
  | 'completed'
  | 'camera_error'
  | 'permission_denied';

export type ScanSideState =
  | 'waiting'
  | 'searching'
  | 'detected'
  | 'stabilizing'
  | 'capturing'
  | 'captured';

export type ObjectCategory =
  | 'food_package'
  | 'non_food_object'
  | 'person'
  | 'unknown';

export interface PackageDetectionResult {
  detected: boolean;
  category: ObjectCategory;
  confidence: number;
  inFrame: boolean;
  stability: number;
  centerX: number;
  centerY: number;
}

export interface PackageDetectionService {
  analyze: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => PackageDetectionResult;
}

export type CameraFailureReason =
  | 'none'
  | 'not_allowed'
  | 'not_found'
  | 'not_readable'
  | 'overconstrained'
  | 'security'
  | 'unsupported'
  | 'insecure_context'
  | 'unknown';

export interface CameraFailureInfo {
  reason: CameraFailureReason;
  message: string;
}

export interface ScannerSideImage {
  side: ScannerPhase;
  file: File;
  objectUrl: string;
  quality: number;
}

export interface ScannerCapture {
  front: ScannerSideImage | null;
  back: ScannerSideImage | null;
}

export interface ProcessingStepStatus {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'skipped';
}