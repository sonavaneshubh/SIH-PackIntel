'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  createInspection,
  uploadInspectionImage,
  saveExtractedLabel,
  saveComplianceResults,
  updateInspection,
  logSupabaseError,
} from '@/lib/supabase/inspectionService';
import { Inspection, ExtractedLabelInsert, ComplianceResultInsert, InspectionImage } from '@/types/database';
import { API_BASE_URL, assertApiConfigured, API_CONFIG_ERROR_MESSAGE } from '@/lib/api';
import type { ScanResponse } from '@/lib/api';
import { deriveInspectionMetadataFromExtraction } from '@/lib/extractionMetadata';

// Hard cap for the full two-image scan request. The backend runs detection →
// quality → OCR → extraction → compliance for both sides; give it enough room,
// but never let the UI hang indefinitely (the server side has its own 60s OCR
// timeout, so this ceiling is strictly above the pipeline upper bound).
const SCAN_REQUEST_TIMEOUT_MS = 90_000;

// The backend's extracted_declarations arrive as loosely-typed JSON. Mirrors
// the old `any || null` behavior: falsy values are dropped, anything else is
// stored as text so it can be written into the extracted_labels columns.
function asNullableString(value: unknown): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : String(value);
}

// Converts the backend's base64 evidence-crop data URI into a File so it can
// be persisted in Supabase Storage as an `evidence_crop` inspection image.
function base64DataUriToFile(dataUri: string, filename: string, mime: string): File | null {
  try {
    const [header, base64] = dataUri.split(',');
    if (!base64) return null;
    const mimeMatch = /^data:([a-z0-9\-+/.]+\/[a-z0-9\-+.]+);base64/i.exec(header || '');
    const resolvedMime = mimeMatch ? mimeMatch[1] : mime;
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new File([bytes], filename, { type: resolvedMime });
  } catch {
    return null;
  }
}

export interface ScanErrorInfo {
  friendly: string;
  code?: string;
}

function userFacingScanError(error: unknown): ScanErrorInfo {
  if (error instanceof ScanRequestFailure) {
    return { friendly: error.message, code: error.code };
  }
  if (error instanceof ScanHttpError) {
    return { friendly: error.friendly, code: error.code };
  }
  if (error instanceof Error && error.message === API_CONFIG_ERROR_MESSAGE) {
    return { friendly: error.message, code: 'API_NOT_CONFIGURED' };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      friendly:
        'The scan server did not respond in time. Please check your connection and try again.',
      code: 'SCAN_TIMEOUT',
    };
  }
  if (error instanceof TypeError) {
    // fetch only throws TypeError for network-level failures (incl. CORS).
    return {
      friendly:
        "We couldn't reach the scan server. Please check your internet connection and try again.",
      code: 'NETWORK_ERROR',
    };
  }
  return {
    friendly: 'The scan could not be completed. Please try again.',
    code: 'UNKNOWN_ERROR',
  };
}

class ScanHttpError extends Error {
  friendly: string;
  code?: string;
  status?: number;

  constructor(friendly: string, code?: string, status?: number, detail?: string) {
    super(detail || friendly);
    this.name = 'ScanHttpError';
    this.friendly = friendly;
    this.code = code;
    this.status = status;
  }
}

class ScanRequestFailure extends Error {
  code?: string;

  constructor(info: ScanErrorInfo) {
    super(info.friendly);
    this.name = 'ScanRequestFailure';
    this.code = info.code;
  }
}

async function readApiErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = (data as { detail?: unknown })?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((entry) => (entry && typeof entry === 'object' ? (entry as { msg?: string }).msg : String(entry)))
        .filter(Boolean)
        .join('; ');
    }
    const message = (data as { message?: unknown })?.message;
    if (typeof message === 'string') return message;
    const error = (data as { error?: unknown })?.error;
    if (error && typeof error === 'object') {
      const errorMessage = (error as { message?: unknown }).message;
      if (typeof errorMessage === 'string') return errorMessage;
    }
  } catch {
    // Non-JSON error body; fall through to the generic textual path.
  }
  return `The scan server returned an error (HTTP ${response.status}).`;
}

