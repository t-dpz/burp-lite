from mitmproxy import http
import json
import asyncio
from datetime import datetime

class BurpLiteAddon:
    def __init__(self):
        self.intercepted = []
        self.pending = []
        self.intercept_enabled = False
        self.websocket_clients = []
        
    def request(self, flow: http.HTTPFlow):
        if self.intercept_enabled:
            # Store intercepted request
            req_data = self._serialize_request(flow)
            req_data['id'] = id(flow)
            req_data['timestamp'] = datetime.now().isoformat()
            
            self.pending.append({
                'flow': flow,
                'data': req_data
            })
            
            # Notify WebSocket clients
            asyncio.create_task(self._notify_clients(req_data))
            
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
    
    def _serialize_response(self, flow: http.HTTPFlow):
        if not flow.response:
            return None
        return {
            'status_code': flow.response.status_code,
            'headers': dict(flow.response.headers),
            'body': flow.response.content.decode('utf-8', errors='replace') if flow.response.content else '',
        }
    
    async def _notify_clients(self, data):
        for client in self.websocket_clients:
            try:
                await client.send_json({
                    'type': 'intercepted',
                    'data': data
                })
            except:
                pass

addons = [BurpLiteAddon()]