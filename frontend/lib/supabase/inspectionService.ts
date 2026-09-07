// Supabase service layer for inspections
// All operations use the authenticated Supabase client — inspector_id is ALWAYS
// derived from the server-side auth session, never from client input.

import { supabase } from '@/lib/supabase/client';
import {
  Inspection,
  InspectionInsert,
  InspectionUpdate,
  ExtractedLabel,
  ExtractedLabelInsert,
  ExtractedLabelUpdate,
  ComplianceResultRow,
  ComplianceResultInsert,
  InspectionImage,
  InspectionImageInsert,
  InspectionReport,
  InspectionReportInsert,
  DashboardStats,
  ProductInformation,
} from '@/types/database';

// ─── Inspection Number Generator ─────────────────────────────────────────────
// Generates a unique inspection number: INS-YYYYMMDD-XXXXXX
export function generateInspectionNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(100000 + Math.random() * 900000);
  return `INS-${date}-${random}`;
}

// Renders a Supabase/PostgREST error object (status, code, message, details,
// hint) into a single string so the real database error is never lost behind
// a generic fallback message.
export function supabaseErrorDetail(error: any): string {
  if (!error) return 'Unknown Supabase error';
  const parts = [
    error.status ? `status=${error.status}` : null,
    error.code ? `code=${error.code}` : null,
    error.message || null,
    error.details || null,
    error.hint || null,
  ].filter(Boolean);
  return parts.join(' | ');
}

// Logs the full Supabase error object (never just message) so failures are
// diagnosable from the browser console. The first line carries the compact
// status/code/message/details/hint summary; the object has every field.
export function logSupabaseError(context: string, error: any): void {
  console.error(`[${context}:SupabaseError] ${supabaseErrorDetail(error)}`, {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    cause: error?.cause,
  });
}

// Maps a PostgREST error code to an actionable one-line diagnosis, or returns
// an empty string when no extra guidance applies.
function dbErrorDetail(error: any): string {
  switch (error?.code) {
    case 'PGRST204':
      return 'database schema drift: a column in this build does not exist in the live Supabase table — apply the latest supabase/migrations SQL';
    case '42501':
      return 'row-level security policy denied the write — ensure the owner-scoped RLS policies exist in Supabase (see supabase/migrations)';
    default:
      return '';
  }
}

// ─── Inspections ──────────────────────────────────────────────────────────────

export async function createInspection(
  fields: Omit<InspectionInsert, 'inspector_id'>
): Promise<{ data: Inspection | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'You must be authenticated to create an inspection.' };
  }

  const payload: InspectionInsert = {
    ...fields,
    inspector_id: user.id,                       // always from auth, never from client
    inspection_number: fields.inspection_number || generateInspectionNumber(),
    status: fields.status || 'draft',
  };

  const { data, error } = await supabase
    .from('inspections')
    .insert(payload)
    .select()
    .single();

  if (error) {
    logSupabaseError('createInspection', error);
    return { data: null, error: `Failed to create inspection record: ${supabaseErrorDetail(error)}` };
  }
  return { data, error: null };
}

export async function updateInspection(
  inspectionId: string,
  updates: InspectionUpdate
): Promise<{ data: Inspection | null; error: string | null }> {
  const { data, error } = await supabase
    .from('inspections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', inspectionId)
    .select()
    .single();

  if (error) {
    logSupabaseError('updateInspection', error);
    return { data: null, error: `Failed to update inspection: ${supabaseErrorDetail(error)}` };
  }
  return { data, error: null };
}

export async function getInspectionById(inspectionId: string): Promise<{
  data: (Inspection & {
    extracted_labels: ExtractedLabel | null;
    compliance_results: ComplianceResultRow[];
    inspection_images: InspectionImage[];
    inspection_reports: InspectionReport[];
  }) | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('inspections')
    .select(`
      *,
      extracted_labels (*),
      compliance_results (*),
      inspection_images (*),
      inspection_reports (*)
    `)
    .eq('id', inspectionId)
    .single();

  if (error) {
    console.error('[getInspectionById]', error.message);
    return { data: null, error: 'Failed to load inspection details.' };
  }

  const result = {
    ...data,
    extracted_labels: normalizeExtractedLabel(data.extracted_labels),
  };

  return { data: result, error: null };
}

