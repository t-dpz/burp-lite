let ws;
let interceptEnabled = false;
let currentRequest = null;
let interceptQueue = [];
let searchQuery = '';
let methodFilter = 'all';

// WebSocket connection
function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}/ws`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        setTimeout(connectWebSocket, 1000);
    };
}

function handleWebSocketMessage(data) {
    if (data.type === 'intercepted') {
        // Check scope before adding
        if (!isInScope(data.data.url)) {
            console.log('[SCOPE] Filtered out:', data.data.url);
            return;
        }
        interceptQueue.push(data.data);
        renderInterceptQueue();
    } else if (data.type === 'intercept_status') {
        interceptEnabled = data.enabled;
        updateInterceptButton();
    } else if (data.type === 'removed') {
        interceptQueue = interceptQueue.filter(r => r.id !== data.id);
        renderInterceptQueue();
        if (currentRequest && currentRequest.id === data.id) {
            currentRequest = null;
            document.getElementById('interceptRequest').value = '';
        }
    }
}

// Filter and search functions
function matchesSearch(req) {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    const searchableText = [
        req.method,
        req.url,
        req.host,
        req.path,
        req.body,
        ...Object.keys(req.headers),
        ...Object.values(req.headers)
    ].join(' ').toLowerCase();

    return searchableText.includes(query);
}

function matchesMethodFilter(req) {
    if (methodFilter === 'all') return true;
    return req.method === methodFilter;
}

function getFilteredQueue() {
    return interceptQueue.filter(req =>
        matchesSearch(req) && matchesMethodFilter(req)
    );
}

// UI Functions
function renderInterceptQueue() {
    const queue = document.getElementById('interceptQueue');
    const stats = document.getElementById('queueStats');
    const filtered = getFilteredQueue();

    if (filtered.length === 0) {
        if (interceptQueue.length === 0) {
            queue.innerHTML = '<div class="no-results">No requests intercepted yet</div>';
        } else {
            queue.innerHTML = '<div class="no-results">No requests match your filters</div>';
        }
        stats.innerHTML = '';
        return;
    }

    queue.innerHTML = filtered.map((req, idx) => {
        const originalIdx = interceptQueue.indexOf(req);
        return `
            <div class="request-item" onclick="selectRequest(${originalIdx})">
                <strong>${req.method}</strong> ${highlightMatch(req.url)}
                <div style="font-size:0.8em;color:#858585">${req.timestamp}</div>
            </div>
        `;
    }).join('');

    // Update stats
    const methodCounts = {};
    interceptQueue.forEach(req => {
        methodCounts[req.method] = (methodCounts[req.method] || 0) + 1;
    });

    const methodStats = Object.entries(methodCounts)
        .map(([method, count]) => `${method}: ${count}`)
        .join(' | ');

    if (filtered.length === interceptQueue.length) {
        stats.innerHTML = `<span class="highlight">${interceptQueue.length}</span> requests | ${methodStats}`;
    } else {
        stats.innerHTML = `Showing <span class="highlight">${filtered.length}</span> of <span class="highlight">${interceptQueue.length}</span> | ${methodStats}`;
    }
}

function highlightMatch(text) {
    if (!searchQuery) return text;

    const regex = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
    return text.replace(regex, '<mark style="background: var(--accent-primary); color: white; padding: 0 0.25rem; border-radius: 2px;">$1</mark>');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectRequest(idx) {
    currentRequest = interceptQueue[idx];
    const requestText = formatRequest(currentRequest);
    document.getElementById('interceptRequest').value = requestText;

    document.querySelectorAll('.request-item').forEach((item, i) => {
        const filtered = getFilteredQueue();
        const originalIdx = interceptQueue.indexOf(filtered[i]);
        item.classList.toggle('selected', originalIdx === idx);
    });
}

function formatRequest(req) {
    let text = `${req.method} ${req.path} HTTP/1.1\n`;
    text += `Host: ${req.host}\n`;
    for (const [key, value] of Object.entries(req.headers)) {
        text += `${key}: ${value}\n`;
    }
    if (req.body) {
        text += `\n${req.body}`;
    }
    return text;
}

function updateInterceptButton() {
    const btn = document.getElementById('toggleIntercept');
    btn.textContent = `Intercept: ${interceptEnabled ? 'ON' : 'OFF'}`;
    btn.style.background = interceptEnabled ? '#107c10' : '#0e639c';
}

// Search input handler
document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderInterceptQueue();
});

// Method filter handlers
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        methodFilter = chip.dataset.method;

        // Update active state
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        renderInterceptQueue();
    });
});

// Event Listeners
document.getElementById('toggleIntercept').addEventListener('click', () => {
    interceptEnabled = !interceptEnabled;
    ws.send(JSON.stringify({
        type: 'toggle_intercept',
        enabled: interceptEnabled
    }));
});

document.getElementById('forwardBtn').addEventListener('click', () => {
    if (currentRequest) {
        ws.send(JSON.stringify({
            type: 'forward',
            id: currentRequest.id
        }));
        document.querySelectorAll('.request-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
});

document.getElementById('dropBtn').addEventListener('click', () => {
    if (currentRequest) {
        ws.send(JSON.stringify({
            type: 'drop',
            id: currentRequest.id
        }));
        document.querySelectorAll('.request-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
});

document.getElementById('removeBtn').addEventListener('click', () => {
    if (currentRequest) {
        ws.send(JSON.stringify({
            type: 'remove',
            id: currentRequest.id
        }));
    }
});

document.getElementById('sendToRepeater').addEventListener('click', () => {
    if (currentRequest) {
        document.querySelector('[data-tab="repeater"]').click();
        document.getElementById('repeaterRequest').value = formatRequest(currentRequest);
    }
});

document.getElementById('sendRequest').addEventListener('click', async () => {
    const requestText = document.getElementById('repeaterRequest').value;
    const parsed = parseRequest(requestText);

    const response = await fetch('/api/repeater/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
    });

    const data = await response.json();
    displayResponse(data);
});

function parseRequest(text) {
    const lines = text.split('\n');
    const [method, path, protocol] = lines[0].split(' ');
    const headers = {};
    let body = '';
    let inBody = false;
    let host = '';
    let scheme = 'http';

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') {
            inBody = true;
            continue;
        }
        if (inBody) {
            body += lines[i] + '\n';
        } else {
            const [key, ...valueParts] = lines[i].split(':');
            const value = valueParts.join(':').trim();
            headers[key.trim()] = value;
            if (key.trim().toLowerCase() === 'host') {
                host = value;
            }
        }
    }

    // Detect scheme from the first line if it's a full URL
    if (path.startsWith('http://') || path.startsWith('https://')) {
        const url = path;
        scheme = url.startsWith('https://') ? 'https' : 'http';
        return { method, url, headers, body: body.trim() };
    }

    const url = `${scheme}://${host}${path}`;
    return { method, url, headers, body: body.trim() };
}

