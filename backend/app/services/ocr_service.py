import io
import os
import glob
import base64
import logging
import shutil
from typing import Dict, Any, List, Optional
import urllib.request
from PIL import Image, ImageEnhance, ImageFilter, ImageStat
from app.core.config import settings
from app.services.layout_ocr import extract_layout_ocr

logger = logging.getLogger(__name__)

try:
    import pytesseract
    HAS_PYTESSERACT = True
except ImportError:
    HAS_PYTESSERACT = False

try:
    from google.cloud import vision
    HAS_GOOGLE_VISION = True
except ImportError:
    HAS_GOOGLE_VISION = False

_VISION_TIMEOUT_SECONDS = max(1, int(getattr(settings, "OCR_TIMEOUT_SECONDS", 60)))

_PSMOS = (3, 6, 11)


def _resolve_tesseract_command() -> str | None:
    """Resolve an optional configured command or the platform PATH entry."""
    configured_command = (
        os.getenv("TESSERACT_CMD", "").strip()
        or settings.TESSERACT_CMD.strip()
    )
    if configured_command:
        return shutil.which(configured_command) or (
            configured_command if os.path.isfile(configured_command) else None
        )

    path_command = shutil.which("tesseract")
    if path_command:
        return path_command

    if os.name == "nt":
        for candidate in (
            os.path.join(os.environ.get("ProgramFiles", ""), "Tesseract-OCR", "tesseract.exe"),
            os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Tesseract-OCR", "tesseract.exe"),
        ):
            if os.path.isfile(candidate):
                return candidate

    return None


def get_tesseract_diagnostics() -> Dict[str, Any]:
    """Return a safe status describing the Python wrapper and native OCR binary."""
    if not HAS_PYTESSERACT:
        return {
            "available": False,
            "reason": "pytesseract_missing",
            "message": "pytesseract is not installed",
        }

    configured_command = (
        os.getenv("TESSERACT_CMD", "").strip()
        or settings.TESSERACT_CMD.strip()
    )
    tesseract_command = _resolve_tesseract_command()
    if not tesseract_command:
        if configured_command:
            return {
                "available": False,
                "reason": "tesseract_inaccessible",
                "message": "TESSERACT_CMD is configured but the executable cannot be found.",
            }
        return {
            "available": False,
            "reason": "tesseract_missing",
            "message": (
                "Tesseract OCR is not installed or not available in PATH. "
                "Install Tesseract or set TESSERACT_CMD to its executable."
            ),
        }

    pytesseract.pytesseract.tesseract_cmd = tesseract_command
    try:
        version = str(pytesseract.get_tesseract_version()).strip()
    except Exception:
        return {
            "available": False,
            "reason": "tesseract_inaccessible",
            "message": "Tesseract OCR is configured but cannot be executed.",
        }

    return {
        "available": True,
        "reason": "ok",
        "message": "Tesseract OCR is available",
        "version": version,
    }


def get_google_vision_diagnostics() -> Dict[str, Any]:
    """Return a safe status describing the Google Cloud Vision client."""
    if not HAS_GOOGLE_VISION:
        return {
            "available": False,
            "reason": "google_cloud_vision_missing",
            "message": "google-cloud-vision is not installed",
        }
    credentials = OCRService._google_vision_credentials()
    try:
        if credentials is not None:
            vision.ImageAnnotatorClient(credentials=credentials)
        else:
            vision.ImageAnnotatorClient()
        return {
            "available": True,
            "reason": "ok",
            "message": "Google Cloud Vision is available",
        }
    except Exception as exc:
        return {
            "available": False,
            "reason": "credentials_unavailable",
            "message": f"Google Cloud Vision cannot be initialized: {exc}",
        }


