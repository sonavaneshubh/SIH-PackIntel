import logging
logging.basicConfig(level=logging.INFO)
from app.services.vision_service import GeminiProvider

p = GeminiProvider()
print('Configured:', p.is_configured())
res = p.extract('test_product.jpg')
print('Keys:', res.keys())
for k, v in res.items():
    print(f'{k}: {v.value} (source: {v.source})')
