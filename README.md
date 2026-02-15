# 🔥 Burp Lite

!!! WORK IN PROGRESS !!!

- **🎯 HTTP Intercept Proxy** - Capture and modify requests in real-time
- **🔄 Repeater** - Manually craft and replay HTTP requests
- **📜 Request History** - Track all intercepted traffic

- Python 3.9+
- pip or pipx

## 📖 Usage

### Intercept Mode

1. Click **"Intercept: OFF"** to enable interception
2. Make requests through the proxy
3. Captured requests appear in the left panel
4. Click a request to view/modify it
5. Use **Forward** to send it or **Drop** to block it

### Repeater

1. Click **"Send to Repeater"** from an intercepted request, or
2. Manually paste a raw HTTP request
3. Click **"Send"** to replay the request
4. View the response in the right panel
5. Modify and resend as needed

### History

Browse all intercepted requests with full details and responses.

## 🛠️ Project Structure
```
burp-lite/
├── server.py              # FastAPI backend server
├── proxy_addon.py         # mitmproxy interceptor addon
├── static/
│   ├── index.html        # Main UI
│   ├── style.css         # Styling
│   └── app.js            # Client-side logic
├── requirements.txt       # Python dependencies
└── README.md
```

## ⚙️ Configuration

### Ports

- **Web UI**: `8080` (configurable in `server.py`)
- **Proxy**: `8081` (configurable in `proxy_addon.py` startup)
