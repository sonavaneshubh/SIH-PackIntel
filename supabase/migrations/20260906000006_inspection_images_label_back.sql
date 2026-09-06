-- 20260906000006_inspection_images_label_back.sql
-- Fix the inspection_images.image_type CHECK constraint on the LIVE database.
--
-- The remote table was created with an older constraint that rejects
-- 'label_back', which breaks the two-image (front/back) caption scan:
--   new row for relation "inspection_images" violates check constraint
--   "inspection_images_image_type_check"
--
-- This drops the constraint (if present) and recreates it with the full set
-- of image types used by the app. Idempotent.

ALTER TABLE public.inspection_images
  DROP CONSTRAINT IF EXISTS inspection_images_image_type_check;

ALTER TABLE public.inspection_images
  ADD CONSTRAINT inspection_images_image_type_check
  CHECK (image_type IN ('label_front', 'label_back', 'label_side', 'product_full', 'evidence_crop'));