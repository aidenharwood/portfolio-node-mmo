"""Dev server: static files with caching disabled so module edits show up on every reload."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # Dev-only frame capture: POST a data URL to /__shot/<name> → saved as PNG in SHOT_DIR.
    def do_POST(self):
        if not self.path.startswith("/__shot/"):
            self.send_error(404)
            return
        import base64, os, re
        name = re.sub(r"[^a-zA-Z0-9_-]", "", self.path[len("/__shot/"):]) or "shot"
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        data = base64.b64decode(body.split(",", 1)[1])
        out_dir = os.environ.get("SHOT_DIR", ".shots")
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, name + ".png"), "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    import os
    # Serve the project this script lives in, whatever directory it was started from.
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
