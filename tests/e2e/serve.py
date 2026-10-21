"""Local-only test server: tolerate the app's concurrent ES module requests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class TestServer(ThreadingHTTPServer):
    request_queue_size = 128

if __name__ == "__main__":
    TestServer(("127.0.0.1", 4173), SimpleHTTPRequestHandler).serve_forever()
