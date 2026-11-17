"""Run the dashboard on this computer, reusing an already-running instance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler
import webbrowser

ROOT = Path(__file__).resolve().parent
PROJECT_ID = hashlib.sha256(str(ROOT).casefold().encode()).hexdigest()[:24]
PORTS = range(8765, 8776)
OPENER = build_opener(ProxyHandler({}))
ASSETS = {'index.html', 'indexxx.html', 'apps.js', 'dashboard.js', 'traffic.js', 'incidents.js', 'datasss.js', 'styles.css',
          'style - Copy.css', 'local-server.js', 'dashboard-ui.js', 'dashboard-ui.css', 'dataset-analysis.js',
          # sign-in gate
          'login-story.html', 'firebase-config.js', 'auth-adapter.js', 'auth-guard.js'}


def probe(port):
    try:
        with OPENER.open(f'http://127.0.0.1:{port}/__dashboard__/health', timeout=0.3) as response:
            data = json.load(response)
        if data.get('project') == PROJECT_ID and data.get('version') == 2:
            return data
    except (OSError, URLError, ValueError):
        pass
    return None


class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address):
        self.token = secrets.token_urlsafe(32)
        super().__init__(address, DashboardHandler)


class DashboardHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        # pythonw has no stderr; this quiet local server needs no request log.
        pass

    def valid_host(self):
        port = self.server.server_port
        return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')

    def json_response(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.valid_host():
            self.send_error(403)
            return
        path = urlsplit(self.path).path
        if path == '/__dashboard__/health':
            self.json_response({'project': PROJECT_ID, 'version': 2, 'token': self.server.token})
            return
        if path in ('/', '/indexxx.html', '/login-story.html', '/login-story%20%281%29.html', '/login-story%20(1).html') and (self.headers.get('Host', '').startswith('127.0.0.1:') or 'story%20' in path):
            target = '/index.html' if path in ('/indexxx.html', '/index.html') else '/login-story.html'
            self.send_response(302)
            self.send_header('Location', f'http://localhost:{self.server.server_port}{target}')
            self.end_headers()
            return
        if path == '/':
            self.path = '/login-story.html'
        resolved = Path(self.translate_path(self.path)).resolve()
        if not (resolved.parent == ROOT and resolved.name in ASSETS) and not resolved.is_relative_to(ROOT / 'vendor'):
            self.send_error(404)
            return
        if not resolved.is_file():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.send_error(405)

    def do_POST(self):
        allowed_origins = (None, f'http://127.0.0.1:{self.server.server_port}',
                           f'http://localhost:{self.server.server_port}')
        if (not self.valid_host() or self.headers.get('Origin') not in allowed_origins
                or not secrets.compare_digest(self.headers.get('X-Dashboard-Token', ''), self.server.token)):
            self.send_error(403)
            return
        if urlsplit(self.path).path != '/__dashboard__/stop':
            self.send_error(404)
            return
        self.json_response({'stopped': True})
        threading.Thread(target=self.server.shutdown, daemon=True).start()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--port', type=int, help='Use a specific port (for testing)')
    args = parser.parse_args()
    ports = [args.port] if args.port else PORTS
    for port in ports:
        existing = probe(port)
        if existing:
            if args.stop:
                request = Request(f'http://127.0.0.1:{port}/__dashboard__/stop', data=b'',
                                  headers={'X-Dashboard-Token': existing['token']})
                with OPENER.open(request, timeout=3):
                    pass
            elif not args.no_browser:
                webbrowser.open(f'http://localhost:{port}/login-story.html')
            return
    if args.stop:
        return
    for port in ports:
        try:
            server = DashboardServer(('127.0.0.1', port))
            break
        except OSError:
            time.sleep(0.1)
            if probe(port):
                if not args.no_browser:
                    webbrowser.open(f'http://localhost:{port}/login-story.html')
                return
    else:
        raise RuntimeError('Ports 8765-8775 are busy. Close an earlier dashboard server and retry.')
    url = f'http://localhost:{port}/login-story.html'
    print(f'Dashboard: {url}', flush=True)
    if not args.no_browser:
        threading.Timer(0.2, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if os.name == 'nt' and '--no-browser' not in __import__('sys').argv:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, str(error), 'Dashboard could not start', 16)
        raise SystemExit(1)