let currentResponseMode = 'raw';
let lastResponseData = null;

// Add this near the bottom, before connectWebSocket()
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        currentResponseMode = mode;

        // Update button states
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Re-render response in new mode
        if (lastResponseData) {
            displayResponse(lastResponseData);
        }
    });
});

function displayResponse(data) {
    lastResponseData = data;

    if (data.error) {
        document.getElementById('responseStatus').innerHTML = `<span style="color:#e81123">Error: ${data.error}</span>`;
        hideAllResponseViews();
        return;
    }

    document.getElementById('responseStatus').innerHTML = `Status: <strong style="color: ${getStatusColor(data.status_code)}">${data.status_code}</strong>`;

    const rawText = document.getElementById('repeaterResponse');
    const renderedFrame = document.getElementById('renderedResponse');
    const prettyPre = document.getElementById('prettyResponse');

    // Build raw response text
    let responseText = 'HTTP/1.1 ' + data.status_code + '\n';
    for (const [key, value] of Object.entries(data.headers)) {
        responseText += `${key}: ${value}\n`;
    }
    responseText += '\n' + data.body;

    rawText.value = responseText;

    // Show appropriate view based on mode
    hideAllResponseViews();

    if (currentResponseMode === 'raw') {
        rawText.style.display = 'block';
    } else if (currentResponseMode === 'rendered') {
        renderedFrame.style.display = 'block';
        const blob = new Blob([data.body], { type: 'text/html' });
        renderedFrame.src = URL.createObjectURL(blob);
    } else if (currentResponseMode === 'pretty') {
        prettyPre.style.display = 'block';

        // Try to detect and format content
        const contentType = data.headers['Content-Type'] || data.headers['content-type'] || '';

        if (contentType.includes('application/json') || isJSON(data.body)) {
            prettyPre.innerHTML = syntaxHighlightJSON(data.body);
        } else if (contentType.includes('text/html') || contentType.includes('text/xml')) {
            prettyPre.innerHTML = `<code>${escapeHtml(formatXML(data.body))}</code>`;
        } else {
            prettyPre.textContent = data.body;
        }
    }
}

