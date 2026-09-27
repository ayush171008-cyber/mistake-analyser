from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parent / "public"
os.chdir(ROOT)
print("Mistake Notebook: http://127.0.0.1:8080")
ThreadingHTTPServer(("0.0.0.0",8080), SimpleHTTPRequestHandler).serve_forever()
