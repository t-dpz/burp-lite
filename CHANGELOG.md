# Changelog

All notable changes to Burp Lite will be documented in this file.

## [1.0.0] - 2026-02-15

### Initial Release

#### Core Features
- HTTP/HTTPS Intercept Proxy with real-time capture
- Request Repeater with manual editing
- WebSocket-based live updates
- Dark-themed modern UI

#### Advanced Features
- **Response Rendering**
  - Raw text view
  - Pretty-printed JSON/XML with syntax highlighting  
  - HTML iframe rendering
  - Auto-detection of content types

- **Encoder/Decoder Suite**
  - Base64, URL, HTML, Hex encoding/decoding
  - MD5, SHA1, SHA256 hashing
  - JWT decoder
  - String utilities (reverse, uppercase, lowercase)

- **Scope Management**
  - Wildcard pattern matching
  - File extension filtering
  - HTB-optimized presets
  - Persistent configuration via localStorage

- **Search & Filter**
  - Real-time search across requests
  - Method-specific filters (GET, POST, PUT, DELETE)
  - Live statistics and request counts

- **Code Export**
  - Export to cURL
  - Export to Python requests
  - Export to JavaScript fetch
  - Export to PowerShell

- **Intruder Fuzzing Engine**
  - Sniper attack mode
  - Battering Ram mode
  - Wordlist support
  - Response timing analysis
  - Status code tracking
  - Full response inspection

#### Technical
- FastAPI backend with WebSocket support
- mitmproxy for SSL interception
- Zero dependencies in frontend (vanilla JS)
- Persistent settings via localStorage
- Clean separation of concerns

### Known Issues
- Large binary responses may slow down UI
- WebSocket interception not yet implemented
- History pagination needed for very long sessions

---

**Legend:**
- 🎉 Major release
- ✨ New feature
- 🐛 Bug fix
- 📝 Documentation
- ⚡ Performance improvement