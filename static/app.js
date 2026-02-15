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
        interceptQueue = interceptQueue.filter(r => r.id !== currentRequest.id);
        renderInterceptQueue();
        currentRequest = null;
        document.getElementById('interceptRequest').value = '';
    }
});

document.getElementById('dropBtn').addEventListener('click', () => {
    if (currentRequest) {
        ws.send(JSON.stringify({
            type: 'drop',
            id: currentRequest.id
        }));
        interceptQueue = interceptQueue.filter(r => r.id !== currentRequest.id);
        renderInterceptQueue();
        currentRequest = null;
        document.getElementById('interceptRequest').value = '';
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
    let scheme = 'http';  // Default to http

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
        // Full URL in request line (proxy-style request)
        const url = path;
        scheme = url.startsWith('https://') ? 'https' : 'http';
        return { method, url, headers, body: body.trim() };
    }

    // Otherwise construct URL from Host header
    const url = `${scheme}://${host}${path}`;
    return { method, url, headers, body: body.trim() };
}

function displayResponse(data) {
    if (data.error) {
        document.getElementById('responseStatus').innerHTML = `<span style="color:#e81123">Error: ${data.error}</span>`;
        return;
    }

    document.getElementById('responseStatus').innerHTML = `Status: <strong>${data.status_code}</strong>`;

    let responseText = 'HTTP/1.1 ' + data.status_code + '\n';
    for (const [key, value] of Object.entries(data.headers)) {
        responseText += `${key}: ${value}\n`;
    }
    responseText += '\n' + data.body;

    document.getElementById('repeaterResponse').value = responseText;
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