function hideAllResponseViews() {
    document.getElementById('repeaterResponse').style.display = 'none';
    document.getElementById('renderedResponse').style.display = 'none';
    document.getElementById('prettyResponse').style.display = 'none';
}

function getStatusColor(status) {
    if (status >= 200 && status < 300) return '#3fb950';
    if (status >= 300 && status < 400) return '#58a6ff';
    if (status >= 400 && status < 500) return '#d29922';
    if (status >= 500) return '#f85149';
    return '#8b949e';
}

function isJSON(str) {
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

function syntaxHighlightJSON(json) {
    try {
        const obj = JSON.parse(json);
        const pretty = JSON.stringify(obj, null, 2);

        return pretty
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
    } catch (e) {
        return escapeHtml(json);
    }
}

function formatXML(xml) {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;

    xml = xml.replace(reg, '$1\n$2$3');
    xml.split('\n').forEach((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) {
                pad -= 1;
            }
        } else if (node.match(/^<\w([^>]*[^\/])?>.*$/)) {
            indent = 1;
        }

        formatted += PADDING.repeat(pad) + node + '\n';
        pad += indent;
    });

    return formatted.trim();
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tabName).classList.add('active');
    });
});
// Export functionality
document.getElementById('exportBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('show');
});

// Close export menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.export-dropdown')) {
        document.getElementById('exportMenu').classList.remove('show');
    }
});

document.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', () => {
        const format = option.dataset.export;
        const requestText = document.getElementById('repeaterRequest').value;

        if (!requestText.trim()) {
            alert('No request to export!');
            return;
        }

        const parsed = parseRequest(requestText);
        let exported = '';

        switch (format) {
            case 'curl':
                exported = exportToCurl(parsed);
                break;
            case 'python':
                exported = exportToPython(parsed);
                break;
            case 'javascript':
                exported = exportToJavaScript(parsed);
                break;
            case 'powershell':
                exported = exportToPowerShell(parsed);
                break;
        }

        navigator.clipboard.writeText(exported).then(() => {
            const originalText = option.textContent;
            option.textContent = '✓ Copied!';
            setTimeout(() => {
                option.textContent = originalText;
            }, 2000);
        });

        document.getElementById('exportMenu').classList.remove('show');
    });
});

function exportToCurl(req) {
    let curl = `curl -X ${req.method} '${req.url}'`;

    for (const [key, value] of Object.entries(req.headers)) {
        curl += ` \\\n  -H '${key}: ${value}'`;
    }

    if (req.body) {
        curl += ` \\\n  -d '${req.body.replace(/'/g, "\\'")}'`;
    }

    return curl;
}

function exportToPython(req) {
    const urlObj = new URL(req.url);

    let python = `import requests\n\n`;
    python += `url = "${req.url}"\n\n`;
    python += `headers = {\n`;

    for (const [key, value] of Object.entries(req.headers)) {
        python += `    "${key}": "${value}",\n`;
    }
    python += `}\n\n`;

    if (req.body) {
        python += `data = """${req.body}"""\n\n`;
        python += `response = requests.${req.method.toLowerCase()}(url, headers=headers, data=data)\n`;
    } else {
        python += `response = requests.${req.method.toLowerCase()}(url, headers=headers)\n`;
    }

    python += `\nprint(f"Status: {response.status_code}")\n`;
    python += `print(response.text)`;

    return python;
}

function exportToJavaScript(req) {
    let js = `const url = "${req.url}";\n\n`;
    js += `const options = {\n`;
    js += `  method: "${req.method}",\n`;
    js += `  headers: {\n`;

    for (const [key, value] of Object.entries(req.headers)) {
        js += `    "${key}": "${value}",\n`;
    }
    js += `  }`;

    if (req.body) {
        js += `,\n  body: ${JSON.stringify(req.body)}`;
    }

    js += `\n};\n\n`;
    js += `fetch(url, options)\n`;
    js += `  .then(response => response.text())\n`;
    js += `  .then(data => console.log(data))\n`;
    js += `  .catch(error => console.error('Error:', error));`;

    return js;
}

