from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

ProductFieldStatus = Literal["detected", "not_printed", "not_visible", "uncertain", "not_applicable"]
ProductFieldSource = Literal["ocr", "vision", "merged", "user", "none"]

# Core Legal Metrology compliance fields (16 primary fields)
CORE_LEGAL_METROLOGY_FIELDS = (
    "commodity_name",
    "generic_name",
    "net_quantity",
    "quantity_unit",
    "manufacturer_name",
    "manufacturer_address",
    "packer_name",
    "packer_address",
    "importer_name",
    "importer_address",
    "country_of_origin",
    "mrp",
    "mrp_tax_inclusive",
    "unit_sale_price",
    "manufacturing_date",
    "best_before_date",
    "consumer_care_details",
)

# Canonical 26 fields across pipeline for backward compatibility
PRODUCT_FIELDS = (
    "brand_or_commodity_name",
    "generic_name",
    "net_quantity",
    "quantity_unit",
    "manufacturer_name",
    "manufacturer_address",
    "packer_name",
    "packer_address",
    "importer_name",
    "importer_address",
    "marketer_name",
    "marketer_address",
    "mrp",
    "mrp_tax_inclusive",
    "unit_sale_price",
    "packing_date",
    "manufacturing_date",
    "expiry_date",
    "batch_number",
    "customer_care_name",
    "customer_care_phone",
    "toll_free_number",
    "customer_care_email",
    "country_of_origin",
    "vegetarian_mark",
    "non_vegetarian_mark",
    "fssai_number",
    "certifications",
)

# Fields whose disagreement must never be silently resolved.
CONFLICT_SENSITIVE_FIELDS = (
    "mrp",
    "net_quantity",
    "packing_date",
    "manufacturing_date",
    "expiry_date",
    "fssai_number",
)


class ProductField(BaseModel):
    """Per-field extraction outcome.

    value      - printed/extracted value, or null when absent/unreadable
    status     - detected | not_printed | not_visible | uncertain | not_applicable
    confidence - 0-100, real confidence from the producing source
    source     - ocr | vision | user | none | merged
    normalized - optional standardized string representation
    conflicts  - optional debugging metadata when OCR and vision disagree
    """

    value: Optional[str] = None
    status: ProductFieldStatus = "not_visible"
    confidence: float = Field(default=0.0, ge=0.0, le=100.0)
    source: ProductFieldSource = "none"
    normalized: Optional[str] = None
    conflicts: Optional[List[Dict[str, Any]]] = None


def field(
    value: Optional[str] = None,
    status: str = "not_visible",
    confidence: float = 0.0,
    source: str = "none",
    normalized: Optional[str] = None,
    conflicts: Optional[List[Dict[str, Any]]] = None,
) -> ProductField:
    return ProductField(
        value=value,
        status=status,  # type: ignore[arg-type]
        confidence=confidence,
        source=source,  # type: ignore[arg-type]
        normalized=normalized,
        conflicts=conflicts,
    )


class OtherDetectedInformation(BaseModel):
    """Product details detected by OCR/Vision that are NOT Legal Metrology compliance rules.
    
    They do NOT affect Legal Metrology compliance scores or create violations.
    """
    brand_name: Optional[str] = None
    marketer_name: Optional[str] = None
    marketer_address: Optional[str] = None
    batch_number: Optional[str] = None
    fssai_number: Optional[str] = None
    vegetarian_mark: Optional[str] = None
    non_vegetarian_mark: Optional[str] = None
    nutrition_info: Dict[str, str] = Field(default_factory=dict)
    ingredients: Optional[str] = None
    certifications: Optional[str] = None


class ProductInformation(BaseModel):
    """Canonical structured product-information schema with Legal Metrology fields."""

    # Core Legal Metrology
    brand_or_commodity_name: ProductField = field()
    generic_name: ProductField = field()
    net_quantity: ProductField = field()
    quantity_unit: ProductField = field()
    manufacturer_name: ProductField = field()
    manufacturer_address: ProductField = field()
    packer_name: ProductField = field()
    packer_address: ProductField = field()
    importer_name: ProductField = field()
    importer_address: ProductField = field()
    country_of_origin: ProductField = field()
    mrp: ProductField = field()
    mrp_tax_inclusive: ProductField = field()
    unit_sale_price: ProductField = field()
    manufacturing_date: ProductField = field()
    packing_date: ProductField = field()
    expiry_date: ProductField = field()
    customer_care_name: ProductField = field()
    customer_care_phone: ProductField = field()
    toll_free_number: ProductField = field()
    customer_care_email: ProductField = field()

    # Legacy / Non-LM attributes maintained for compatibility
    marketer_name: ProductField = field()
    marketer_address: ProductField = field()
    batch_number: ProductField = field()
    vegetarian_mark: ProductField = field()
    non_vegetarian_mark: ProductField = field()
    fssai_number: ProductField = field()
    certifications: ProductField = field()

    # Separate container for non-LM information
    other_detected_information: OtherDetectedInformation = Field(default_factory=OtherDetectedInformation)

    def as_dict(self) -> Dict[str, ProductField]:
        return {name: getattr(self, name) for name in PRODUCT_FIELDS if hasattr(self, name)}

    def model_dump_canonical(self) -> Dict[str, Dict[str, Any]]:
        return {name: getattr(self, name).model_dump() for name in PRODUCT_FIELDS if hasattr(self, name)}


class ProductExtraction(BaseModel):
    """Structured output schema requested from the vision LLM (Gemini)."""

    image_quality_flag: bool = False
    raw_text: Optional[str] = None
    brand_or_commodity_name: ProductField = Field(default_factory=field)
    generic_name: ProductField = Field(default_factory=field)
    net_quantity: ProductField = Field(default_factory=field)
    quantity_unit: ProductField = Field(default_factory=field)
    manufacturer_name: ProductField = Field(default_factory=field)
    manufacturer_address: ProductField = Field(default_factory=field)
    packer_name: ProductField = Field(default_factory=field)
    packer_address: ProductField = Field(default_factory=field)
    importer_name: ProductField = Field(default_factory=field)
    importer_address: ProductField = Field(default_factory=field)
    marketer_name: ProductField = Field(default_factory=field)
    marketer_address: ProductField = Field(default_factory=field)
    mrp: ProductField = Field(default_factory=field)
    mrp_tax_inclusive: ProductField = Field(default_factory=field)
    unit_sale_price: ProductField = Field(default_factory=field)
    packing_date: ProductField = Field(default_factory=field)
    manufacturing_date: ProductField = Field(default_factory=field)
    expiry_date: ProductField = Field(default_factory=field)
    batch_number: ProductField = Field(default_factory=field)
    customer_care_name: ProductField = Field(default_factory=field)
    customer_care_phone: ProductField = Field(default_factory=field)
    toll_free_number: ProductField = Field(default_factory=field)
    customer_care_email: ProductField = Field(default_factory=field)
    country_of_origin: ProductField = Field(default_factory=field)
    vegetarian_mark: ProductField = Field(default_factory=field)
    non_vegetarian_mark: ProductField = Field(default_factory=field)
    fssai_number: ProductField = Field(default_factory=field)
    certifications: ProductField = Field(default_factory=field)