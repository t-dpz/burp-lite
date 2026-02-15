# Burp Lite



- **HTTP Intercept Proxy** - Capture and modify requests in real-time
- **Repeater** - Manually craft and replay HTTP requests
- **Request History** - Track all intercepted traffic

#
- Python 3.9+
- pip or pipx

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

### Ports

- **Web UI**: `8080` (configurable in `server.py`)
- **Proxy**: `8081` (configurable in `proxy_addon.py` startup)
