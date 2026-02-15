from mitmproxy import http
import requests
import json
from datetime import datetime
import threading
import time

API_URL = "http://localhost:8080/api/intercept"

class BurpLiteAddon:
    def __init__(self):
        self.intercept_enabled = False
        self.pending = {}
        
        # Start background thread to poll for actions
        self.running = True
        self.poll_thread = threading.Thread(target=self._poll_actions, daemon=True)
        self.poll_thread.start()
        
    def _poll_actions(self):
        """Poll server for forward/drop actions"""
        while self.running:
            try:
                resp = requests.get(f"{API_URL}/actions", timeout=1)
                actions = resp.json()
                
                for action in actions:
                    req_id = action['id']
                    action_type = action['action']
                    
                    if req_id in self.pending:
                        flow = self.pending[req_id]
                        
                        if action_type == 'forward':
                            print(f">>> FORWARDING: {req_id}")
                            
                            # Apply modifications if present
                            if 'modified' in action:
                                mod = action['modified']
                                flow.request.method = mod.get('method', flow.request.method)
                                flow.request.path = mod.get('path', flow.request.path)
                                
                                # Update headers
                                if 'headers' in mod:
                                    flow.request.headers.clear()
                                    for k, v in mod['headers'].items():
                                        flow.request.headers[k] = v
                                
                                # Update body
                                if 'body' in mod:
                                    flow.request.content = mod['body'].encode('utf-8')
                            
                            flow.resume()
                            del self.pending[req_id]
                            
                        elif action_type == 'drop':
                            print(f">>> DROPPING: {req_id}")
                            flow.kill()
                            del self.pending[req_id]
                
            except Exception as e:
                pass
            
            time.sleep(0.2)  # Poll every 200ms
        
    def request(self, flow: http.HTTPFlow):
        print(f">>> REQUEST: {flow.request.method} {flow.request.pretty_url}")
        
        # Check intercept status
        try:
            resp = requests.get(f"{API_URL}/status", timeout=0.5)
            self.intercept_enabled = resp.json().get('enabled', False)
        except Exception as e:
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