/**
 * REQ2PY - Convert raw HTTP requests or cURL commands to Python scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  const convertBtn = document.getElementById('convertButton');
  const copyBtn    = document.getElementById('copyButton');
  const inputArea  = document.getElementById('webRequest');
  const outputArea = document.getElementById('pythonScript');

  if (!convertBtn || !copyBtn || !inputArea || !outputArea) {
    console.error('❌ One or more elements are missing! Check your HTML structure.');
    return;
  }

  const codeOutput = document.getElementById('codeOutput');

  convertBtn.addEventListener('click', () => {
    const result = convert(inputArea.value);
    outputArea.value = result;
    if (codeOutput) {
      codeOutput.textContent = result;
      if (window.hljs) hljs.highlightElement(codeOutput);
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = outputArea.value;
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => alert('✅ Python script copied to clipboard!'))
      .catch(() => {
        outputArea.select();
        document.execCommand('copy');
        alert('✅ Python script copied to clipboard!');
      });
  });
});

/**
 * Sanitize input - strip script tags and event handlers
 */
function sanitize(input) {
  return input
    .replace(/<script.*?>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=["'].*?["']/gi, '');
}

/**
 * Main entry point - detects format and routes accordingly
 */
function convert(raw) {
  raw = sanitize(raw);
  if (!raw.trim()) {
    return "# ⚠️ Error: No input provided.\nprint('No input detected. Please enter a request.')";
  }

  if (raw.trimStart().startsWith('curl')) {
    return convertCurl(raw);
  }
  return convertHttpRequest(raw);
}

/**
 * Parse a raw HTTP request (Burp Suite format)
 */
function convertHttpRequest(raw) {
  const firstLineMatch = raw.match(/^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(.*?)\s+HTTP\/\d/i);
  if (!firstLineMatch) {
    return "# ⚠️ Error: Could not parse request method and URL.\nprint('Invalid request format.')";
  }

  const method  = firstLineMatch[1].toUpperCase();
  let   path    = firstLineMatch[2];
  const headers = {};
  const cookies = {};
  let   body    = null;
  let   host    = '';

  const lines = raw.split('\n');
  let inBody = false;
  const bodyLines = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (!inBody && line.trim() === '') {
      inBody = true;
      continue;
    }

    if (inBody) {
      bodyLines.push(line);
      continue;
    }

    // Parse header line
    const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (!headerMatch) continue;

    const name  = headerMatch[1].trim();
    const value = headerMatch[2].trim();
    const lower = name.toLowerCase();

    if (lower === 'host') {
      host = value;
    } else if (lower === 'cookie') {
      // Parse cookies - handle values that contain '='
      value.split(/;\s*/).forEach(pair => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) return;
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        if (k) {
          try { cookies[k] = decodeURIComponent(v); }
          catch { cookies[k] = v; }
        }
      });
    } else {
      headers[name] = value;
    }
  }

  if (bodyLines.length > 0) {
    body = bodyLines.join('\n').trim() || null;
  }

  // Build full URL
  let url;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    url = path;
  } else if (host) {
    // Infer scheme: use https unless host explicitly says http
    const scheme = host.startsWith('http://') ? '' : 'https://';
    url = scheme + host + path;
  } else {
    return "# ⚠️ Error: No Host header found for relative URL.\nprint('Invalid request format.')";
  }

  return buildPythonScript(method, url, headers, cookies, body);
}

/**
 * Parse a cURL command
 */
