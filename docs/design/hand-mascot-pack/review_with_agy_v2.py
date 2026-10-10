"""Run the user's named local agy reviewer; no permission bypass flag."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT / 'review'
prompt = (REVIEW/'review-request-v2.md').read_text()
result = subprocess.run([
    'agy', '-p', prompt,
    '--add-dir', str(REVIEW), '--output-format', 'text', '--effort', 'high',
    '--mode', 'plan', '--print-timeout', '300s'
], cwd=REVIEW, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
(REVIEW/'agy-review-v2.txt').write_text(result.stdout)
(REVIEW/'agy-stderr-v2.txt').write_text(result.stderr)
print(result.stdout[-10000:])
if result.returncode:
    print('agy exit status:', result.returncode)
    print(result.stderr[-2000:])
raise SystemExit(result.returncode)