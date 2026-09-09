-- 20260909000008_compliance_results_dedup.sql
-- Root cause: compliance_results is written with a plain INSERT from both the
-- frontend scan pipeline (inspectionService.saveComplianceResults) and the
-- backend /api/compliance/check route, and the table has no unique constraint
-- on (inspection_id, rule_code). Re-running a check for the same inspection
-- therefore inserts a second set of rows, so the report view renders every rule
-- twice and the summary counts double.
--
-- All statements are idempotent and safe to run repeatedly.

-- 1. Remove existing duplicates (keep the earliest row per inspection + rule).
DELETE FROM public.compliance_results a
USING public.compliance_results b
WHERE a.id > b.id
  AND a.inspection_id = b.inspection_id
  AND a.rule_code = b.rule_code;

-- 2. Enforce exactly one result row per rule per inspection from now on, so
--    upsert(..., { onConflict: 'inspection_id,rule_code' }) resolves to a real
--    constraint (the same pattern used for extracted_labels.inspection_id).
CREATE UNIQUE INDEX IF NOT EXISTS compliance_results_inspection_id_rule_code_key
  ON public.compliance_results (inspection_id, rule_code);