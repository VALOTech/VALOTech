#!/usr/bin/env python
"""Serve the repository over HTTP with caching turned off.

`python -m http.server` sends no cache headers, so a browser applies heuristic
caching and keeps serving a stylesheet or a script it fetched minutes ago.
Busting the page's URL does not help: an asset has its own URL. That has twice
produced a measurement describing a file that was not running -- once reporting
a colour distribution that had already shipped as absent, once reporting an
event that had already fired as never firing.

Run: python scripts/serve.py [port]
"""

import functools
import http.server
import os
import socketserver
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PORT = 8123


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request, without the date noise: a probe run prints
        # hundreds and the useful part is the path and the status.
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = functools.partial(NoStore, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print("http://127.0.0.1:%d  (Ctrl-C to stop)" % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("")
    return 0


if __name__ == "__main__":
    sys.exit(main())
