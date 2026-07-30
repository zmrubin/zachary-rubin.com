#!/usr/bin/env python3
"""
Static dev server for homepage2.0.

Identical to `python3 -m http.server` except it sends no-store on everything.
The site is native ES modules with no build step, so the browser will otherwise
serve edited modules straight out of its memory cache and a reload silently
shows you the previous version.

Production hosting should do the opposite — cache /vendor and /public hard.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable; only surface failures.
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = partial(NoCacheHandler, directory=root)
    print(f"homepage2.0 dev server -> http://localhost:{port} (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
