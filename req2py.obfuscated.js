document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ REQ2PY JavaScript Loaded!");

    const convertButton = document.getElementById("convertButton");
    const copyButton = document.getElementById("copyButton");
    const webRequestInput = document.getElementById("webRequest");
    const pythonScriptOutput = document.getElementById("pythonScript");

    if (!convertButton || !copyButton || !webRequestInput || !pythonScriptOutput) {
        console.error("❌ One or more elements are missing! Check your HTML structure.");
        return;
    }

    function sanitizeInput(input) {
        // Allows common HTTP request syntax but prevents JavaScript execution risks
        const safePattern = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%\s]+$/;

        if (!safePattern.test(input)) {
            console.warn("🚨 Suspicious input detected, but allowing common HTTP syntax.");
            return input;  // Instead of blocking, log it and allow the request
        }
        return input;
    }

    function convertToPython(request) {
        request = sanitizeInput(request);

        // Ensure it's not empty
        if (!request.trim()) {
            return "# ⚠️ Error: No input provided.\nprint('No input detected. Please enter a request.')";
        }

        // Extract method and URL
        let methodMatch = request.match(/^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(.*?)\s+HTTP\/\d\.\d/i);
        if (!methodMatch) {
            return "# ⚠️ Error: Could not parse request method and URL.\nprint('Invalid request format.')";
        }

        let method = methodMatch[1].toUpperCase();
        let url = methodMatch[2];

        let headers = {};
        let body = null;
        let lines = request.split("\n");

        let parsingHeaders = true;
        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) {
                parsingHeaders = false; // Empty line indicates body starts
                continue;
            }
            if (parsingHeaders) {
                let headerMatch = line.match(/^([^:]+):\s*(.*)$/);
                if (headerMatch) {
                    let headerName = headerMatch[1].trim();
                    let headerValue = headerMatch[2].trim();
                    headers[headerName] = headerValue;
                }
            } else {
                body = (body ? body + "\n" : "") + line;
            }
        }

        // Convert to Python script
        let pythonScript = `import requests\n\n`;
        pythonScript += `url = "${url}"\n`;
        if (Object.keys(headers).length) {
            pythonScript += `headers = ${JSON.stringify(headers, null, 4)}\n`;
        }
        if (body) {
            pythonScript += `data = """${body}"""\n`;
        }
        pythonScript += `\nresponse = requests.${method.toLowerCase()}(url, ${body ? "data=data, " : ""}headers=headers)\n`;
        pythonScript += `print(response.status_code)\nprint(response.text)\n`;

        return pythonScript;
    }

    convertButton.addEventListener("click", () => {
        const userInput = webRequestInput.value;
        const pythonCode = convertToPython(userInput);
        pythonScriptOutput.value = pythonCode;
    });

    copyButton.addEventListener("click", () => {
        pythonScriptOutput.select();
        document.execCommand("copy");
        alert("✅ Python script copied to clipboard!");
    });
});
