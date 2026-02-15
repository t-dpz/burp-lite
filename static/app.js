let ws;
let interceptEnabled = false;
let currentRequest = null;
let interceptQueue = [];

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
        interceptQueue.push(data.data);
        renderInterceptQueue();
    } else if (data.type === 'intercept_status') {
        interceptEnabled = data.enabled;
        updateInterceptButton();
    } else if (data.type === 'removed') {
        // Remove from local queue
        interceptQueue = interceptQueue.filter(r => r.id !== data.id);
        renderInterceptQueue();
        if (currentRequest && currentRequest.id === data.id) {
            currentRequest = null;
            document.getElementById('interceptRequest').value = '';
        }
    }
}

// UI Functions
function renderInterceptQueue() {
    const queue = document.getElementById('interceptQueue');
    queue.innerHTML = interceptQueue.map((req, idx) => `
        <div class="request-item" onclick="selectRequest(${idx})">
            <strong>${req.method}</strong> ${req.url}
            <div style="font-size:0.8em;color:#858585">${req.timestamp}</div>
        </div>
    `).join('');
}

function selectRequest(idx) {
    currentRequest = interceptQueue[idx];
    const requestText = formatRequest(currentRequest);
    document.getElementById('interceptRequest').value = requestText;

    document.querySelectorAll('.request-item').forEach((item, i) => {
        item.classList.toggle('selected', i === idx);
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
        // Don't remove from queue anymore - just deselect
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
        // Don't remove from queue anymore - just deselect
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

// Initialize
connectWebSocket();