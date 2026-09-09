'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/authContext';
import {
  Inspection,
  ExtractedLabel,
  ComplianceResultRow,
  InspectionImage,
  InspectionReport,
  DashboardStats,
  AnalyticsData,
} from '@/types/database';
import {
  createInspection,
  updateInspection,
  getInspectionById,
  getMyInspections,
  getDashboardStats,
  getAnalyticsData,
  saveExtractedLabel,
  saveComplianceResults,
  uploadInspectionImage,
  saveInspectionReport,
  getComplianceResults,
} from '@/lib/supabase/inspectionService';

// ─── Dashboard Stats Hook ──────────────────────────────────────────────────────
export function useDashboardStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    compliant: 0,
    needsReview: 0,
    nonCompliant: 0,
    highPriority: 0,
    avgRiskScore: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getDashboardStats();
      if (fetchError) {
        setError(fetchError);
      } else {
        setStats(data);
      }
    } catch (err) {
      setError('Failed to load dashboard statistics');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [fetchStats, user]);

  return { stats, isLoading, error, refetch: fetchStats };
}

// ─── Analytics Hook ────────────────────────────────────────────────────────────
export function useAnalytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getAnalyticsData();
      if (fetchError) {
        setError(fetchError);
      } else {
        setAnalytics(data);
      }
    } catch (err) {
      setError('Failed to load violation analytics');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, user]);

  return { analytics, isLoading, error, refetch: fetchAnalytics };
}

// ─── Inspections List Hook ─────────────────────────────────────────────────────
export function useMyInspections(options?: { limit?: number; offset?: number; status?: string }) {
  const { user } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInspections = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError, count: totalCount } = await getMyInspections(options);
      if (fetchError) {
        setError(fetchError);
      } else {
        setInspections(data);
        setCount(totalCount);
      }
    } catch (err) {
      setError('Failed to load inspection history');
    } finally {
      setIsLoading(false);
    }
  }, [user, options?.limit, options?.offset, options?.status]);

  useEffect(() => {
    if (user) {
      fetchInspections();
    }
  }, [fetchInspections, user]);

  return { inspections, count, isLoading, error, refetch: fetchInspections };
}

// ─── Single Inspection Hook ────────────────────────────────────────────────────
export function useInspection(inspectionId: string | null) {
  const { user } = useAuth();
  const [inspection, setInspection] = useState<(Inspection & {
    extracted_labels: ExtractedLabel | null;
    compliance_results: ComplianceResultRow[];
    inspection_images: InspectionImage[];
    inspection_reports: InspectionReport[];
  }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInspection = useCallback(async () => {
    if (!inspectionId || !user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getInspectionById(inspectionId);
      if (fetchError) {
        setError(fetchError);
      } else {
        setInspection(data);
      }
    } catch (err) {
      setError('Failed to load inspection details');
    } finally {
      setIsLoading(false);
    }
  }, [inspectionId, user]);

  useEffect(() => {
    if (inspectionId && user) {
      fetchInspection();
    }
  }, [fetchInspection, inspectionId, user]);

  return { inspection, isLoading, error, refetch: fetchInspection };
}

// ─── Create Inspection Hook ────────────────────────────────────────────────────
export function useCreateInspection() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (fields: Parameters<typeof createInspection>[0]) => {
    setIsCreating(true);
    setError(null);
    try {
      const { data, error: createError } = await createInspection(fields);
      if (createError) {
        setError(createError);
        return { data: null, error: createError };
      }
      return { data, error: null };
    } catch (err) {
      const msg = 'Failed to create inspection';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setIsCreating(false);
    }
  };

  return { createInspection: create, isCreating, error };
}

// ─── Update Inspection Hook ────────────────────────────────────────────────────
export function useUpdateInspection() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (inspectionId: string, updates: Parameters<typeof updateInspection>[1]) => {
    setIsUpdating(true);
    setError(null);
    try {
      const { data, error: updateError } = await updateInspection(inspectionId, updates);
      if (updateError) {
        setError(updateError);
        return { data: null, error: updateError };
      }
      return { data, error: null };
    } catch (err) {
      const msg = 'Failed to update inspection';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateInspection: update, isUpdating, error };
}

// ─── Extracted Labels Hook ─────────────────────────────────────────────────────
export function useSaveExtractedLabel() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (label: Parameters<typeof saveExtractedLabel>[0]) => {
    setIsSaving(true);
    setError(null);
    try {
      const { data, error: saveError } = await saveExtractedLabel(label);
      if (saveError) {
        setError(saveError);
        return { data: null, error: saveError };
      }
      return { data, error: null };
    } catch (err) {
      const msg = 'Failed to save extracted label data';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setIsSaving(false);
    }
  };

  return { saveExtractedLabel: save, isSaving, error };
}

// ─── Compliance Results Hook ───────────────────────────────────────────────────
export function useSaveComplianceResults() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (results: Parameters<typeof saveComplianceResults>[0]) => {
    setIsSaving(true);
    setError(null);
    try {
      const { error: saveError } = await saveComplianceResults(results);
      if (saveError) {
        setError(saveError);
        return { error: saveError };
      }
      return { error: null };
    } catch (err) {
      const msg = 'Failed to save compliance results';
      setError(msg);
      return { error: msg };
    } finally {
      setIsSaving(false);
    }
  };

  return { saveComplianceResults: save, isSaving, error };
}

// ─── Image Upload Hook ─────────────────────────────────────────────────────────
export function useUploadInspectionImage() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (
    inspectionId: string,
    file: File,
    imageType: InspectionImage['image_type'] = 'label_front'
  ) => {
    setIsUploading(true);
    setError(null);
    try {
      const { data, error: uploadError } = await uploadInspectionImage(inspectionId, file, imageType);
      if (uploadError) {
        setError(uploadError);
        return { data: null, error: uploadError };
      }
      return { data, error: null };
    } catch (err) {
      const msg = 'Failed to upload image';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadInspectionImage: upload, isUploading, error };
}

// ─── Report Save Hook ──────────────────────────────────────────────────────────
export function useSaveInspectionReport() {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (inspectionId: string, pdfBlob: Blob, reportType: string = 'pdf') => {
    setIsSaving(true);
    setError(null);
    try {
      const { data, error: saveError } = await saveInspectionReport(inspectionId, pdfBlob, reportType);
      if (saveError) {
        setError(saveError);
        return { data: null, error: saveError };
      }
      return { data, error: null };
    } catch (err) {
      const msg = 'Failed to save inspection report';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setIsSaving(false);
    }
  };

  return { saveInspectionReport: save, isSaving, error };
}