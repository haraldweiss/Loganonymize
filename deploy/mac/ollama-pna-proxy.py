#!/usr/bin/env python3
"""Ollama PNA Proxy — fügt Access-Control-Allow-Private-Network: true hinzu.

    usage:  ./ollama-pna-proxy.py
            curl http://127.0.0.1:11435/api/tags   # statt :11434

    Problem:  Chrome blockiert http://localhost von HTTPS-Seiten (Private
              Network Access), auch wenn OLLAMA_ORIGINS gesetzt ist. Ollama
              setzt den nötigen Header Access-Control-Allow-Private-Network
              nicht. Dieser Proxy fügt ihn ein.

    Install (launchd):
        cp ollama-pna-proxy.py /usr/local/bin/
        cp com.user.ollama-pna-proxy.plist ~/Library/LaunchAgents/
        launchctl load ~/Library/LaunchAgents/com.user.ollama-pna-proxy.plist
"""

import http.server
import urllib.request
import sys

OLLAMA_PORT = 11434
PROXY_PORT = 11435


class PNAProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self._proxy()

    def do_POST(self):
        self._proxy()

    def do_OPTIONS(self):
        # CORS preflight
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '600')

    def _proxy(self):
        body = None
        if self.command == 'POST':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)

        upstream = f'http://127.0.0.1:{OLLAMA_PORT}{self.path}'
        req = urllib.request.Request(upstream, data=body, method=self.command)
        for h, v in self.headers.items():
            if h.lower() not in ('host', 'connection'):
                req.add_header(h, v)

        try:
            resp = urllib.request.urlopen(req, timeout=600)
            self.send_response(resp.status)
            self._cors_headers()
            for h, v in resp.headers.items():
                if h.lower() not in ('transfer-encoding', 'connection', 'access-control-allow-origin'):
                    self.send_header(h, v)
            self.end_headers()
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(f'Proxy error: {e}'.encode())

    def log_message(self, fmt, *args):
        sys.stderr.write(f'[ollama-pna] {args[0]} {args[1]} {args[2]}\n')


if __name__ == '__main__':
    httpd = http.server.HTTPServer(('127.0.0.1', PROXY_PORT), PNAProxyHandler)
    sys.stderr.write(f'ollama-pna-proxy: listening on {PROXY_PORT} → {OLLAMA_PORT}\n')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()
