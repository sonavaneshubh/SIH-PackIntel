-- 20260907000007_scan_pipeline_schema_and_rls.sql
-- Reconcile the LIVE database with what the frontend scan pipeline writes.
--
-- Root causes fixed here (all confirmed against the live project):
--   1. The live `inspection_images` table has NO `public_url` column, so the
--      pipeline insert is rejected by PostgREST with:
--        PGRST204: Could not find the 'public_url' column of 'inspection_images'
--   2. The live `inspection_images` table has RLS enabled with NO insert policy,
--      so even a schema-valid insert is rejected with:
--        42501: new row violates row-level security policy for table "inspection_images"
--   3. `extracted_labels` is missing `product_information` and `raw_ocr_text`,
--      which `saveExtractedLabel()` persists for the detail/results view.
--
-- All statements are idempotent and safe to run repeatedly.

-- 1. Column alignments ------------------------------------------------

-- inspection_images.public_url: persisted signed URL (frontend InspectionImage type)
ALTER TABLE public.inspection_images ADD COLUMN IF NOT EXISTS public_url TEXT;

-- extracted_labels columns persisted by the scan pipeline
ALTER TABLE public.extracted_labels ADD COLUMN IF NOT EXISTS product_information JSONB;
ALTER TABLE public.extracted_labels ADD COLUMN IF NOT EXISTS raw_ocr_text TEXT;

-- 2. Row Level Security ------------------------------------------------

-- Ensure RLS is enabled (no-op if already enabled)
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_results ENABLE ROW LEVEL SECURITY;

-- inspections: user may manage only their own inspections
DROP POLICY IF EXISTS "Users can view own inspections" ON public.inspections;
CREATE POLICY "Users can view own inspections" ON public.inspections
  FOR SELECT USING (auth.uid() = inspector_id);

DROP POLICY IF EXISTS "Users can insert own inspections" ON public.inspections;
CREATE POLICY "Users can insert own inspections" ON public.inspections
  FOR INSERT WITH CHECK (auth.uid() = inspector_id);

DROP POLICY IF EXISTS "Users can update own inspections" ON public.inspections;
CREATE POLICY "Users can update own inspections" ON public.inspections
  FOR UPDATE USING (auth.uid() = inspector_id);

DROP POLICY IF EXISTS "Users can delete own inspections" ON public.inspections;
CREATE POLICY "Users can delete own inspections" ON public.inspections
  FOR DELETE USING (auth.uid() = inspector_id);

-- inspection_images: user may manage images of their own inspections
DROP POLICY IF EXISTS "Users can view own inspection images" ON public.inspection_images;
CREATE POLICY "Users can view own inspection images" ON public.inspection_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_images.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own inspection images" ON public.inspection_images;
CREATE POLICY "Users can insert own inspection images" ON public.inspection_images
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_images.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own inspection images" ON public.inspection_images;
CREATE POLICY "Users can update own inspection images" ON public.inspection_images
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_images.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own inspection images" ON public.inspection_images;
CREATE POLICY "Users can delete own inspection images" ON public.inspection_images
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = inspection_images.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

-- extracted_labels: user may manage labels of their own inspections
DROP POLICY IF EXISTS "Users can view own extracted labels" ON public.extracted_labels;
CREATE POLICY "Users can view own extracted labels" ON public.extracted_labels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = extracted_labels.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own extracted labels" ON public.extracted_labels;
CREATE POLICY "Users can insert own extracted labels" ON public.extracted_labels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = extracted_labels.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own extracted labels" ON public.extracted_labels;
CREATE POLICY "Users can update own extracted labels" ON public.extracted_labels
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = extracted_labels.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own extracted labels" ON public.extracted_labels;
CREATE POLICY "Users can delete own extracted labels" ON public.extracted_labels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = extracted_labels.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

-- compliance_results: user may manage results of their own inspections
DROP POLICY IF EXISTS "Users can view own compliance results" ON public.compliance_results;
CREATE POLICY "Users can view own compliance results" ON public.compliance_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = compliance_results.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own compliance results" ON public.compliance_results;
CREATE POLICY "Users can insert own compliance results" ON public.compliance_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = compliance_results.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own compliance results" ON public.compliance_results;
CREATE POLICY "Users can update own compliance results" ON public.compliance_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = compliance_results.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own compliance results" ON public.compliance_results;
CREATE POLICY "Users can delete own compliance results" ON public.compliance_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.inspections i
      WHERE i.id = compliance_results.inspection_id
      AND i.inspector_id = auth.uid()
    )
  );

-- 3. Upsert target for saveExtractedLabel() -----------------------------
-- Required so `upsert(..., { onConflict: 'inspection_id' })` resolves to a
-- unique/exclusion constraint.
CREATE UNIQUE INDEX IF NOT EXISTS extracted_labels_inspection_id_key
  ON public.extracted_labels (inspection_id);