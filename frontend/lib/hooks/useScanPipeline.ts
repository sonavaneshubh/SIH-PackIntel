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
  getInspectionById,
  logSupabaseError,
} from '@/lib/supabase/inspectionService';
import { Inspection, ExtractedLabelInsert, ComplianceResultInsert, InspectionImage } from '@/types/database';
import { API_BASE_URL } from '@/lib/api';
import { deriveInspectionMetadataFromExtraction } from '@/lib/extractionMetadata';

export interface ScanPipelineState {
  step: 'idle' | 'creating' | 'uploading' | 'ocr' | 'extracting' | 'compliance' | 'completed' | 'error';
  inspection: Inspection | null;
  image: InspectionImage | null;
  backImage: InspectionImage | null;
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

      const ocrResponse = await fetch(`${API_BASE_URL}/api/scan`, {
        method: 'POST',
        body: multipartForm,
      });

      if (!ocrResponse.ok) {
        const errorData = await ocrResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'OCR processing failed');
      }

      const ocrData = await ocrResponse.json();
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

      // Step 5: Save extracted labels (from OCR text only, never request metadata)
      const labelData: ExtractedLabelInsert = {
        inspection_id: inspection.id,
        manufacturer_name: extractedDeclarations.manufacturer_name || null,
        packer_name: extractedDeclarations.packer_name || null,
        importer_name: extractedDeclarations.importer_name || null,
        commodity_name: extractedDeclarations.commodity_name || extractedDeclarations.common_generic_name || null,
        net_quantity: extractedDeclarations.net_quantity || null,
        mrp: extractedDeclarations.mrp || null,
        month_year_packed: extractedDeclarations.month_year_packed || extractedDeclarations.mfg_date || null,
        customer_care_details: extractedDeclarations.customer_care_details || extractedDeclarations.consumer_care || null,
        country_of_origin: extractedDeclarations.country_of_origin || null,
        other_declarations: JSON.stringify({
          notes: extractedDeclarations.other_declarations || '',
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
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      updateState({ step: 'error', error: errorMessage });

      // If inspection was created, mark as failed
      const inspectionToUpdate = currentInspection || inspectionRef.current;
      if (inspectionToUpdate?.id) {
        await updateInspection(inspectionToUpdate.id, {
          status: 'failed',
          product_name: null,
          notes: `Pipeline failed: ${errorMessage}`,
        });
      }

      return { success: false, error: errorMessage };
    }
  }, [updateState, router]);

  const resetPipeline = useCallback(() => {
    setState({
      step: 'idle',
      inspection: null,
      image: null,
      backImage: null,
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