export async function getMyInspections(options?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ data: Inspection[]; error: string | null; count: number }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: [], error: 'Not authenticated.', count: 0 };
  }

  let query = supabase
    .from('inspections')
    .select('*', { count: 'exact' })
    .eq('inspector_id', user.id)
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'ALL') {
    query = query.eq('overall_result', options.status.toLowerCase());
  }
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, (options.offset + (options.limit || 10)) - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[getMyInspections]', error.message);
    return { data: [], error: 'Failed to load inspection history.', count: 0 };
  }
  return { data: data || [], error: null, count: count || 0 };
}

// ─── Data & History Cleanup ───────────────────────────────────────────────────
// Removes every scan record belonging to the signed-in user: database rows
// (inspections plus their cascade-deleted images/labels/compliance/reports)
// AND the actual files in the private storage buckets, which the FK cascade
// never touches.

const STORAGE_BATCH_SIZE = 100;

async function chunk<T>(items: T[], size: number): Promise<T[][]> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type DeleteAllInspectionsResult = {
  data: { deletedInspections: number; removedFiles: number } | null;
  error: string | null;
  warnings: string[];
};

export async function deleteAllMyInspections(): Promise<DeleteAllInspectionsResult> {
  const warnings: string[] = [];
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Not authenticated.', warnings };
  }

  try {
    // 1. Gather the user's inspection rows (RLS scopes this to their own data).
    const { data: inspections, error: listError } = await supabase
      .from('inspections')
      .select('id')
      .eq('inspector_id', user.id);
    if (listError) {
      logSupabaseError('deleteAllMyInspections:list', listError);
      return { data: null, error: `Failed to list inspections: ${supabaseErrorDetail(listError)}`, warnings };
    }

    if (!inspections || inspections.length === 0) {
      return { data: { deletedInspections: 0, removedFiles: 0 }, error: null, warnings };
    }

    const inspectionIds = inspections.map((r) => r.id);

    // 2. Collect storage object paths from images and reports before deleting
    //    the rows, since cascades will remove the DB records but not the files.
    const imagePaths: string[] = [];
    const reportPaths: string[] = [];

    for (const ids of await chunk(inspectionIds, 200)) {
      const [imagesRes, reportsRes] = await Promise.all([
        supabase.from('inspection_images').select('storage_path').in('inspection_id', ids),
        supabase.from('inspection_reports').select('storage_path').in('inspection_id', ids),
      ]);
      if (imagesRes.error) logSupabaseError('deleteAllMyInspections:imagesList', imagesRes.error);
      if (reportsRes.error) logSupabaseError('deleteAllMyInspections:reportsList', reportsRes.error);
      imagePaths.push(...(imagesRes.data ?? [])
        .map((r) => r.storage_path).filter((p): p is string => Boolean(p)));
      reportPaths.push(...(reportsRes.data ?? [])
        .map((r) => r.storage_path).filter((p): p is string => Boolean(p)));
    }

    // 3. Remove the actual files from the private buckets. Storage removal is
    //    best-effort: DB cleanup still proceeds if a file removal fails.
    for (const [bucket, paths] of [
      [IMAGE_BUCKET, imagePaths],
      [REPORT_BUCKET, reportPaths],
    ] as const) {
      for (const batch of await chunk(paths, STORAGE_BATCH_SIZE)) {
        const { error: removeError } = await supabase.storage.from(bucket).remove(batch);
        if (removeError) {
          logSupabaseError(`deleteAllMyInspections:storage(${bucket})`, removeError);
          warnings.push(`Some files in '${bucket}' could not be removed.`);
        }
      }
    }

    // 4. Delete the inspection rows; child tables cascade on delete.
    const { error: deleteError } = await supabase
      .from('inspections')
      .delete()
      .eq('inspector_id', user.id);
    if (deleteError) {
      logSupabaseError('deleteAllMyInspections:delete', deleteError);
      return {
        data: null,
        error: `Failed to delete inspections: ${supabaseErrorDetail(deleteError)}`,
        warnings,
      };
    }

    return {
      data: {
        deletedInspections: inspectionIds.length,
        removedFiles: imagePaths.length + reportPaths.length,
      },
      error: null,
      warnings,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { data: null, error: message, warnings };
  }
}

