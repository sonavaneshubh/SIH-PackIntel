import io
import os
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
        OCR text extraction from product label images with real confidence and
        word-level regions. Runs multiple page-segmentation modes over enhanced
        variants and keeps the most meaningful result.
        """
        if not image_url:
            raise ValueError("Image URL is required for OCR scanning.")

        try:
            pil_img = cls._fetch_image(image_url)
        except (OSError, ValueError) as err:
            raise ValueError(f"Could not load image from input: {err}") from err

        quality = cls._analyze_image_quality(pil_img)
        diagnostics = get_tesseract_diagnostics()
        if not diagnostics["available"]:
            return {
                "status": "completed_with_warning",
                "raw_text": "",
                "text": "",
                "confidence": 0.0,
                "engine": "tesseract",
                "lines": [],
                "regions": [],
                "image_quality": "unusable",
                "quality_reason": diagnostics["message"],
                "quality": quality,
            }

        tesseract_command = _resolve_tesseract_command()
        if not tesseract_command:
            return {
                "status": "completed_with_warning",
                "raw_text": "",
                "text": "",
                "confidence": 0.0,
                "engine": "tesseract",
                "lines": [],
                "regions": [],
                "image_quality": "unusable",
                "quality_reason": "Tesseract OCR is unavailable.",
                "quality": quality,
            }

        pytesseract.pytesseract.tesseract_cmd = tesseract_command
        try:
            variants = cls._preprocess_image(pil_img)
        except (OSError, ValueError) as err:
            quality["quality"] = "poor"
            quality["reason"] = f"Image could not be prepared for OCR: {err}"
            return {
                "status": "completed_with_warning",
                "raw_text": "",
                "text": "",
                "confidence": 0.0,
                "engine": "tesseract",
                "lines": [],
                "regions": [],
                "image_quality": "unusable",
                "quality_reason": quality["reason"],
                "quality": quality,
            }

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
            ocr_text = ""
            best_data = None
        else:
            candidates.sort(key=lambda c: cls._score_candidate(c[0]), reverse=True)
            ocr_text, best_variant, best_psm = candidates[0]
            try:
                best_data = cls._run_tesseract_data(best_variant, best_psm)
            except (pytesseract.TesseractError, OSError) as err:
                logger.warning("OCR data layer failed: %s", err)
                best_data = None

        if not ocr_text and ocr_warning:
            quality["reason"] = f"OCR warning: {ocr_warning}"
        elif not ocr_text and not quality["reason"]:
            quality["reason"] = "No readable package-label information was detected."

        if ocr_text and best_data:
            width, height = pil_img.size
            confidence = cls._compute_confidence(best_data)
            regions = cls._extract_regions(best_data, width, height)
        else:
            confidence = 0.0
            regions = []

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
            "engine": "tesseract",
            "lines": lines,
            "regions": regions,
            "layout_regions": layout_result["regions"],
            "layout_text": layout_result["text"],
            "layout_region_count": layout_result["region_count"],
            "image_quality": "poor" if quality["quality"] == "poor" else ("usable" if ocr_text else "unusable"),
            "quality_reason": quality["reason"],
            "quality": quality,
        }


def get_ocr_service() -> OCRService:
    """Factory function to get configured OCR service."""
    return OCRService()