function exportToPowerShell(req) {
    let ps = `$url = "${req.url}"\n\n`;
    ps += `$headers = @{\n`;

    for (const [key, value] of Object.entries(req.headers)) {
        ps += `    "${key}" = "${value}"\n`;
    }
    ps += `}\n\n`;

    if (req.body) {
        ps += `$body = @"\n${req.body}\n"@\n\n`;
        ps += `$response = Invoke-WebRequest -Uri $url -Method ${req.method} -Headers $headers -Body $body\n`;
    } else {
        ps += `$response = Invoke-WebRequest -Uri $url -Method ${req.method} -Headers $headers\n`;
    }

    ps += `\nWrite-Host "Status: $($response.StatusCode)"\n`;
    ps += `Write-Host $response.Content`;

    return ps;
}
// Encoder functionality
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const input = document.getElementById('encoderInput').value;
        const output = document.getElementById('encoderOutput');

        try {
            let result = '';

            switch (action) {
                case 'base64-encode':
                    result = btoa(input);
                    break;
                case 'base64-decode':
                    result = atob(input);
                    break;
                case 'url-encode':
                    result = encodeURIComponent(input);
                    break;
                case 'url-decode':
                    result = decodeURIComponent(input);
                    break;
                case 'html-encode':
                    result = input.replace(/[&<>"']/g, m => ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#039;'
                    })[m]);
                    break;
                case 'html-decode':
                    const textarea = document.createElement('textarea');
                    textarea.innerHTML = input;
                    result = textarea.value;
                    break;
                case 'hex-encode':
                    result = Array.from(input)
                        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                        .join('');
                    break;
                case 'hex-decode':
                    result = input.match(/.{1,2}/g)
                        .map(byte => String.fromCharCode(parseInt(byte, 16)))
                        .join('');
                    break;
                case 'md5':
                    result = md5(input);
                    break;
                case 'sha1':
                    result = sha1(input);
                    break;
                case 'sha256':
                    result = sha256(input);
                    break;
                case 'reverse':
                    result = input.split('').reverse().join('');
                    break;
                case 'uppercase':
                    result = input.toUpperCase();
                    break;
                case 'lowercase':
                    result = input.toLowerCase();
                    break;
                case 'jwt-decode':
                    result = decodeJWT(input);
                    break;
                default:
                    result = 'Unknown action';
            }

            output.value = result;
        } catch (e) {
            output.value = `Error: ${e.message}`;
        }
    });
});

document.getElementById('copyOutput').addEventListener('click', () => {
    const output = document.getElementById('encoderOutput');
    output.select();
    document.execCommand('copy');

    const btn = document.getElementById('copyOutput');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 1500);
});

// JWT Decoder
function decodeJWT(token) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }

    const header = JSON.parse(atob(parts[0]));
    const payload = JSON.parse(atob(parts[1]));

    return JSON.stringify({
        header: header,
        payload: payload,
        signature: parts[2]
    }, null, 2);
}