// ─── Dashboard Statistics ─────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<{
  data: DashboardStats;
  error: string | null;
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      data: { total: 0, compliant: 0, needsReview: 0, nonCompliant: 0, highPriority: 0, avgRiskScore: 0 },
      error: 'Not authenticated.',
    };
  }

  const { data, error } = await supabase
    .from('inspections')
    .select('overall_result, risk_score, status')
    .eq('inspector_id', user.id);

  if (error) {
    console.error('[getDashboardStats]', error.message);
    return {
      data: { total: 0, compliant: 0, needsReview: 0, nonCompliant: 0, highPriority: 0, avgRiskScore: 0 },
      error: 'Failed to load dashboard statistics.',
    };
  }

  const rows = data || [];
  const completed = rows.filter((r) => r.status === 'completed');
  const compliant = completed.filter((r) => r.overall_result === 'pass').length;
  const needsReview = completed.filter((r) => r.overall_result === 'review').length;
  const nonCompliant = completed.filter((r) => r.overall_result === 'fail').length;
  const highPriority = completed.filter((r) => (r.risk_score ?? 0) >= 76).length;
  const riskScores = completed
    .map((r) => r.risk_score)
    .filter((s): s is number => s !== null);
  const avgRiskScore =
    riskScores.length > 0
      ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
      : 0;

  return {
    data: {
      total: rows.length,
      compliant,
      needsReview,
      nonCompliant,
      highPriority,
      avgRiskScore,
    },
    error: null,
  };
}

// ─── Inspector Profile ────────────────────────────────────────────────────────

export async function getMyProfile() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { data: null, error: 'Not authenticated.' };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[getMyProfile]', error.message);
    return { data: null, error: 'Failed to load profile.' };
  }
  return { data, error: null };
}

export function normalizeExtractedLabel(data: any): ExtractedLabel | null {
  if (!data) return null;
  const decl = (typeof data.declarations === 'object' && data.declarations) || {};
  let storedDetails: ProductInformation = {};
  if (typeof data.other_declarations === 'string') {
    try {
      const parsed = JSON.parse(data.other_declarations);
      if (parsed?.product_information && typeof parsed.product_information === 'object') {
        storedDetails = parsed.product_information;
      }
    } catch {
      // Legacy rows contain plain declaration notes, not JSON.
    }
  }

  // Confidence is stored in 0–100. Backward-compatible: legacy rows may be 0–1.
  const normalizeConfidence = (value: unknown): number | null => {
    if (value == null) return null;
    const conf = Number(value);
    if (!Number.isFinite(conf)) return null;
    return conf > 0 && conf <= 1 ? Math.round(conf * 100) : conf;
  };

  return {
    ...data,
    manufacturer_name: data.manufacturer_name || decl.manufacturer_name || decl.packer_name || null,
    packer_name: data.packer_name || decl.packer_name || decl.manufacturer_name || null,
    importer_name: data.importer_name || decl.importer_name || null,
    commodity_name: data.commodity_name || decl.commodity_name || decl.common_generic_name || null,
    net_quantity: data.net_quantity || decl.net_quantity || null,
    mrp: data.mrp || decl.mrp || null,
    month_year_packed: data.month_year_packed || decl.month_year_packed || decl.mfg_date || null,
    customer_care_details: data.customer_care_details || decl.customer_care_details || decl.consumer_care || null,
    country_of_origin: data.country_of_origin || decl.country_of_origin || null,
    other_declarations: data.other_declarations || decl.other_declarations || null,
    product_information: data.product_information || decl.product_information || storedDetails,
    raw_ocr_text: data.raw_ocr_text || decl.raw_ocr_text || null,
    extraction_confidence: normalizeConfidence(data.extraction_confidence ?? decl.extraction_confidence),
    ocr_confidence: normalizeConfidence(data.ocr_confidence ?? decl.ocr_confidence),
  } as ExtractedLabel;
}

