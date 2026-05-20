import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

class CustomTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with CustomTCPServer(("", PORT), Handler) as httpd:
    print(f"Server is running! Click here to open the map: http://localhost:{PORT}/")
    httpd.serve_forever()
