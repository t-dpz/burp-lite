from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import subprocess
import threading
import requests
from typing import Dict, List, Optional
import uvicorn
import logging

# Filter out the noisy polling endpoint
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/api/intercept/actions") == -1

# Add filter to uvicorn access logger
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# State management
intercepted_requests: List[dict] = []
pending_actions: List[dict] = []
history: List[dict] = []
intercept_enabled = False
mitmproxy_process = None

# WebSocket connections
ws_clients: List[WebSocket] = []

def start_mitmproxy():
    global mitmproxy_process
    
    stdout_log = open('/tmp/mitmdump.log', 'w')
    stderr_log = open('/tmp/mitmdump_error.log', 'w')
    
    mitmproxy_process = subprocess.Popen(
        ['mitmdump', '-s', 'proxy_addon.py', '-p', '8081', '--listen-host', '0.0.0.0'],
        stdout=stdout_log,
        stderr=stderr_log
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[SERVER] Starting mitmproxy - logs at /tmp/mitmdump.log")
    thread = threading.Thread(target=start_mitmproxy, daemon=True)
    thread.start()
    
    yield
    
    # Shutdown (if needed)
    if mitmproxy_process:
        mitmproxy_process.terminate()

app = FastAPI(lifespan=lifespan)

# State management
intercepted_requests: List[dict] = []
pending_actions: List[dict] = []
intercept_enabled = False
mitmproxy_process = None

# WebSocket connections
ws_clients: List[WebSocket] = []

class InterceptStatus(BaseModel):
    enabled: bool

class InterceptRequest(BaseModel):
    id: str
    method: str
    url: str
    host: str
    path: str
    headers: dict
    body: str
    scheme: str
    port: int
    timestamp: str

def start_mitmproxy():
    global mitmproxy_process
    
    stdout_log = open('/tmp/mitmdump.log', 'w')
    stderr_log = open('/tmp/mitmdump_error.log', 'w')
    
    mitmproxy_process = subprocess.Popen(
        ['mitmdump', '-s', 'proxy_addon.py', '-p', '8081', '--listen-host', '0.0.0.0'],
        stdout=stdout_log,
        stderr=stderr_log
    )

# API endpoints for mitmproxy addon
@app.get("/api/intercept/status")
async def get_intercept_status():
    return {"enabled": intercept_enabled}

@app.post("/api/intercept/new")
async def new_intercepted_request(req: InterceptRequest):
    """Called by mitmproxy addon when a request is intercepted"""
    req_dict = req.model_dump()
    intercepted_requests.append(req_dict)
    
    # Notify all WebSocket clients
    for client in ws_clients:
        try:
            await client.send_json({
                'type': 'intercepted',
                'data': req_dict
            })
        except:
            pass
    
    return {"status": "ok"}

@app.get("/api/intercept/actions")
async def get_pending_actions():
    """Called by mitmproxy addon to get pending forward/drop actions"""
    global pending_actions
    actions = pending_actions.copy()
    pending_actions.clear()
    return actions

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    
    # Send current status
    await websocket.send_json({
        'type': 'intercept_status',
        'enabled': intercept_enabled
    })
    
    try:
        while True:
            data = await websocket.receive_json()
            await handle_ws_message(data, websocket)
    except WebSocketDisconnect:
        ws_clients.remove(websocket)

async def handle_ws_message(data: dict, websocket: WebSocket):
    global intercept_enabled, pending_actions, intercepted_requests
    msg_type = data.get('type')
    
    if msg_type == 'toggle_intercept':
        intercept_enabled = data.get('enabled', False)
        
        # Notify all clients
        for client in ws_clients:
            try:
                await client.send_json({
                    'type': 'intercept_status',
                    'enabled': intercept_enabled
                })
            except:
                pass
        
        print(f"[INTERCEPT] Toggled to: {intercept_enabled}")
    
    elif msg_type == 'forward':
        req_id = data.get('id')
        modified = data.get('modified')
        
        # Add to actions queue
        action = {'id': req_id, 'action': 'forward'}
        if modified:
            action['modified'] = modified
        pending_actions.append(action)
        
        # DON'T remove from intercepted_requests - keep them visible
        
        await websocket.send_json({'type': 'forwarded', 'id': req_id})
        print(f"[FORWARD] Request {req_id}")
    
    elif msg_type == 'drop':
        req_id = data.get('id')
        
        # Add to actions queue
        pending_actions.append({'id': req_id, 'action': 'drop'})
        
        # DON'T remove from intercepted_requests - keep them visible
        
        await websocket.send_json({'type': 'dropped', 'id': req_id})
        print(f"[DROP] Request {req_id}")
    
    elif msg_type == 'remove':
        req_id = data.get('id')
        
        # Remove from intercepted list
        intercepted_requests = [r for r in intercepted_requests if r['id'] != req_id]
        
        await websocket.send_json({'type': 'removed', 'id': req_id})
        print(f"[REMOVE] Request {req_id}")

@app.post("/api/repeater/send")
async def send_request(request_data: dict):
    """Send a request from repeater"""
    try:
        method = request_data.get('method', 'GET')
        url = request_data.get('url')
        headers = request_data.get('headers', {})
        body = request_data.get('body', '')
        
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            data=body,
            verify=False,
            timeout=30
        )
        
        return {
            'status_code': response.status_code,
            'headers': dict(response.headers),
            'body': response.text
        }
    except Exception as e:
        return {'error': str(e)}

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    with open("static/index.html") as f:
        return HTMLResponse(content=f.read())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)