from mitmproxy import http

class BurpLiteAddon:
    def request(self, flow: http.HTTPFlow):
        print(f">>> REQUEST INTERCEPTED: {flow.request.method} {flow.request.pretty_url}")

addons = [BurpLiteAddon()]