// Hash functions (using SubtleCrypto API)
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha1(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Simple MD5 implementation
function md5(string) {
    function rotateLeft(value, shift) {
        return (value << shift) | (value >>> (32 - shift));
    }

    function addUnsigned(x, y) {
        return (x + y) >>> 0;
    }

    function cmn(q, a, b, x, s, t) {
        a = addUnsigned(addUnsigned(a, q), addUnsigned(x, t));
        return addUnsigned(rotateLeft(a, s), b);
    }

    function ff(a, b, c, d, x, s, t) {
        return cmn((b & c) | (~b & d), a, b, x, s, t);
    }

    function gg(a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & ~d), a, b, x, s, t);
    }

    function hh(a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }

    function ii(a, b, c, d, x, s, t) {
        return cmn(c ^ (b | ~d), a, b, x, s, t);
    }

    function convertToWordArray(string) {
        let wordArray = [];
        for (let i = 0; i < string.length * 8; i += 8) {
            wordArray[i >> 5] |= (string.charCodeAt(i / 8) & 0xFF) << (i % 32);
        }
        return wordArray;
    }

    function wordToHex(value) {
        let hex = '';
        for (let i = 0; i < 4; i++) {
            hex += ((value >> (i * 8 + 4)) & 0x0F).toString(16) +
                ((value >> (i * 8)) & 0x0F).toString(16);
        }
        return hex;
    }

    const wordArray = convertToWordArray(string);
    const wordCount = string.length * 8;

    wordArray[wordCount >> 5] |= 0x80 << (wordCount % 32);
    wordArray[(((wordCount + 64) >>> 9) << 4) + 14] = wordCount;

    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;

    for (let i = 0; i < wordArray.length; i += 16) {
        const aa = a, bb = b, cc = c, dd = d;

        a = ff(a, b, c, d, wordArray[i + 0], 7, 0xD76AA478);
        d = ff(d, a, b, c, wordArray[i + 1], 12, 0xE8C7B756);
        c = ff(c, d, a, b, wordArray[i + 2], 17, 0x242070DB);
        b = ff(b, c, d, a, wordArray[i + 3], 22, 0xC1BDCEEE);
        a = ff(a, b, c, d, wordArray[i + 4], 7, 0xF57C0FAF);
        d = ff(d, a, b, c, wordArray[i + 5], 12, 0x4787C62A);
        c = ff(c, d, a, b, wordArray[i + 6], 17, 0xA8304613);
        b = ff(b, c, d, a, wordArray[i + 7], 22, 0xFD469501);
        a = ff(a, b, c, d, wordArray[i + 8], 7, 0x698098D8);
        d = ff(d, a, b, c, wordArray[i + 9], 12, 0x8B44F7AF);
        c = ff(c, d, a, b, wordArray[i + 10], 17, 0xFFFF5BB1);
        b = ff(b, c, d, a, wordArray[i + 11], 22, 0x895CD7BE);
        a = ff(a, b, c, d, wordArray[i + 12], 7, 0x6B901122);
        d = ff(d, a, b, c, wordArray[i + 13], 12, 0xFD987193);
        c = ff(c, d, a, b, wordArray[i + 14], 17, 0xA679438E);
        b = ff(b, c, d, a, wordArray[i + 15], 22, 0x49B40821);

        a = gg(a, b, c, d, wordArray[i + 1], 5, 0xF61E2562);
        d = gg(d, a, b, c, wordArray[i + 6], 9, 0xC040B340);
        c = gg(c, d, a, b, wordArray[i + 11], 14, 0x265E5A51);
        b = gg(b, c, d, a, wordArray[i + 0], 20, 0xE9B6C7AA);
        a = gg(a, b, c, d, wordArray[i + 5], 5, 0xD62F105D);
        d = gg(d, a, b, c, wordArray[i + 10], 9, 0x02441453);
        c = gg(c, d, a, b, wordArray[i + 15], 14, 0xD8A1E681);
        b = gg(b, c, d, a, wordArray[i + 4], 20, 0xE7D3FBC8);
        a = gg(a, b, c, d, wordArray[i + 9], 5, 0x21E1CDE6);
        d = gg(d, a, b, c, wordArray[i + 14], 9, 0xC33707D6);
        c = gg(c, d, a, b, wordArray[i + 3], 14, 0xF4D50D87);
        b = gg(b, c, d, a, wordArray[i + 8], 20, 0x455A14ED);
        a = gg(a, b, c, d, wordArray[i + 13], 5, 0xA9E3E905);
        d = gg(d, a, b, c, wordArray[i + 2], 9, 0xFCEFA3F8);
        c = gg(c, d, a, b, wordArray[i + 7], 14, 0x676F02D9);
        b = gg(b, c, d, a, wordArray[i + 12], 20, 0x8D2A4C8A);

        a = hh(a, b, c, d, wordArray[i + 5], 4, 0xFFFA3942);
        d = hh(d, a, b, c, wordArray[i + 8], 11, 0x8771F681);
        c = hh(c, d, a, b, wordArray[i + 11], 16, 0x6D9D6122);
        b = hh(b, c, d, a, wordArray[i + 14], 23, 0xFDE5380C);
        a = hh(a, b, c, d, wordArray[i + 1], 4, 0xA4BEEA44);
        d = hh(d, a, b, c, wordArray[i + 4], 11, 0x4BDECFA9);
        c = hh(c, d, a, b, wordArray[i + 7], 16, 0xF6BB4B60);
        b = hh(b, c, d, a, wordArray[i + 10], 23, 0xBEBFBC70);
        a = hh(a, b, c, d, wordArray[i + 13], 4, 0x289B7EC6);
        d = hh(d, a, b, c, wordArray[i + 0], 11, 0xEAA127FA);
        c = hh(c, d, a, b, wordArray[i + 3], 16, 0xD4EF3085);
        b = hh(b, c, d, a, wordArray[i + 6], 23, 0x04881D05);
        a = hh(a, b, c, d, wordArray[i + 9], 4, 0xD9D4D039);
        d = hh(d, a, b, c, wordArray[i + 12], 11, 0xE6DB99E5);
        c = hh(c, d, a, b, wordArray[i + 15], 16, 0x1FA27CF8);
        b = hh(b, c, d, a, wordArray[i + 2], 23, 0xC4AC5665);

        a = ii(a, b, c, d, wordArray[i + 0], 6, 0xF4292244);
        d = ii(d, a, b, c, wordArray[i + 7], 10, 0x432AFF97);
        c = ii(c, d, a, b, wordArray[i + 14], 15, 0xAB9423A7);
        b = ii(b, c, d, a, wordArray[i + 5], 21, 0xFC93A039);
        a = ii(a, b, c, d, wordArray[i + 12], 6, 0x655B59C3);
        d = ii(d, a, b, c, wordArray[i + 3], 10, 0x8F0CCC92);
        c = ii(c, d, a, b, wordArray[i + 10], 15, 0xFFEFF47D);
        b = ii(b, c, d, a, wordArray[i + 1], 21, 0x85845DD1);
        a = ii(a, b, c, d, wordArray[i + 8], 6, 0x6FA87E4F);
        d = ii(d, a, b, c, wordArray[i + 15], 10, 0xFE2CE6E0);
        c = ii(c, d, a, b, wordArray[i + 6], 15, 0xA3014314);
        b = ii(b, c, d, a, wordArray[i + 13], 21, 0x4E0811A1);
        a = ii(a, b, c, d, wordArray[i + 4], 6, 0xF7537E82);
        d = ii(d, a, b, c, wordArray[i + 11], 10, 0xBD3AF235);
        c = ii(c, d, a, b, wordArray[i + 2], 15, 0x2AD7D2BB);
        b = ii(b, c, d, a, wordArray[i + 9], 21, 0xEB86D391);

        a = addUnsigned(a, aa);
        b = addUnsigned(b, bb);
        c = addUnsigned(c, cc);
        d = addUnsigned(d, dd);
    }

    return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}
