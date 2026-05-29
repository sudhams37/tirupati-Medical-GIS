import http.server
import os
import socket
import socketserver
import sys

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
# 8000 is often taken by other local APIs (e.g. FastAPI); prefer 8080 for this app.
DEFAULT_PORTS = [8080, 8000, 8888, 9000]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)


class CustomTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("", port))
            return True
        except OSError:
            return False


def resolve_port() -> int:
    env_port = os.environ.get("PORT")
    candidates = []
    if env_port:
        try:
            candidates.append(int(env_port))
        except ValueError:
            print(f"Invalid PORT env value '{env_port}', using defaults.", file=sys.stderr)
    for port in DEFAULT_PORTS:
        if port not in candidates:
            candidates.append(port)

    for port in candidates:
        if port_is_free(port):
            return port
    return candidates[0]


def main() -> None:
    required_files = [
        "datasets/ap_mandals.geojson",
        "datasets/tirupati-district-mandals.txt",
        "datasets/dengue.json",
        "datasets/malaria.json",
        "datasets/mandal wise no of hospitals.json",
    ]
    missing = [path for path in required_files if not os.path.isfile(os.path.join(DIRECTORY, path))]
    if missing:
        print("Warning: missing dataset files:", ", ".join(missing), file=sys.stderr)

    port = resolve_port()
    try:
        httpd = CustomTCPServer(("", port), Handler)
    except OSError as exc:
        print(
            f"Could not start server on port {port}: {exc}\n"
            "Stop other apps using this port, or set PORT to a free port.",
            file=sys.stderr,
        )
        sys.exit(1)

    url = f"http://localhost:{port}/"
    print(f"Server is running! Open the map: {url}")
    if port != 8000 and not port_is_free(8000):
        print(
            "Note: port 8000 is already in use by another app. "
            "Use the URL above (not :8000) so map data loads correctly."
        )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
