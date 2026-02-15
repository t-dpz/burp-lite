# 💀 Burp Lite -=tdpz=-

A lightweight, modern, web-based HTTP proxy and penetration testing toolkit built for HackTheBox adventures and security research. Burp Lite brings the power of Burp Suite's essential features into a sleek, browser-based interface with zero Java dependencies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![Status](https://img.shields.io/badge/status-production_ready-success.svg)
![Made For](https://img.shields.io/badge/made_for-HackTheBox-orange.svg)

## ✨ Features

### 🎯 Core Functionality
- **HTTP Intercept Proxy** - Capture, modify, and replay HTTP/HTTPS requests in real-time
- **Repeater** - Manually craft and send requests with full control
- **Intruder** - Automated fuzzing and brute-forcing with payload injection
- **Encoder/Decoder** - Swiss-army knife for encoding, decoding, and hashing
- **Scope Management** - Filter traffic with wildcard patterns and file extension rules
- **Search & Filter** - Instantly find requests by URL, method, headers, or body content

### 🎨 Advanced Features
- **Smart Response Rendering**
  - Raw text view
  - Pretty-printed JSON/XML with syntax highlighting
  - HTML rendering in iframe
  - Auto-detection of content types

- **Export to Code**
  - cURL commands
  - Python requests
  - JavaScript fetch
  - PowerShell Invoke-WebRequest

- **Scope Intelligence**
  - Wildcard host patterns (`*.htb`, `10.10.10.*`)
  - Auto-exclude static resources (images, CSS, JS, fonts)
  - HTB-optimized presets
  - Persistent configuration

- **Powerful Search**
  - Real-time filtering as you type
  - Method-specific filters (GET, POST, PUT, DELETE)
  - Search across URLs, headers, and body content
  - Live statistics and request breakdown

### 🔐 Security Tools
- **Encoding/Decoding**
  - Base64, URL, HTML, Hex
  - MD5, SHA1, SHA256 hashing
  - JWT decoder
  - String utilities (reverse, case conversion)

- **Fuzzing Engine**
  - Sniper attack mode (single position)
  - Battering Ram mode (all positions)
  - File-based wordlist loading
  - Response timing analysis
  - Status code tracking
  - Full response inspection

### 💅 User Experience
- Dark-themed, modern UI inspired by GitHub
- Smooth animations and transitions
- Real-time WebSocket updates
- Persistent settings via localStorage
- Keyboard shortcuts
- Responsive design

## 📸 Screenshots

![Burp Lite Interface](docs/screenshot.png)
*Clean, modern interface with intercept proxy and real-time updates*

![Intruder Fuzzing](docs/intruder.png)
*Automated fuzzing with payload injection and response analysis*

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- pip or pipx

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/burp-lite.git
cd burp-lite

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Running
```bash
# Start the server (starts both web UI and proxy)
python server.py

# Access the web interface
# Open http://localhost:8080 in your browser

# Configure your browser/tools to use the proxy
# HTTP Proxy: localhost:8081
```

### SSL Certificate Setup (For HTTPS Interception)

To intercept HTTPS traffic, install mitmproxy's CA certificate:

1. Configure your browser to use the proxy (localhost:8081)
2. Visit http://mitm.it
3. Download and install the certificate for your platform
4. Restart your browser

**Firefox:**
1. Settings → Privacy & Security → Certificates → View Certificates
2. Authorities → Import → Select `mitmproxy-ca-cert.pem`
3. Check "Trust this CA to identify websites"

## 📖 Usage Guide

### Intercept Mode

1. Click **"Intercept: OFF"** to enable interception
2. Requests will appear in the left panel as they're captured
3. Select a request to view/modify it
4. Use **Forward** to send it or **Drop** to block it
5. Click **Remove** to clean up the list
6. Use **Send to Repeater** to replay with modifications

### Scope Management

1. Click **⚙️ Scope** button
2. Use presets like **"HTB Box"** for quick setup
3. Add include patterns: `*.htb`, `10.10.10.*`
4. Add exclude patterns to filter out noise
5. Configure file extension filters
6. Click **Save Scope**

**Example Scope for HTB:**
```
Include:
*.htb
10.10.10.*
10.10.11.*

Exclude:
*.google.com
*.cloudflare.com
```

### Using the Repeater

1. Paste a raw HTTP request or send from Intercept
2. Modify the request as needed
3. Click **Send** to execute
4. Toggle between **Raw**, **Pretty**, and **Rendered** views
5. Use **📤 Export** to copy as code (cURL, Python, etc.)

### Fuzzing with Intruder

1. Paste your request template
2. Mark injection points with `§value§`
   - Example: `username=§admin§&password=§test§`
3. Load a wordlist or paste payloads
4. Select attack type:
   - **Sniper** - One position at a time
   - **Battering Ram** - All positions get same payload
5. Click **🚀 Start Attack**
6. Monitor results with status codes, response times, and lengths
7. Click **View** on any result to see full response

**Example Intruder Request:**
```http
POST /login HTTP/1.1
Host: target.htb
Content-Type: application/x-www-form-urlencoded

username=§admin§&password=§password123§
```

### Encoder/Decoder

1. Switch to **Encoder** tab
2. Enter text in the input field
3. Click encoding/decoding buttons
4. Use **Copy** to grab the output

**Common Use Cases:**
- Decode Base64 tokens
- URL encode payloads
- Hash passwords (MD5, SHA1, SHA256)
- Decode JWTs to inspect claims
- Convert to/from Hex

### Search & Filter

1. Use the search bar to filter requests in real-time
2. Click method filters (GET, POST, etc.) for quick filtering
3. Combine search with method filters
4. View live statistics at the bottom

## 🛠️ Configuration

### Ports

- **Web UI**: `8080` (configurable in `server.py`)
- **Proxy**: `8081` (configurable in `proxy_addon.py` startup)

### Browser Proxy Settings

**Firefox Container:**
```
Manual proxy configuration:
  HTTP Proxy: localhost (or your server IP)
  Port: 8081
  ☑️ Use this proxy server for all protocols
```

**System-wide (Linux):**
```bash
export http_proxy=http://localhost:8081
export https_proxy=http://localhost:8081
```

### Debugging

View mitmproxy logs:
```bash
tail -f /tmp/mitmdump.log
```

## 🎯 HackTheBox Tips

### Optimal Scope Configuration

For HTB boxes, use this scope setup:
```
Include:
*.htb
10.10.10.*
10.10.11.*

Exclude Images: ✓
Exclude CSS: ✓
Exclude JS: ✓
Exclude Fonts: ✓
```

### Common Fuzzing Payloads

**SQL Injection:**
```
' OR 1=1--
' OR '1'='1
admin' --
' UNION SELECT NULL--
```

**Path Traversal:**
```
../
../../etc/passwd
....//....//etc/passwd
```

**Command Injection:**
```
; ls
| whoami
`id`
$(cat /etc/passwd)
```

### Quick Workflow

1. **Start burp-lite** → `python server.py`
2. **Set scope** → Click ⚙️ Scope, use "HTB Box" preset
3. **Enable intercept** → Toggle intercept ON
4. **Browse target** → All in-scope traffic is captured
5. **Find interesting requests** → Use search/filter
6. **Test with Repeater** → Modify and replay
7. **Fuzz parameters** → Send to Intruder with wordlist
8. **Export findings** → Copy as cURL/Python for documentation

## 🔧 Development

### Project Structure
```
burp-lite/
├── server.py              # FastAPI backend server
├── proxy_addon.py         # mitmproxy interceptor addon
├── static/
│   ├── index.html        # Main UI
│   ├── style.css         # Styling with dark theme
│   └── app.js            # Client-side logic
├── requirements.txt       # Python dependencies
└── README.md
```

### Adding Features

The architecture is modular:

- **Backend**: FastAPI handles API routes and WebSocket connections
- **Proxy**: mitmproxy addon captures and forwards traffic
- **Frontend**: Vanilla JavaScript for UI interactions

### Running in Development Mode
```bash
# Terminal 1: Run mitmproxy with verbose output
mitmdump -s proxy_addon.py -p 8081 --listen-host 0.0.0.0

# Terminal 2: Run server with auto-reload
uvicorn server:app --reload --host 0.0.0.0 --port 8080
```

## 🤝 Contributing

Contributions are welcome! Here are some ideas:

**Planned Features:**
- [ ] Request comparison/diff tool
- [ ] WebSocket interception
- [ ] GraphQL support
- [ ] Auto-scan for common vulnerabilities
- [ ] Response timing graphs
- [ ] Session token analyzer
- [ ] Custom plugin system

### Steps to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [mitmproxy](https://mitmproxy.org/) - Powerful Python proxy framework
- [FastAPI](https://fastapi.tiangolo.com/) - Modern, fast web framework
- Inspired by [Burp Suite](https://portswigger.net/burp) and [OWASP ZAP](https://www.zaproxy.org/)
- Built with ❤️ for the HackTheBox community

## ⚠️ Disclaimer

This tool is intended for authorized security testing and educational purposes only. Always obtain proper authorization before testing any systems you don't own. The authors are not responsible for misuse or damage caused by this tool.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/burp-lite/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/burp-lite/discussions)
- **HackTheBox Forums**: Share your experiences!

## 🌟 Star History

If you find this tool useful, please consider giving it a star! ⭐

---

**Made with 🔥 by security researchers, for security researchers**

Happy Hacking! 🔓