export async function saveExtractedLabel(
  label: Omit<ExtractedLabelInsert, never>
): Promise<{ data: ExtractedLabel | null; error: string | null }> {
  // Build only fields that belong to public.extracted_labels.
  // Never send null to the NOT NULL other_declarations column.
  let payload: Record<string, any> = {
    inspection_id: label.inspection_id,

    manufacturer_name: label.manufacturer_name ?? null,
    packer_name: label.packer_name ?? null,
    importer_name: label.importer_name ?? null,
    commodity_name: label.commodity_name ?? null,
    net_quantity: label.net_quantity ?? null,
    mrp: label.mrp ?? null,
    month_year_packed: label.month_year_packed ?? null,
    customer_care_details: label.customer_care_details ?? null,
    country_of_origin: label.country_of_origin ?? null,
    product_information: label.product_information ?? null,

    // Database column is NOT NULL
    other_declarations: label.other_declarations ?? '',

    raw_ocr_text: label.raw_ocr_text ?? null,

    // Stored raw (0–100), no normalization.
    extraction_confidence:
      label.extraction_confidence == null
        ? null
        : Number(label.extraction_confidence),

    ocr_confidence:
      label.ocr_confidence == null
        ? null
        : Number(label.ocr_confidence),
  };

  for (let attempt = 0; attempt < 15; attempt++) {
    const { data, error } = await supabase
      .from("extracted_labels")
      .upsert(payload, {
        onConflict: "inspection_id",
      })
      .select()
      .single();

    // Successfully saved
    if (!error && data) {
      const normalized = normalizeExtractedLabel({
        ...payload,
        ...data,
      });

      return {
        data: normalized,
        error: null,
      };
    }

    // If Supabase says a column does not exist,
    // remove that column and retry.
    const missingColumn = error?.message?.match(
      /Could not find the '([^']+)' column/
    );

    if (missingColumn?.[1]) {
      const columnName = missingColumn[1];

      console.warn(
        `[saveExtractedLabel] Removing unsupported column: ${columnName}`
      );

      delete payload[columnName];
      continue;
    }

    // Log complete Supabase error
    console.error("[saveExtractedLabel:SupabaseError]", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      table: "extracted_labels",
      payload,
      payloadKeys: Object.keys(payload),
    });

    return {
      data: null,
      error: `Database error [${error?.code || "UPSERT_FAILED"
        }]: ${error?.message || "Unknown database error"}`,
    };
  }

  console.error("[saveExtractedLabel:SchemaRetryExhausted]", {
    message:
      "Could not match payload to extracted_labels schema after 15 retries",
  });

  return {
    data: null,
    error: "Failed to save extracted label data after schema retries.",
  };
}
// ─── Compliance Results ───────────────────────────────────────────────────────

export async function saveComplianceResults(
  results: ComplianceResultInsert[]
): Promise<{ error: string | null }> {
  if (!results.length) return { error: null };

  let currentResults = results.map(r => ({ ...r }));

  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await supabase.from('compliance_results').insert(currentResults);
    if (!error) return { error: null };

    const match = error.message?.match(/Could not find the '([^']+)' column/);
    if (match && match[1]) {
      const missingCol = match[1];
      currentResults = currentResults.map(r => {
        const copy = { ...r };
        delete (copy as any)[missingCol];
        return copy;
      });
      continue;
    }

    console.error('[saveComplianceResults]', error.message);
    return { error: 'Failed to save compliance results.' };
  }

  return { error: 'Failed to save compliance results after retries.' };
}

export async function getComplianceResults(
  inspectionId: string
): Promise<{ data: ComplianceResultRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('compliance_results')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getComplianceResults]', error.message);
    return { data: [], error: 'Failed to load compliance results.' };
  }
  return { data: data || [], error: null };
}

// ─── Image Storage ────────────────────────────────────────────────────────────

const IMAGE_BUCKET = 'inspection-images';
const REPORT_BUCKET = 'inspection-reports';