async function requestScan(form: FormData): Promise<Response> {
  assertApiConfigured();

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), SCAN_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE_URL}/api/scan`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export interface ScanPipelineState {
  step: 'idle' | 'creating' | 'uploading' | 'ocr' | 'extracting' | 'compliance' | 'completed' | 'error';
  inspection: Inspection | null;
  image: InspectionImage | null;
  backImage: InspectionImage | null;
  evidenceCrop: InspectionImage | null;
  evidenceCropMeta: { strategy?: string; confidence?: number } | null;
  ocrText: string | null;
  extractedLabels: ExtractedLabelInsert | null;
  complianceResults: ComplianceResultInsert[] | null;
  inexact: boolean;
  extractionSource: string | null;
  visionUsed: boolean;
  visionError: string | null;
  error: string | null;
  progress: number;
  detection: { is_food_package: boolean; confidence: number; reason: string } | null;
  warnings: string[];
}

export function useScanPipeline() {
  const router = useRouter();
  const [state, setState] = useState<ScanPipelineState>({
    step: 'idle',
    inspection: null,
    image: null,
    backImage: null,
    evidenceCrop: null,
    evidenceCropMeta: null,
    ocrText: null,
    extractedLabels: null,
    complianceResults: null,
    inexact: false,
    extractionSource: null,
    visionUsed: false,
    visionError: null,
    error: null,
    progress: 0,
    detection: null,
    warnings: [],
  });

  // Use a ref to track the current inspection for error handling
  const inspectionRef = useRef<Inspection | null>(null);
  // Guards against duplicate concurrent scans (double-tap on Scan Product).
  const scanRunningRef = useRef(false);

  const updateState = useCallback((updates: Partial<ScanPipelineState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };
      if (updates.inspection) {
        inspectionRef.current = updates.inspection;
      }
      return newState;
    });
  }, []);

  const runFullPipeline = useCallback(async (
    file: File,
    productData: {
      product_name: string;
      brand_name: string;
      manufacturer_name: string;
      product_category: string;
      is_imported: boolean;
    },
    backFile?: File
  ) => {
    if (scanRunningRef.current) {
      return { success: false, error: 'A scan is already in progress.', errorCode: 'SCAN_IN_PROGRESS' };
    }
    scanRunningRef.current = true;
    updateState({ step: 'creating', error: null, progress: 5 });

    let currentInspection: Inspection | null = null;

    try {
      // Step 1: Create inspection record
      const { data: inspection, error: inspectionError } = await createInspection({
        product_name: productData.product_name,
        brand_name: productData.brand_name,
        manufacturer_name: productData.manufacturer_name,
        product_category: productData.product_category,
        is_imported: productData.is_imported,
        status: 'processing',
      });

      if (inspectionError || !inspection) {
        throw new Error(inspectionError || 'Failed to create inspection');
      }

      currentInspection = inspection;
      updateState({ inspection, step: 'uploading', progress: 15 });

      // Step 2: Upload image to Supabase Storage
      const { data: image, error: uploadError } = await uploadInspectionImage(
        inspection.id,
        file,
        'label_front'
      );

      if (uploadError || !image) {
        throw new Error(uploadError || 'Failed to upload image');
      }

      updateState({ image, step: 'ocr', progress: 30 });

      // Step 2b: Optionally store the back-side image separately for future
      // two-sided analysis. The backend OCR call below keeps using the front
      // image for current API compatibility.
      let uploadedBackImage: InspectionImage | null = null;
      if (backFile) {
        const { data: backImage, error: backUploadError } = await uploadInspectionImage(
          inspection.id,
          backFile,
          'label_back'
        );
        if (backUploadError) {
          // Back-side persistence is optional enrichment. A failure here must
          // not abort the scan: the raw file is still sent to the pipeline.
          console.warn('[useScanPipeline] back image not persisted (continuing):', backUploadError);
          uploadedBackImage = null;
        } else {
          uploadedBackImage = backImage ? { ...backImage, public_url: backImage.public_url } : null;
        }
        updateState({
          backImage: uploadedBackImage,
        });
      }

      // Step 3: Call backend for analysis. We send both images (front + back)
      // as a single multipart request so the two-side pipeline runs in one pass.
      const multipartForm = new FormData();
      multipartForm.append('front_image', file, file.name || 'front.png');
      if (backFile) {
        multipartForm.append('back_image', backFile, backFile.name || 'back.png');
      }
      multipartForm.append('product_name', productData.product_name);
      multipartForm.append('brand_name', productData.brand_name);
      multipartForm.append('manufacturer_name', productData.manufacturer_name);
      multipartForm.append('product_category', productData.product_category);
      multipartForm.append('is_imported', String(productData.is_imported));

      let ocrResponse: Response;
      try {
        ocrResponse = await requestScan(multipartForm);
      } catch (error) {
        throw new ScanRequestFailure(userFacingScanError(error));
      }

      if (!ocrResponse.ok) {
        const detail = await readApiErrorDetail(ocrResponse);
        const friendly =
          ocrResponse.status >= 500
            ? 'The scan server hit an error while processing the image. Please try again in a moment.'
            : 'The scan request was rejected because the images could not be read. Please retry with clearer front and back images.';
        throw new ScanHttpError(
          friendly,
          ocrResponse.status >= 500 ? 'SCAN_SERVER_ERROR' : 'SCAN_REQUEST_REJECTED',
          ocrResponse.status,
          detail,
        );
      }

      let ocrData: ScanResponse;
      try {
        ocrData = await ocrResponse.json();
      } catch {
        throw new ScanHttpError(
          'The scan server returned an unexpected response. Please try again.',
          'INVALID_SCAN_RESPONSE',
          ocrResponse.status,
        );
      }
      const ocrText = ocrData.ocr_raw_text || '';
      const extractedDeclarations = ocrData.extracted_declarations || {};
      const productInformation =
        typeof ocrData.product_information === 'string'
          ? JSON.parse(ocrData.product_information || '{}')
          : (ocrData.product_information || {});
      const derivedMeta = deriveInspectionMetadataFromExtraction(
        productInformation,
        extractedDeclarations,
      );
      const ocrConfidence = Number(ocrData.ocr_confidence) || 0;
      const extractionConfidence = Number(ocrData.extraction_confidence);
      const ocrRegions = Array.isArray(ocrData.ocr_regions) ? ocrData.ocr_regions : [];

      updateState({
        ocrText,
        step: 'extracting',
        progress: 50,
        inexact: Boolean(ocrData.vision_used) || Object.values(productInformation).some(
          (entry: any) => entry?.status === 'uncertain',
        ),
        extractionSource: ocrData.extraction_source || 'ocr',
        visionUsed: Boolean(ocrData.vision_used),
        visionError: ocrData.vision_error || null,
        detection: ocrData.detection
          ? {
              is_food_package: Boolean(ocrData.detection.is_food_package),
              confidence: Number(ocrData.detection.confidence) || 0,
              reason: ocrData.detection.reason || '',
            }
          : null,
        warnings: Array.isArray(ocrData.warnings) ? ocrData.warnings : [],
      });

      // Step 4: Save OCR text, real confidence and word regions to inspection_images
      if (image.id) {
        const { error: updateErr } = await supabase
          .from('inspection_images')
          .update({
            ocr_text: ocrText,
            ocr_confidence: ocrConfidence,
            ocr_engine: ocrData.ocr_engine || 'tesseract',
            ocr_regions: ocrRegions,
          })
          .eq('id', image.id);

        if (updateErr) {
          logSupabaseError('useScanPipeline:updateFrontImage', updateErr);
          const retry = await supabase
            .from('inspection_images')
            .update({ ocr_text: ocrText })
            .eq('id', image.id);
          if (retry.error) {
            logSupabaseError('useScanPipeline:updateFrontImageFallback', retry.error);
          }
        }
      }

      // Persist the back-side OCR result when a back image was analysed.
      if (uploadedBackImage?.id && ocrData.back_side?.ocr_raw_text) {
        const { error: backUpdateErr } = await supabase
          .from('inspection_images')
          .update({
            ocr_text: ocrData.back_side.ocr_raw_text,
            ocr_confidence: Number(ocrData.back_side.ocr_confidence) || 0,
            ocr_engine: ocrData.back_side.ocr_engine || 'ocr_space',
          })
          .eq('id', uploadedBackImage.id);

        if (backUpdateErr) {
          logSupabaseError('useScanPipeline:updateBackImage', backUpdateErr);
          const retry = await supabase
            .from('inspection_images')
            .update({ ocr_text: ocrData.back_side.ocr_raw_text })
            .eq('id', uploadedBackImage.id);
          if (retry.error) {
            logSupabaseError('useScanPipeline:updateBackImageFallback', retry.error);
          }
        }
      }

      // Step 4c: Persist the backend auto-crop of the declaration / label area.
      // A crop failure is non-fatal — the original front image still displays.
      let evidenceCrop: InspectionImage | null = null;
      if (ocrData.evidence_crop_base64) {
        const cropFile = base64DataUriToFile(
          ocrData.evidence_crop_base64,
          'evidence-crop.jpg',
          'image/jpeg',
        );
        if (cropFile) {
          const { data: cropUpload, error: cropError } = await uploadInspectionImage(
            inspection.id,
            cropFile,
            'evidence_crop',
          );
          if (cropError) {
            logSupabaseError('useScanPipeline:uploadEvidenceCrop', cropError);
          } else if (cropUpload) {
            evidenceCrop = cropUpload;
          }
        }
      }
      updateState({
        evidenceCrop,
        evidenceCropMeta: ocrData.evidence_crop_meta
          ? { strategy: ocrData.evidence_crop_meta.strategy, confidence: ocrData.evidence_crop_meta.confidence }
          : null,
      });

      // Step 5: Save extracted labels (from OCR text only, never request metadata)
      const labelData: ExtractedLabelInsert = {
        inspection_id: inspection.id,
        manufacturer_name: asNullableString(extractedDeclarations.manufacturer_name),
        packer_name: asNullableString(extractedDeclarations.packer_name),
        importer_name: asNullableString(extractedDeclarations.importer_name),
        commodity_name:
          asNullableString(extractedDeclarations.commodity_name) ||
          asNullableString(extractedDeclarations.common_generic_name),
        net_quantity: asNullableString(extractedDeclarations.net_quantity),
        mrp: asNullableString(extractedDeclarations.mrp),
        month_year_packed:
          asNullableString(extractedDeclarations.month_year_packed) ||
          asNullableString(extractedDeclarations.mfg_date),
        customer_care_details:
          asNullableString(extractedDeclarations.customer_care_details) ||
          asNullableString(extractedDeclarations.consumer_care),
        country_of_origin: asNullableString(extractedDeclarations.country_of_origin),
        other_declarations: JSON.stringify({
          notes: asNullableString(extractedDeclarations.other_declarations) || '',
          product_information: productInformation,
          extraction_source: ocrData.extraction_source || 'ocr',
          vision_used: Boolean(ocrData.vision_used),
          vision_error: ocrData.vision_error || null,
        }),
        product_information: productInformation,
        raw_ocr_text: ocrText,
        extraction_confidence: Number.isFinite(extractionConfidence) ? extractionConfidence : null,
        ocr_confidence: ocrConfidence,
      };

      const { data: savedLabel, error: labelError } = await saveExtractedLabel(labelData);
      if (labelError) throw new Error(labelError);

      updateState({ extractedLabels: savedLabel, step: 'compliance', progress: 70 });

      // Step 6: Persist compliance results computed by the backend
      const complianceResults: ComplianceResultInsert[] = (ocrData.compliance_results || []).map((rule: any) => ({
        inspection_id: inspection.id,
        rule_code: rule.rule_code,
        rule_name: rule.rule_name,
        requirement: rule.requirement || null,
        extracted_value: rule.extracted_value || null,
        result: rule.result,
        explanation: rule.explanation,
        evidence: rule.evidence || null,
      }));

      const { error: complianceError } = await saveComplianceResults(complianceResults);
      if (complianceError) throw new Error(complianceError);

      updateState({ complianceResults, step: 'completed', progress: 90 });

      // Step 7: Persist the overall result, risk and compliance score from the backend
      const overallResult: 'pass' | 'fail' | 'review' | 'pending' =
        ocrData.overall_result === 'fail'
          ? 'fail'
          : ocrData.overall_result === 'pass'
            ? 'pass'
            : ocrData.overall_result === 'review'
              ? 'review'
              : 'pending';
      const riskScore = Number(ocrData.risk_score) || 0;
      const complianceScore = Number(ocrData.compliance_score) || 0;

      await updateInspection(inspection.id, {
        status: 'completed',
        overall_result: overallResult,
        risk_score: riskScore,
        compliance_score: complianceScore,
        product_name: derivedMeta.product_name,
        brand_name: derivedMeta.brand_name,
        manufacturer_name: derivedMeta.manufacturer_name,
        product_category: derivedMeta.product_category,
        notes: ocrData.report || `Processed via scan pipeline. ${complianceResults.length} rules checked.`,
        inspected_at: new Date().toISOString(),
      });

      updateState({
        inspection: {
          ...inspection,
          status: 'completed',
          overall_result: overallResult,
          risk_score: riskScore,
          compliance_score: complianceScore,
          product_name: derivedMeta.product_name,
          brand_name: derivedMeta.brand_name,
          manufacturer_name: derivedMeta.manufacturer_name,
          product_category: derivedMeta.product_category,
        },
        progress: 100,
      });

      // Navigate to results page
      router.push(`/results?inspection=${inspection.id}`);

      return { success: true, inspectionId: inspection.id };

    } catch (err) {
      const errorInfo = userFacingScanError(err);
      updateState({ step: 'error', error: errorInfo.friendly });

      // If inspection was created, mark as failed
      const inspectionToUpdate = currentInspection || inspectionRef.current;
      if (inspectionToUpdate?.id) {
        await updateInspection(inspectionToUpdate.id, {
          status: 'failed',
          product_name: null,
          notes: `Pipeline failed: ${errorInfo.friendly}`,
        });
      }

      return { success: false, error: errorInfo.friendly, errorCode: errorInfo.code };
    } finally {
      // Always re-arm the scanner — on success, failure, timeout, or abort.
      scanRunningRef.current = false;
    }
  }, [updateState, router]);

  const resetPipeline = useCallback(() => {
    setState({
      step: 'idle',
      inspection: null,
      image: null,
      backImage: null,
      evidenceCrop: null,
      evidenceCropMeta: null,
      ocrText: null,
      extractedLabels: null,
      complianceResults: null,
      inexact: false,
      extractionSource: null,
      visionUsed: false,
      visionError: null,
      error: null,
      progress: 0,
      detection: null,
      warnings: [],
    });
  }, []);

  return { state, runFullPipeline, resetPipeline };
}