// Scope Management
let scopeConfig = {
    include: [],
    exclude: [],
    excludeImages: true,
    excludeCSS: true,
    excludeJS: true,
    excludeFonts: true,
    excludeMedia: true
};

// Load scope from localStorage
function loadScope() {
    const saved = localStorage.getItem('burp_lite_scope');
    if (saved) {
        scopeConfig = JSON.parse(saved);
        applyScope();
    }
}

function saveScope() {
    localStorage.setItem('burp_lite_scope', JSON.stringify(scopeConfig));
}

function applyScope() {
    document.getElementById('includeScope').value = scopeConfig.include.join('\n');
    document.getElementById('excludeScope').value = scopeConfig.exclude.join('\n');
    document.getElementById('excludeImages').checked = scopeConfig.excludeImages;
    document.getElementById('excludeCSS').checked = scopeConfig.excludeCSS;
    document.getElementById('excludeJS').checked = scopeConfig.excludeJS;
    document.getElementById('excludeFonts').checked = scopeConfig.excludeFonts;
    document.getElementById('excludeMedia').checked = scopeConfig.excludeMedia;
}

function matchesPattern(str, pattern) {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
        .replace(/\*/g, '.*');  // Convert * to .*

    const regex = new RegExp('^' + regexPattern + '$', 'i');
    return regex.test(str);
}

function isInScope(url) {
    try {
        const urlObj = new URL(url);
        const host = urlObj.hostname;
        const path = urlObj.pathname;

        // Check file extensions
        const fileExcludeRules = [];
        if (scopeConfig.excludeImages) {
            fileExcludeRules.push(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i);
        }
        if (scopeConfig.excludeCSS) {
            fileExcludeRules.push(/\.css$/i);
        }
        if (scopeConfig.excludeJS) {
            fileExcludeRules.push(/\.js$/i);
        }
        if (scopeConfig.excludeFonts) {
            fileExcludeRules.push(/\.(woff|woff2|ttf|eot)$/i);
        }
        if (scopeConfig.excludeMedia) {
            fileExcludeRules.push(/\.(mp4|mp3|avi|mov|webm)$/i);
        }

        for (const rule of fileExcludeRules) {
            if (rule.test(path)) {
                return false;
            }
        }

        // Check exclude patterns
        for (const pattern of scopeConfig.exclude) {
            if (pattern.trim() && matchesPattern(host, pattern.trim())) {
                return false;
            }
        }

        // Check include patterns (if any)
        if (scopeConfig.include.length > 0) {
            let included = false;
            for (const pattern of scopeConfig.include) {
                if (pattern.trim() && matchesPattern(host, pattern.trim())) {
                    included = true;
                    break;
                }
            }
            return included;
        }

        // If no include patterns, include by default
        return true;
    } catch (e) {
        return true;  // If URL parsing fails, include by default
    }
}