export async function uploadInspectionImage(
  inspectionId: string,
  file: File,
  imageType: InspectionImage['image_type'] = 'label_front'
): Promise<{ data: InspectionImage | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Not authenticated.' };
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${imageType}_${Date.now()}.${ext}`;
  const storagePath = `${user.id}/${inspectionId}/${fileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    logSupabaseError('uploadInspectionImage:storage', uploadError);
    return {
      data: null,
      error: `Image upload failed: ${supabaseErrorDetail(uploadError)}`,
    };
  }

  const uploadedPath = uploadData?.path || storagePath;
  let signedUrlData: { signedUrl: string } | null = null;
  let signedUrlError: { message: string } | null = null;

  // Storage can briefly lag behind the upload response. Retry the exact path
  // returned by Storage before reporting that the object is missing.
  for (let attempt = 0; attempt < 3; attempt++) {
    const signedResult = await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(uploadedPath, 3600);
    signedUrlData = signedResult.data;
    signedUrlError = signedResult.error;

    if (signedUrlData?.signedUrl) break;
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error('[uploadInspectionImage:signedUrl]', {
      bucket: IMAGE_BUCKET,
      path: uploadedPath,
      ...(signedUrlError ? {
        status: (signedUrlError as any)?.status,
        code: (signedUrlError as any)?.code,
        message: signedUrlError?.message,
        details: (signedUrlError as any)?.details,
        hint: (signedUrlError as any)?.hint,
      } : { message: 'no signed URL returned by storage' }),
    });
    return {
      data: null,
      error: `Image uploaded but could not create a secure OCR URL: ${supabaseErrorDetail(signedUrlError || new Error('signedUrl was empty'))}`,
    };
  }

  const ocrUrl = signedUrlData.signedUrl;

  const ACCEPTED_IMAGE_TYPES: InspectionImage['image_type'][] = [
    'label_front',
    'label_back',
    'label_side',
    'product_full',
    'evidence_crop',
  ];
  const safeImageType = ACCEPTED_IMAGE_TYPES.includes(imageType) ? imageType : 'label_front';

  // NOTE: the live `inspection_images` table has no `public_url` column, so it
  // must not be included here (PostgREST returns PGRST204). The signed URL is
  // kept in the returned object and re-fetchable via getSignedImageUrl().
  const imageRecord: Record<string, any> = {
    inspection_id: inspectionId,
    storage_path: uploadedPath,
    image_type: safeImageType,
    file_name: file.name,
    file_size_bytes: file.size,
    mime_type: file.type,
  };

  let { data, error: dbError } = await supabase
    .from('inspection_images')
    .insert(imageRecord)
    .select()
    .single();

  if (dbError) {
    logSupabaseError('uploadInspectionImage:db', dbError);
    // Retry with minimal schema fields if optional columns cause insertion failure
    const fallbackRecord: Record<string, any> = {
      inspection_id: inspectionId,
      storage_path: uploadedPath,
      image_type: safeImageType,
      file_name: file.name,
    };
    const retry = await supabase
      .from('inspection_images')
      .insert(fallbackRecord)
      .select()
      .single();

    if (retry.error) {
      logSupabaseError('uploadInspectionImage:db:retry', retry.error);
    } else {
      data = retry.data;
      dbError = null;
    }
  }

  if (dbError) {
    const diagnosis = dbErrorDetail(dbError);
    return {
      data: null,
      error: `Image saved to storage but failed to record in database: ${supabaseErrorDetail(dbError)}${diagnosis ? ` (${diagnosis})` : ''}`,
    };
  }

  const resultData = data
    ? ({ ...data, public_url: (data as any).public_url || ocrUrl } as InspectionImage)
    : null;

  return { data: resultData, error: null };
}

export async function getSignedImageUrl(
  storagePath: string
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error) {
    return { url: null, error: 'Failed to generate secure image URL.' };
  }
  return { url: data.signedUrl, error: null };
}

// ─── Report Storage ───────────────────────────────────────────────────────────

export async function saveInspectionReport(
  inspectionId: string,
  pdfBlob: Blob,
  reportType: string = 'pdf'
): Promise<{ data: InspectionReport | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Not authenticated.' };
  }

  const storagePath = `${user.id}/${inspectionId}/report.${reportType}`;

  const { error: uploadError } = await supabase.storage
    .from(REPORT_BUCKET)
    .upload(storagePath, pdfBlob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    });

  if (uploadError) {
    console.error('[saveInspectionReport]', uploadError.message);
    return { data: null, error: 'Failed to upload report.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(REPORT_BUCKET).getPublicUrl(storagePath);

  const record: Record<string, any> = {
    inspection_id: inspectionId,
    storage_path: storagePath,
    public_url: publicUrl || null,
    report_type: reportType,
    file_size_bytes: pdfBlob.size,
  };

  let { data, error: dbError } = await supabase
    .from('inspection_reports')
    .insert(record)
    .select()
    .single();

  if (dbError && dbError.message?.includes('public_url')) {
    delete record.public_url;
    const retry = await supabase
      .from('inspection_reports')
      .insert(record)
      .select()
      .single();
    data = retry.data;
    dbError = retry.error;
  }

  if (dbError) {
    console.error('[saveInspectionReport:db]', dbError.message);
    return { data: null, error: 'Report uploaded but failed to record in database.' };
  }

  const resultData = data
    ? ({ ...data, public_url: (data as any).public_url || publicUrl } as InspectionReport)
    : null;

  return { data: resultData, error: null };
}
