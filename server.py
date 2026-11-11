"""
SiteBrain Local Development Server
Usage: python server.py [port]
Defaults to port 3000. Serves index.html, survey.html, and all assets with proper MIME types and CORS.
"""

import http.server
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000

class SiteBrainHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    # Allow address reuse to prevent 'Address already in use' errors on quick restarts
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SiteBrainHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"\n==================================================================")
        print(f"  SiteBrain — Geospatial Real Estate Decision Intelligence Platform")
        print(f"==================================================================")
        print(f"  • Marketing Landing Page:  {url}/index.html")
        print(f"  • Geospatial Workbench:    {url}/survey.html")
        print(f"  • Local Server Root:       {url}/")
        print(f"------------------------------------------------------------------")
        print(f"  Press Ctrl+C to terminate the local server.\n")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down SiteBrain local server.")
