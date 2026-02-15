from mitmproxy import http
import json
from datetime import datetime
import os

INTERCEPT_QUEUE_FILE = '/tmp/burp_lite_queue.json'
INTERCEPT_STATE_FILE = '/tmp/burp_lite_state.json'

class BurpLiteAddon:
    def __init__(self):
        self.pending = {}
        # Initialize state file
        with open(INTERCEPT_STATE_FILE, 'w') as f:
            json.dump({'enabled': False}, f)
        
    def request(self, flow: http.HTTPFlow):
        # Check if intercept is enabled
        try:
            with open(INTERCEPT_STATE_FILE, 'r') as f:
                state = json.load(f)
                intercept_enabled = state.get('enabled', False)
        except:
            intercept_enabled = False
        
        print(f"[PROXY] {flow.request.method} {flow.request.pretty_url} | Intercept: {intercept_enabled}")
        
        if intercept_enabled:
            req_data = self._serialize_request(flow)
            req_id = str(id(flow))
            req_data['id'] = req_id
            req_data['timestamp'] = datetime.now().isoformat()
            
            # Write to queue file
            try:
                if os.path.exists(INTERCEPT_QUEUE_FILE):
                    with open(INTERCEPT_QUEUE_FILE, 'r') as f:
                        queue = json.load(f)
                else:
                    queue = []
                
                queue.append(req_data)
                
                with open(INTERCEPT_QUEUE_FILE, 'w') as f:
                    json.dump(queue, f)
                    
                print(f"[INTERCEPT] Added to queue: {req_data['method']} {req_data['url']}")
            except Exception as e:
                print(f"[ERROR] Failed to write queue: {e}")
            
            # Store flow for later
            self.pending[req_id] = flow
            
            # Pause the flow
            flow.intercept()
    
    def _serialize_request(self, flow: http.HTTPFlow):
        return {
            'method': flow.request.method,
            'url': flow.request.pretty_url,
            'host': flow.request.host,
            'path': flow.request.path,
            'headers': dict(flow.request.headers),
            'body': flow.request.content.decode('utf-8', errors='replace') if flow.request.content else '',
            'scheme': flow.request.scheme,
            'port': flow.request.port,
        }

addons = [BurpLiteAddon()]