// Modal controls
document.getElementById('scopeSettings').addEventListener('click', () => {
    document.getElementById('scopeModal').classList.add('show');
});

document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('scopeModal').classList.remove('show');
});

document.getElementById('scopeModal').addEventListener('click', (e) => {
    if (e.target.id === 'scopeModal') {
        document.getElementById('scopeModal').classList.remove('show');
    }
});

document.getElementById('saveScope').addEventListener('click', () => {
    scopeConfig.include = document.getElementById('includeScope').value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    scopeConfig.exclude = document.getElementById('excludeScope').value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    scopeConfig.excludeImages = document.getElementById('excludeImages').checked;
    scopeConfig.excludeCSS = document.getElementById('excludeCSS').checked;
    scopeConfig.excludeJS = document.getElementById('excludeJS').checked;
    scopeConfig.excludeFonts = document.getElementById('excludeFonts').checked;
    scopeConfig.excludeMedia = document.getElementById('excludeMedia').checked;

    saveScope();
    document.getElementById('scopeModal').classList.remove('show');

    console.log('[SCOPE] Saved:', scopeConfig);
});

document.getElementById('clearScope').addEventListener('click', () => {
    scopeConfig = {
        include: [],
        exclude: [],
        excludeImages: true,
        excludeCSS: true,
        excludeJS: true,
        excludeFonts: true,
        excludeMedia: true
    };
    applyScope();
    saveScope();
});

// Preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;

        if (preset === 'htb') {
            document.getElementById('includeScope').value = '*.htb\n10.10.10.*\n10.10.11.*';
            document.getElementById('excludeScope').value = '';
        } else if (preset === 'local') {
            document.getElementById('includeScope').value = '192.168.*.*\n10.*.*.*\n172.16.*.*';
            document.getElementById('excludeScope').value = '';
        } else if (preset === 'all') {
            document.getElementById('includeScope').value = '';
            document.getElementById('excludeScope').value = '';
        }
    });
});

// Update handleWebSocketMessage to filter by scope
const originalHandleWebSocketMessage = handleWebSocketMessage;
function handleWebSocketMessage(data) {
    if (data.type === 'intercepted') {
        // Check scope before adding
        if (!isInScope(data.data.url)) {
            console.log('[SCOPE] Filtered out:', data.data.url);
            return;
        }
    }

    // Call original handler
    if (data.type === 'intercepted') {
        interceptQueue.push(data.data);
        renderInterceptQueue();
    } else if (data.type === 'intercept_status') {
        interceptEnabled = data.enabled;
        updateInterceptButton();
    } else if (data.type === 'removed') {
        interceptQueue = interceptQueue.filter(r => r.id !== data.id);
        renderInterceptQueue();
        if (currentRequest && currentRequest.id === data.id) {
            currentRequest = null;
            document.getElementById('interceptRequest').value = '';
        }
    }
}

// Load scope on startup
loadScope();

// Intruder functionality
let intruderRunning = false;
let intruderResults = [];
let currentAttackIndex = 0;

document.getElementById('loadWordlist').addEventListener('click', () => {
    document.getElementById('wordlistFile').click();
});

document.getElementById('wordlistFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('payloadList').value = event.target.result;
            updatePayloadCount();
        };
        reader.readAsText(file);
    }
});

document.getElementById('payloadList').addEventListener('input', updatePayloadCount);

function updatePayloadCount() {
    const payloads = getPayloads();
    document.getElementById('payloadCount').textContent = `${payloads.length} payloads loaded`;
}

function getPayloads() {
    return document.getElementById('payloadList').value
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

function findInjectionPoints(template) {
    const regex = /§([^§]+)§/g;
    const points = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
        points.push({
            placeholder: match[0],
            value: match[1],
            index: match.index
        });
    }

    return points;
}

