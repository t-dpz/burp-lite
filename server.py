from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import subprocess
import threading
import requests
from typing import Dict, List
import uvicorn
import asyncio
import json
import os

app = FastAPI()

INTERCEPT_QUEUE_FILE = '/tmp/burp_lite_queue.json'
INTERCEPT_STATE_FILE = '/tmp/burp_lite_state.json'

# State management
history: List[dict] = []
intercept_enabled = False
mitmproxy_process = None

# WebSocket connections
ws_clients: List[WebSocket] = []

# Background task to poll queue
async def poll_intercept_queue():
    """Poll the queue file and notify WebSocket clients"""
    last_queue_size = 0
    while True:
        try:
            if os.path.exists(INTERCEPT_QUEUE_FILE):
                with open(INTERCEPT_QUEUE_FILE, 'r') as f:
                    queue = json.load(f)
                
                # If new items were added, notify clients
                if len(queue) > last_queue_size:
                    new_items = queue[last_queue_size:]
                    for item in new_items:
                        for client in ws_clients:
                            try:
                                await client.send_json({
                                    'type': 'intercepted',
                                    'data': item
                                })
                            except:
                                pass
                    last_queue_size = len(queue)
        except Exception as e:
            print(f"[POLL ERROR] {e}")
        
        await asyncio.sleep(0.5)  # Poll every 500ms

@app.on_event("startup")
async def startup():
    """Start mitmproxy in background and polling task"""
    global mitmproxy_process
    
    # Clear queue on startup
    if os.path.exists(INTERCEPT_QUEUE_FILE):
        os.remove(INTERCEPT_QUEUE_FILE)
    
    # Start mitmproxy
    thread = threading.Thread(target=start_mitmproxy, daemon=True)
    thread.start()
    
    # Start polling task
    asyncio.create_task(poll_intercept_queue())

def start_mitmproxy():
    global mitmproxy_process
    mitmproxy_process = subprocess.Popen(
        ['mitmdump', '-s', 'proxy_addon.py', '-p', '8081', '--listen-host', '0.0.0.0'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    
    # Send current intercept state
    try:
        with open(INTERCEPT_STATE_FILE, 'r') as f:
            state = json.load(f)
        await websocket.send_json({
            'type': 'intercept_status',
            'enabled': state.get('enabled', False)
        })
    except:
        pass
    
    try:
        while True:
            data = await websocket.receive_json()
            await handle_ws_message(data, websocket)
    except WebSocketDisconnect:
        ws_clients.remove(websocket)

async def handle_ws_message(data: dict, websocket: WebSocket):
    msg_type = data.get('type')
    
    if msg_type == 'toggle_intercept':
        enabled = data.get('enabled', False)
        
        # Write to state file
        with open(INTERCEPT_STATE_FILE, 'w') as f:
            json.dump({'enabled': enabled}, f)
        
        # Notify all clients
        for client in ws_clients:
            try:
                await client.send_json({
                    'type': 'intercept_status',
                    'enabled': enabled
                })
            except:
                pass
        
        print(f"[INTERCEPT] Toggled to: {enabled}")
    
    elif msg_type == 'forward':
        req_id = data.get('id')
        # Remove from queue
        try:
            with open(INTERCEPT_QUEUE_FILE, 'r') as f:
                queue = json.load(f)
            queue = [q for q in queue if q['id'] != req_id]
            with open(INTERCEPT_QUEUE_FILE, 'w') as f:
                json.dump(queue, f)
        except:
            pass
        
        await websocket.send_json({'type': 'forwarded', 'id': req_id})
        print(f"[FORWARD] Request {req_id}")
    
    elif msg_type == 'drop':
        req_id = data.get('id')
        # Remove from queue
        try:
            with open(INTERCEPT_QUEUE_FILE, 'r') as f:
                queue = json.load(f)
            queue = [q for q in queue if q['id'] != req_id]
            with open(INTERCEPT_QUEUE_FILE, 'w') as f:
                json.dump(queue, f)
        except:
            pass
        
        await websocket.send_json({'type': 'dropped', 'id': req_id})
        print(f"[DROP] Request {req_id}")

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