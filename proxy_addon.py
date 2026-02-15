from mitmproxy import http
import requests
import json
from datetime import datetime

API_URL = "http://localhost:8080/api/intercept"

class BurpLiteAddon:
    def __init__(self):
        self.intercept_enabled = False
        self.pending = {}
        
    def request(self, flow: http.HTTPFlow):
        print(f">>> REQUEST: {flow.request.method} {flow.request.pretty_url}")
        
        # Check intercept status
        try:
            resp = requests.get(f"{API_URL}/status", timeout=0.5)
            self.intercept_enabled = resp.json().get('enabled', False)
        except:
            pass
        
        if self.intercept_enabled:
            req_data = {
                'id': str(id(flow)),
                'method': flow.request.method,
                'url': flow.request.pretty_url,
                'host': flow.request.host,
                'path': flow.request.path,
                'headers': dict(flow.request.headers),
                'body': flow.request.content.decode('utf-8', errors='replace') if flow.request.content else '',
                'scheme': flow.request.scheme,
                'port': flow.request.port,
                'timestamp': datetime.now().isoformat()
            }
            
            # Notify the server
            try:
                requests.post(f"{API_URL}/new", json=req_data, timeout=1)
                print(f">>> INTERCEPTED: {flow.request.method} {flow.request.pretty_url}")
                self.pending[str(id(flow))] = flow
                flow.intercept()
            except Exception as e:
                print(f">>> ERROR notifying server: {e}")

addons = [BurpLiteAddon()]