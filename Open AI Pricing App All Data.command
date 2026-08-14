#!/bin/zsh

set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

python3 - "$APP_DIR" <<'PY'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
import threading

app_dir = Path(sys.argv[1])
handler = partial(SimpleHTTPRequestHandler, directory=str(app_dir))
server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
url = f"http://127.0.0.1:{server.server_port}/"

print(f"AI Pricing all-data app is running at {url}")
print("Your browser should open automatically.")
print("Keep this Terminal window open while you use the app.")
print("Press Control+C in this window when you're done.")

threading.Timer(0.4, lambda: subprocess.run(["open", url], check=False)).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nStopping server...")
finally:
    server.server_close()
PY
