import {
  Inspection,
  ComplianceResultRow,
  ExtractedLabel,
  InspectionImage,
  ExtractedField,
} from '@/types/database';
import {
  CORE_LEGAL_METROLOGY_FIELDS,
  PRODUCT_FIELDS,
  ProductField,
  ProductInformation,
  ProductFieldSource,
  parseProductInformation,
} from '@/types/product';

export interface ComplianceResultWithRule extends ComplianceResultRow {
  rule_id?: string;
  ruleDescription?: string;
  legal_reference?: string;
  status?: string;
  reason?: string;
  evidence_text?: string;
  ocr_confidence?: number;
  detected_value?: string;
  normalized_value?: string;
}

export function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

export function resultKind(result: string): { label: string; className: string } {
  const norm = (result || '').toLowerCase().trim();
  const config: Record<string, { label: string; className: string }> = {
    pass: { label: 'PASS', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    warning: { label: 'UNCERTAIN', className: 'text-amber-800 bg-amber-50 border-amber-200' },
    uncertain: { label: 'UNCERTAIN', className: 'text-amber-800 bg-amber-50 border-amber-200' },
    fail: { label: 'FAIL', className: 'text-red-700 bg-red-50 border-red-200' },
    not_applicable: {
      label: 'NOT APPLICABLE',
      className: 'text-on-surface-variant bg-surface-container-highest border-outline-variant',
    },
  };
  return config[norm] || config.not_applicable;
}

export function getStatus(
  inspection: Inspection | null,
  counts: { failed: number; review: number; verified: number },
  total: number
) {
  if (!total || (inspection?.risk_score === 0 && inspection.overall_result === 'review')) {
    return {
      label: 'Inconclusive',
      description: 'Image quality or OCR readability was insufficient for a definitive compliance determination.',
      tone: 'border-amber-200 bg-amber-50 text-amber-950',
      accent: 'bg-amber-400',
    };
  }
  if (counts.failed) {
    return {
      label: 'Non-compliant',
      description: 'One or more mandatory Legal Metrology declarations are missing or non-compliant.',
      tone: 'border-red-200 bg-red-50 text-red-950',
      accent: 'bg-red-500',
    };
  }
  if (counts.review) {
    return {
      label: 'Review Required',
      description: 'Some package declarations require verification due to image clarity or partial information.',
      tone: 'border-amber-200 bg-amber-50 text-amber-950',
      accent: 'bg-amber-400',
    };
  }
  return {
    label: 'Compliant',
    description: 'All applicable Legal Metrology (Packaged Commodities) declarations verified.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    accent: 'bg-emerald-500',
  };
}

export function getConfidence(
  label: ExtractedLabel | null,
  image: InspectionImage | null,
  score: number
) {
  if (!image || !label?.raw_ocr_text) {
    return {
      label: 'Low',
      reason: 'Image quality is insufficient to reliably verify package information.',
    };
  }
  const conf = label.ocr_confidence ?? label.extraction_confidence ?? 0;
  if (conf < 65 || score === 0) {
    return {
      label: 'Medium',
      reason: 'Some declarations were readable, but image clarity warrants manual review.',
    };
  }
  return {
    label: 'High',
    reason: 'The image contained clear, high-confidence readable declarations.',
  };
}

export function isField(value: unknown): value is ProductField {
  return (
    !!value && typeof value === 'object' && 'status' in value && ('confidence' in value || 'source' in value)
  );
}

export function legacyProductField(
  key: string,
  inspection: Inspection | null,
  label: ExtractedLabel | null
): ExtractedField {
  const values: Record<string, string | null | undefined> = {
    commodity_name: label?.commodity_name || inspection?.product_name,
    brand_or_commodity_name: label?.commodity_name || inspection?.product_name,
    generic_name: label?.commodity_name,
    net_quantity: label?.net_quantity,
    manufacturer_name: label?.manufacturer_name,
    packer_name: label?.packer_name,
    importer_name: label?.importer_name,
    mrp: label?.mrp,
    manufacturing_date: label?.month_year_packed,
    packing_date: label?.month_year_packed,
    country_of_origin: label?.country_of_origin,
    consumer_care_details: label?.customer_care_details,
    customer_care_phone: label?.customer_care_details,
  };
  return {
    value: values[key] || null,
    status: values[key] ? 'detected' : 'not_visible',
    confidence: values[key] ? (label?.extraction_confidence || 0) : 0,
    source: values[key] ? 'ocr' : 'none',
  };
}

export function parsePipelineMeta(raw: unknown): {
  extraction_source?: string;
  vision_used?: boolean;
  vision_error?: string | null;
} {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return {
      extraction_source: typeof obj.extraction_source === 'string' ? obj.extraction_source : undefined,
      vision_used: obj.vision_used === true,
      vision_error: typeof obj.vision_error === 'string' ? obj.vision_error : null,
    };
  }
  return {};
}