function convertCurl(raw) {
  // Normalize line continuations
  const cmd = raw.replace(/\\\n/g, ' ').replace(/\s+/g, ' ').trim();

  const method  = (cmd.match(/-X\s+([A-Z]+)/i) || [])[1]?.toUpperCase() || 'GET';
  const urlMatch = cmd.match(/curl\s+(?:[^\s]+\s+)*['"]?(https?:\/\/[^\s'"]+)['"]?/i);
  if (!urlMatch) {
    return "# ⚠️ Error: Could not parse URL from cURL command.\nprint('Invalid cURL format.')";
  }
  const url = urlMatch[1];

  const headers = {};
  const cookies = {};
  let   body    = null;

  // Extract headers: -H "Name: Value"
  const headerRe = /-H\s+['"]([^'"]+)['"]/g;
  let hm;
  while ((hm = headerRe.exec(cmd)) !== null) {
    const eqIdx = hm[1].indexOf(':');
    if (eqIdx === -1) continue;
    const name  = hm[1].slice(0, eqIdx).trim();
    const value = hm[1].slice(eqIdx + 1).trim();
    if (name.toLowerCase() === 'cookie') {
      value.split(/;\s*/).forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (k) {
          try { cookies[k] = decodeURIComponent(v); }
          catch { cookies[k] = v; }
        }
      });
    } else {
      headers[name] = value;
    }
  }

  // Extract body: -d or --data
  // Match everything between the outer quotes, handling both ' and "
  const bodyMatch = cmd.match(/(?:-d|--data(?:-raw)?)\s+'([\s\S]*?)'(?:\s|$)/) ||
                    cmd.match(/(?:-d|--data(?:-raw)?)\s+"([\s\S]*?)"(?:\s|$)/);
  if (bodyMatch) {
    body = bodyMatch[1];
  }

  return buildPythonScript(method, url, headers, cookies, body);
}

/**
 * Render the final Python script string
 */
function buildPythonScript(method, url, headers, cookies, body) {
  let out = 'import requests\nimport json\n\n';

  out += `# Target API Endpoint\nurl = "${url}"\n\n`;

  if (Object.keys(headers).length > 0) {
    out += `# Headers\nheaders = ${JSON.stringify(headers, null, 4)}\n\n`;
  } else {
    out += `# Headers\nheaders = {}\n\n`;
  }

  if (Object.keys(cookies).length > 0) {
    out += `# Cookies\ncookies = ${JSON.stringify(cookies, null, 4)}\n\n`;
  }

  if (body) {
    try {
      const parsed = JSON.parse(body);
      out += `# Request Body\npayload = ${JSON.stringify(parsed, null, 4)}\n\n`;
    } catch {
      out += `# Request Body (Raw)\npayload = '''\n${body}\n'''\n\n`;
    }
  }

  const methodLower = method.toLowerCase();
  const hasCookies  = Object.keys(cookies).length > 0;
  const cookiesArg  = hasCookies ? ', cookies=cookies' : '';
  const bodyArg     = body ? ', json=payload' : '';
  out += `# Perform the ${method} request\n`;
  out += `response = requests.${methodLower}(url, headers=headers${cookiesArg}${bodyArg})\n\n`;

  out += `# Print the response status code\n`;
  out += `print(f"\\n[+] Status Code: {response.status_code}\\n")\n\n`;

  out += `# Handle response content dynamically\n`;
  out += `content_type = response.headers.get("Content-Type", "").lower()\n`;
  out += `if "application/json" in content_type:\n`;
  out += `    try:\n`;
  out += `        response_data = response.json()\n`;
  out += `        print(json.dumps(response_data, indent=4, sort_keys=True))\n`;
  out += `    except ValueError:\n`;
  out += `        print("Response is JSON but not formatted correctly:", response.text)\n`;
  out += `elif "text/html" in content_type:\n`;
  out += `    try:\n`;
  out += `        from bs4 import BeautifulSoup\n`;
  out += `        print("\\n[+] HTML Response (Preview):\\n")\n`;
  out += `        soup = BeautifulSoup(response.text, "html.parser")\n`;
  out += `        print(soup.prettify()[:1000])  # Print first 1000 characters for readability\n`;
  out += `    except ImportError:\n`;
  out += `        print("\\n[+] HTML Response (Install BeautifulSoup for better formatting):\\n")\n`;
  out += `        print(response.text[:1000])  # Print first 1000 characters to avoid flooding output\n`;
  out += `else:\n`;
  out += `    print("\\n[+] Raw Response:\\n")\n`;
  out += `    print(response.text[:1000])  # Print first 1000 characters to avoid flooding output\n`;

  return out;
}