document.getElementById('startAttack').addEventListener('click', async () => {
    const template = document.getElementById('intruderRequest').value;
    const payloads = getPayloads();
    const attackType = document.getElementById('attackType').value;

    if (!template.includes('§')) {
        alert('Please mark at least one injection point with §...§');
        return;
    }

    if (payloads.length === 0) {
        alert('Please add some payloads!');
        return;
    }

    // Clear previous results
    intruderResults = [];
    currentAttackIndex = 0;
    document.getElementById('intruderResults').innerHTML = '';

    // Start attack
    intruderRunning = true;
    document.getElementById('startAttack').style.display = 'none';
    document.getElementById('stopAttack').style.display = 'block';
    document.getElementById('intruderStats').classList.add('running');

    const injectionPoints = findInjectionPoints(template);

    for (let i = 0; i < payloads.length && intruderRunning; i++) {
        currentAttackIndex = i + 1;
        updateIntruderStats(currentAttackIndex, payloads.length);

        let modifiedRequest = template;

        if (attackType === 'sniper') {
            // Sniper: only replace first injection point
            modifiedRequest = template.replace(injectionPoints[0].placeholder, payloads[i]);
        } else {
            // Battering ram: replace all injection points with same payload
            injectionPoints.forEach(point => {
                modifiedRequest = modifiedRequest.replace(point.placeholder, payloads[i]);
            });
        }

        await sendIntruderRequest(modifiedRequest, payloads[i], i + 1);

        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    stopIntruder();
});

document.getElementById('stopAttack').addEventListener('click', stopIntruder);

function stopIntruder() {
    intruderRunning = false;
    document.getElementById('startAttack').style.display = 'block';
    document.getElementById('stopAttack').style.display = 'none';
    document.getElementById('intruderStats').classList.remove('running');
    updateIntruderStats(currentAttackIndex, getPayloads().length, true);
}

function updateIntruderStats(current, total, complete = false) {
    const stats = document.getElementById('intruderStats');
    if (complete) {
        stats.textContent = `Complete: ${current}/${total} requests`;
    } else {
        stats.textContent = `Running: ${current}/${total} requests`;
    }
}

async function sendIntruderRequest(requestText, payload, index) {
    const startTime = performance.now();

    try {
        const parsed = parseRequest(requestText);

        const response = await fetch('/api/repeater/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed)
        });

        const data = await response.json();
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        const result = {
            index,
            payload,
            status: data.status_code || 'Error',
            length: data.body ? data.body.length : 0,
            time: duration,
            response: data
        };

        intruderResults.push(result);
        addIntruderResult(result);
    } catch (error) {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        const result = {
            index,
            payload,
            status: 'Error',
            length: 0,
            time: duration,
            error: error.message
        };

        intruderResults.push(result);
        addIntruderResult(result);
    }
}

function addIntruderResult(result) {
    const tbody = document.getElementById('intruderResults');

    // Remove empty state if present
    const emptyState = tbody.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const statusClass = result.status >= 200 && result.status < 300 ? 'status-2xx' :
        result.status >= 300 && result.status < 400 ? 'status-3xx' :
            result.status >= 400 && result.status < 500 ? 'status-4xx' :
                result.status >= 500 ? 'status-5xx' : '';

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${result.index}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(result.payload)}">${escapeHtml(result.payload)}</td>
        <td><span class="status-badge ${statusClass}">${result.status}</span></td>
        <td>${result.length.toLocaleString()}</td>
        <td>${result.time}</td>
        <td><button class="view-response-btn" onclick="viewIntruderResponse(${result.index - 1})">View</button></td>
    `;

    tbody.appendChild(row);

    // Auto-scroll to bottom
    tbody.parentElement.scrollTop = tbody.parentElement.scrollHeight;
}

function viewIntruderResponse(index) {
    const result = intruderResults[index];
    const modal = document.getElementById('intruderResponseModal');
    const content = document.getElementById('intruderResponseContent');

    let responseText = `Payload: ${result.payload}\n`;
    responseText += `Status: ${result.status}\n`;
    responseText += `Length: ${result.length} bytes\n`;
    responseText += `Time: ${result.time}ms\n\n`;
    responseText += `--- Response Body ---\n`;
    responseText += result.response.body || result.error || 'No response body';

    content.textContent = responseText;
    modal.classList.add('show');
}

document.querySelector('.close-intruder-modal').addEventListener('click', () => {
    document.getElementById('intruderResponseModal').classList.remove('show');
});

document.getElementById('intruderResponseModal').addEventListener('click', (e) => {
    if (e.target.id === 'intruderResponseModal') {
        document.getElementById('intruderResponseModal').classList.remove('show');
    }
});

// Initialize
connectWebSocket();