class OCRService:
    @staticmethod
    def _fetch_image(image_input: str) -> Image.Image:
        """Fetches PIL Image from URL, data URI, or local file path."""
        if not image_input or not isinstance(image_input, str):
            raise ValueError("No image URL or path provided")

        image_input = image_input.strip()

        # Handle data URI (data:image/png;base64,...)
        if image_input.startswith("data:image"):
            header, base64_data = image_input.split(",", 1)
            image_bytes = base64.b64decode(base64_data)
            return Image.open(io.BytesIO(image_bytes))

        # Handle HTTP / HTTPS URL
        if image_input.startswith("http://") or image_input.startswith("https://"):
            req = urllib.request.Request(
                image_input,
                headers={"User-Agent": "PackIntel-OCR-Scanner/1.0"}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                image_bytes = response.read()
            return Image.open(io.BytesIO(image_bytes))

        # Handle local file path
        if os.path.exists(image_input):
            return Image.open(image_input)

        raise ValueError(f"Could not load image from input: {image_input[:50]}")

    @staticmethod
    def _preprocess_image(image: Image.Image) -> List[Image.Image]:
        """Produce OCR variants of the image. The enhanced-grayscale variant is
        primary; a binarized variant is generated only when contrast is poor."""
        if image.mode != "RGB":
            image = image.convert("RGB")

        w, h = image.size
        if w < 600 or h < 600:
            scale = max(600 / w, 600 / h)
            image = image.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        enhancer = ImageEnhance.Contrast(image)
        enhanced = enhancer.enhance(1.5)

        grayscale = enhanced.convert("L")
        stats = ImageStat.Stat(grayscale)
        variants = [grayscale]
        if stats.stddev[0] < 40:
            binary = grayscale.point(lambda p: 255 if p > 128 else 0, mode="1")
            variants.append(binary.convert("L"))
        return variants

    @staticmethod
    def _analyze_image_quality(image: Image.Image) -> Dict[str, Any]:
        """Classify obvious image-quality problems before OCR is attempted."""
        grayscale = image.convert("L")
        width, height = image.size
        stats = ImageStat.Stat(grayscale)
        brightness = stats.mean[0]
        contrast = stats.stddev[0]
        edge_stats = ImageStat.Stat(grayscale.filter(ImageFilter.FIND_EDGES))
        sharpness = edge_stats.stddev[0]

        reasons = []
        if width < 200 or height < 200:
            reasons.append("image resolution is too low")
        if brightness < 20:
            reasons.append("image is too dark")
        elif brightness > 240:
            reasons.append("image is overexposed")
        if contrast < 8:
            reasons.append("image has insufficient contrast")
        if sharpness < 4 and width >= 200 and height >= 200:
            reasons.append("image is too blurry to reliably inspect")

        return {
            "width": width,
            "height": height,
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "sharpness": round(sharpness, 2),
            "quality": "poor" if reasons else "usable",
            "reason": "; ".join(reasons) if reasons else None,
        }

    @staticmethod
    def _meaningful_text(text: str) -> bool:
        meaningful = "".join(character for character in text if character.isalnum())
        return len(meaningful) >= 4 and any(character.isalpha() for character in meaningful)

    @staticmethod
    def _run_tesseract_string(image: Image.Image, psm: int) -> str:
        return pytesseract.image_to_string(image, config=f"--psm {psm}")

    @staticmethod
    def _run_tesseract_data(image: Image.Image, psm: int) -> Dict[str, Any]:
        return pytesseract.image_to_data(
            image, config=f"--psm {psm}", output_type=pytesseract.Output.DICT
        )

    @staticmethod
    def _score_candidate(text: str) -> float:
        words = [w for w in text.split() if w.isalnum() and any(c.isalpha() for c in w)]
        alpha_len = sum(1 for c in text if c.isalpha())
        return len(words) + 0.02 * alpha_len

    @staticmethod
    def _compute_confidence(data: Dict[str, Any]) -> float:
        """Real confidence = mean word confidence from the data layer."""
        confidences = []
        for idx, text in enumerate(data.get("text", [])):
            token = (text or "").strip()
            if not token or not any(c.isalnum() for c in token):
                continue
            try:
                level = int(data["level"][idx])
            except (KeyError, ValueError, IndexError):
                level = 5
            if level != 5:
                continue
            try:
                conf = float(data["conf"][idx])
            except (KeyError, ValueError, IndexError):
                continue
            if conf >= 0:
                confidences.append(conf)
        if not confidences:
            return 0.0
        return round(sum(confidences) / len(confidences), 2)

    @staticmethod
    def _google_vision_credentials() -> Any:
        """Resolve Google Cloud Vision credentials.

        Resolution order:
        1. ``GOOGLE_APPLICATION_CREDENTIALS`` (standard ADC service-account key).
        2. A gitignored service-account key placed in the backend directory
           (e.g. ``backend/packintel-*.json``).
        Returns ``None`` when only ambient Application Default Credentials should
        be used (gcloud / Compute Engine / metadata server).
        """
        sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if sa_path and os.path.isfile(sa_path):
            try:
                from google.oauth2 import service_account
                return service_account.Credentials.from_service_account_file(sa_path)
            except Exception as err:
                logger.warning("OCR: Failed to load GOOGLE_APPLICATION_CREDENTIALS: %s", err)

        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        for candidate in sorted(glob.glob(os.path.join(backend_dir, "packintel-*.json"))):
            try:
                from google.oauth2 import service_account
                return service_account.Credentials.from_service_account_file(candidate)
            except Exception as err:
                logger.warning("OCR: Failed to load service account key %s: %s", candidate, err)
        return None

    @staticmethod
    def _vision_client() -> Optional["vision.ImageAnnotatorClient"]:
        """Return a Google Cloud Vision client using the configured credentials."""
        if not HAS_GOOGLE_VISION:
            return None
        credentials = OCRService._google_vision_credentials()
        try:
            if credentials is not None:
                return vision.ImageAnnotatorClient(credentials=credentials)
            return vision.ImageAnnotatorClient()
        except Exception as err:
            logger.warning("OCR: Could not initialize Google Vision client: %s", err)
            return None

    @classmethod
    def _run_google_vision(cls, image: Image.Image) -> tuple[str, float]:
        """Run Google Cloud Vision OCR and return ``(text, confidence)``.

        Raises on failure so the caller can fall back to Tesseract.
        """
        if not HAS_GOOGLE_VISION:
            raise RuntimeError("google-cloud-vision is not installed")
        client = cls._vision_client()
        if client is None:
            raise RuntimeError("Google Cloud Vision client could not be initialized")

        if image.mode != "RGB":
            image = image.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        content = buffer.getvalue()

        vision_image = vision.Image(content=content)
        features = [vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)]
        try:
            try:
                response = client.annotate_image(
                    {"image": vision_image, "features": features},
                    timeout=_VISION_TIMEOUT_SECONDS,
                )
            except Exception:
                # Some product labels work better with the generic text detector.
                response = client.annotate_image(
                    {
                        "image": vision_image,
                        "features": [
                            vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION)
                        ],
                    },
                    timeout=_VISION_TIMEOUT_SECONDS,
                )
        except Exception as exc:
            raise RuntimeError(f"Google Cloud Vision request failed: {exc}") from exc

        if response.error and response.error.message:
            raise RuntimeError(f"Google Cloud Vision error: {response.error.message}")

        annotation = getattr(response, "full_text_annotation", None)
        text = (annotation.text or "").strip() if annotation else ""

        confidences = []
        for page in (annotation.pages or []):
            for block in page.blocks:
                for paragraph in block.paragraphs:
                    for word in paragraph.words:
                        if word.confidence and word.confidence > 0:
                            confidences.append(word.confidence)
        if not confidences:
            confidence = 100.0 if text else 0.0
        else:
            confidence = round(
                (sum(confidences) / len(confidences)) * 100.0, 2
            )
        return text, confidence

    @classmethod
    def _run_tesseract(cls, pil_img: Image.Image) -> tuple[str, float, List[Dict[str, Any]]]:
        """Run Tesseract over enhanced OCR variants and return ``(text, confidence, regions)``."""
        diagnostics = get_tesseract_diagnostics()
        if not diagnostics["available"]:
            raise RuntimeError(diagnostics["message"])

        tesseract_command = _resolve_tesseract_command()
        if not tesseract_command:
            raise RuntimeError("Tesseract OCR is unavailable.")

        pytesseract.pytesseract.tesseract_cmd = tesseract_command
        try:
            variants = cls._preprocess_image(pil_img)
        except (OSError, ValueError) as err:
            raise RuntimeError(f"Image could not be prepared for OCR: {err}") from err

        candidates = []
        ocr_warning = None
        for variant in variants:
            for psm in _PSMOS:
                try:
                    text = cls._run_tesseract_string(variant, psm).strip()
                    if cls._meaningful_text(text):
                        candidates.append((text, variant, psm))
                except (pytesseract.TesseractError, OSError) as err:
                    ocr_warning = str(err)

        if not candidates:
            raise RuntimeError(ocr_warning or "Tesseract returned no readable text.")

        candidates.sort(key=lambda c: cls._score_candidate(c[0]), reverse=True)
        ocr_text, best_variant, best_psm = candidates[0]

        best_data = None
        try:
            best_data = cls._run_tesseract_data(best_variant, best_psm)
        except (pytesseract.TesseractError, OSError) as err:
            logger.warning("OCR data layer failed: %s", err)

        width, height = pil_img.size
        if best_data:
            confidence = cls._compute_confidence(best_data)
            regions = cls._extract_regions(best_data, width, height)
        else:
            confidence = 0.0
            regions = []
        return ocr_text, confidence, regions

    @staticmethod
    def _extract_regions(
        data: Dict[str, Any], width: int, height: int
    ) -> List[Dict[str, Any]]:
        regions = []
        for idx, text in enumerate(data.get("text", [])):
            token = (text or "").strip()
            if not token or not any(c.isalnum() for c in token):
                continue
            try:
                conf = float(data["conf"][idx])
            except (KeyError, ValueError, IndexError):
                conf = -1
            if conf < 0:
                continue
            try:
                left = int(data["left"][idx])
                top = int(data["top"][idx])
                tw = int(data["width"][idx])
                th = int(data["height"][idx])
            except (KeyError, ValueError, IndexError):
                continue
            regions.append({
                "text": token,
                "left": round(min(1.0, max(0.0, left / width)), 4),
                "top": round(min(1.0, max(0.0, top / height)), 4),
                "width": round(min(1.0, max(0.0, tw / width)), 4),
                "height": round(min(1.0, max(0.0, th / height)), 4),
            })
        return regions

    @classmethod
    def process_image(cls, image_url: str) -> Dict[str, Any]:
        """
        OCR text extraction from product label images.

        Primary engine: Google Cloud Vision (document/text detection).
        Fallback engine: Tesseract (locally, with light preprocessing).
        The scan pipeline never crashes on OCR failure: both engines failing
        returns a structured ``poor_quality`` result.
        """
        if not image_url:
            raise ValueError("Image URL is required for OCR scanning.")

        try:
            pil_img = cls._fetch_image(image_url)
        except (OSError, ValueError) as err:
            raise ValueError(f"Could not load image from input: {err}") from err

        quality = cls._analyze_image_quality(pil_img)

        ocr_text = ""
        confidence = 0.0
        regions: List[Dict[str, Any]] = []
        engine: Optional[str] = None

        # ---- Primary OCR: Google Cloud Vision -------------------------------
        try:
            ocr_text, confidence = cls._run_google_vision(pil_img)
            engine = "google_vision"
            logger.info("OCR: Google Vision")
        except Exception as err:
            logger.warning(
                "OCR: Vision failed, using Tesseract (%s: %s)",
                type(err).__name__, err,
            )

        # ---- Fallback OCR: Tesseract ----------------------------------------
        if not cls._meaningful_text(ocr_text):
            if ocr_text:
                logger.info("OCR: Poor quality - Google Vision returned little text")
            try:
                ocr_text, confidence, regions = cls._run_tesseract(pil_img)
                engine = "tesseract"
                logger.info("OCR: Tesseract fallback succeeded")
            except Exception as err:
                logger.warning(
                    "OCR: Tesseract failed (%s: %s)", type(err).__name__, err,
                )

        # ---- Both engines failed --------------------------------------------
        if not cls._meaningful_text(ocr_text):
            ocr_text = ""
            confidence = 0.0
            regions = []
            logger.info("OCR: Poor quality")
            quality["reason"] = (
                "No readable package-label information was detected by either OCR engine."
            )
            return {
                "status": "poor_quality",
                "text": "",
                "ocr_status": "poor_quality",
                "ocr_score": 0,
                "raw_text": "",
                "confidence": 0.0,
                "engine": engine or "unknown",
                "lines": [],
                "regions": [],
                "layout_regions": [],
                "layout_text": "",
                "layout_region_count": 0,
                "image_quality": "unusable",
                "quality_reason": quality["reason"],
                "quality": quality,
            }

        lines = [line.strip() for line in ocr_text.splitlines() if line.strip()]
        try:
            layout_result = extract_layout_ocr(pil_img)
        except (OSError, ValueError, TypeError) as err:
            logger.warning("ROI layout OCR failed; retaining full-image OCR: %s", err)
            layout_result = {"regions": [], "text": "", "region_count": 0, "engine": "roi-segmentation"}

        return {
            "status": "success" if ocr_text else "completed_with_warning",
            "text": ocr_text,
            "raw_text": ocr_text,
            "confidence": confidence,
            "engine": engine or "unknown",
            "lines": lines,
            "regions": regions,
            "layout_regions": layout_result["regions"],
            "layout_text": layout_result["text"],
            "layout_region_count": layout_result["region_count"],
            "image_quality": "poor" if quality["quality"] == "poor" else ("usable" if ocr_text else "unusable"),
            "quality_reason": quality["reason"],
            "quality": quality,
        }


def get_ocr_service():
    """Create the OCR engine used by the production scan pipeline.

    Google Cloud Vision is the primary OCR engine; Tesseract is the local
    fallback. The returned :class:`OCRService` exposes the same
    ``process_image`` interface the scan endpoint expects, so extraction,
    compliance and report generation remain unchanged.
    """
    logger.info("OCR engine selected: Google Cloud Vision -> Tesseract fallback")
    return OCRService()