export function formatExtractionSource(meta: { extraction_source?: string }) {
  const source = meta?.extraction_source;
  if (source === 'ocr+vision') return 'OCR + Vision';
  if (source === 'gemini_vision') return 'Gemini Vision';
  if (source === 'vision') return 'Google Cloud Vision / Gemini';
  return 'OCR';
}


export interface PopulatedField {
  name: string;
  key: string;
  field: ProductField;
}

// The report's core grid uses display keys that differ from the canonical
// schema keys for a few historically legacy-mapped fields. Without this map
// a fully-detected canonical value is silently shown as "Not Detected".
const FIELD_KEY_MAP: Record<string, string> = {
  commodity_name: 'brand_or_commodity_name',
  best_before_date: 'expiry_date',
};

// Consumer-care can be stored as separate canonical fields (phone / toll-free /
// email) or as the single legacy consumer_care_details value. Compose the
// canonical pieces so a real contact block is never reported as missing.
export function composedCareField(productInformation: ProductInformation): ProductField | null {
  const careKeys: Array<'customer_care_phone' | 'toll_free_number' | 'customer_care_email'> = [
    'customer_care_phone',
    'toll_free_number',
    'customer_care_email',
  ];
  const parts: Array<{ value: string; confidence: number; source: ProductFieldSource }> = [];
  for (const key of careKeys) {
    const entry = productInformation[key];
    if (isField(entry) && entry.status === 'detected' && entry.value) {
      parts.push({ value: entry.value, confidence: entry.confidence, source: entry.source });
    }
  }
  if (!parts.length) return null;
  return {
    value: parts.map((p) => p.value).join(' | '),
    status: 'detected',
    confidence: Math.max(...parts.map((p) => p.confidence)),
    source: 'merged',
  } as ProductField;
}

export function sourceLabel(source?: string) {
  if (source === 'gemini_vision') return 'Gemini Vision';
  if (source === 'vision') return 'Vision';
  if (source === 'vision_fallback') return 'Vision Assisted';
  if (source === 'merged') return 'Merged';
  if (source === 'manual' || source === 'user') return 'Manual';
  if (source === 'ocr') return 'OCR Extracted';
  return 'Not Detected';
}

export function buildPopulatedFields(
  inspection: Inspection | null,
  label: ExtractedLabel | null,
  productInformation: ReturnType<typeof parseProductInformation>
): PopulatedField[] {
  const populated = CORE_LEGAL_METROLOGY_FIELDS.map(({ key: fieldKey, label: name }) => {
    const canonicalKey = fieldKey === 'consumer_care_details'
      ? undefined
      : (FIELD_KEY_MAP[fieldKey] || fieldKey);
    const canonical = canonicalKey ? productInformation[canonicalKey] : undefined;
    const field = isField(canonical)
      ? canonical
      : fieldKey === 'consumer_care_details'
        ? composedCareField(productInformation) || legacyProductField(fieldKey, inspection, label)
        : legacyProductField(fieldKey, inspection, label);
    return { name, key: fieldKey, field };
  });

  if (typeof console !== 'undefined') {
    const detected = populated.filter((p) => p.field.status === 'detected' && p.field.value).length;
    const sourceBreakdown = populated.reduce<Record<string, number>>((acc, p) => {
      acc[p.field.source] = (acc[p.field.source] || 0) + 1;
      return acc;
    }, {});
    console.debug(
      `[PACKINTEL][REPORT] populated core fields detected=${detected}/${populated.length}`,
      { sourceBreakdown }
    );
  }
  return populated;
}

// Non-core declarations the extractors may detect (batch, FSSAI, veg marks,
// marketer, certificates, packing date, contact email/name). These are not
// part of the 16-field core grid but must still be surfaced on the report.
export const SUPPLEMENTARY_DECLARATIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'packing_date', label: 'Packing Date' },
  { key: 'batch_number', label: 'Batch / Lot Number' },
  { key: 'fssai_number', label: 'FSSAI License Number' },
  { key: 'vegetarian_mark', label: 'Vegetarian Mark' },
  { key: 'non_vegetarian_mark', label: 'Non-Vegetarian Mark' },
  { key: 'marketer_name', label: 'Marketer Name' },
  { key: 'marketer_address', label: 'Marketer Address' },
  { key: 'toll_free_number', label: 'Toll Free Number' },
  { key: 'customer_care_name', label: 'Customer Care Name' },
  { key: 'customer_care_email', label: 'Customer Care Email' },
  { key: 'certifications', label: 'Certifications' },
];