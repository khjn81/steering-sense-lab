#!/usr/bin/env python3
"""Local-only static server; serves dist, never the workspace or source credentials."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.task': 'application/octet-stream'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parent / 'dist'), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Permissions-Policy', 'camera=(self), microphone=()')
        super().end_headers()
    def do_GET(self):
        if self.path == '/__test__':
            data = (Path(__file__).resolve().parent / 'tests/browser-probe.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8768)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'후진 감각: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
