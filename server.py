from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import subprocess
import threading
import requests
from typing import Dict, List
import uvicorn

app = FastAPI()

# State management
intercepted_requests: Dict[int, dict] = {}
history: List[dict] = []
intercept_enabled = False
mitmproxy_process = None

# WebSocket connections
ws_clients: List[WebSocket] = []

@app.on_event("startup")
async def startup():
    """Start mitmproxy in background"""
    global mitmproxy_process
    thread = threading.Thread(target=start_mitmproxy, daemon=True)
    thread.start()

def start_mitmproxy():
    global mitmproxy_process
    mitmproxy_process = subprocess.Popen(
        ['mitmdump', '-s', 'proxy_addon.py', '-p', '8081'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_ws_message(data, websocket)
    except WebSocketDisconnect:
        ws_clients.remove(websocket)

async def handle_ws_message(data: dict, websocket: WebSocket):
    msg_type = data.get('type')
    
    if msg_type == 'toggle_intercept':
        global intercept_enabled
        intercept_enabled = data.get('enabled', False)
        # Notify all clients
        for client in ws_clients:
            await client.send_json({
                'type': 'intercept_status',
                'enabled': intercept_enabled
            })
    
    elif msg_type == 'forward':
        req_id = data.get('id')
        # Forward the request (implementation depends on mitmproxy integration)
        await websocket.send_json({'type': 'forwarded', 'id': req_id})
    
    elif msg_type == 'drop':
        req_id = data.get('id')
        await websocket.send_json({'type': 'dropped', 'id': req_id})

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
        
        # Add to history
        history_item = {
            'request': request_data,
            'response': {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'body': response.text
            }
        }
        history.append(history_item)
        
        return history_item['response']
    except Exception as e:
        return {'error': str(e)}

@app.get("/api/history")
async def get_history():
    return history

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    with open("static/index.html") as f:
        return HTMLResponse(content=f.read())

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)