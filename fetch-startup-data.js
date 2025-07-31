const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');

// Credentials - replace with your actual credentials
const username = "";
const password = "";

const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';
const JSON_CONTENT_TYPE = 'application/json';
const loginUrl = "https://beta.heroesgame.com/api/login";
const accountPlayUrl = "https://zz0.heroesofhistorygame.com/core/api/account/play";
const startupApiUrl = "https://zz1.heroesofhistorygame.com/game/startup";
const fogInGameDataUrl = "https://forgeofgames.com/api/hoh/inGameData";

// Import fetch for Node.js versions that don't have it built-in
const fetch = globalThis.fetch || require('node-fetch');

function generateUUID() {
    return crypto.randomUUID();
}

function addStartupHeaders(sessionData, cookies) {
    const headers = {};
    headers['X-AUTH-TOKEN'] = sessionData.sessionId;
    headers['X-Request-Id'] = generateUUID();
    headers['X-Platform'] = 'browser';
    headers['X-ClientVersion'] = sessionData.clientVersion;
    headers['Accept-Encoding'] = 'gzip';
    headers['Accept'] = PROTOBUF_CONTENT_TYPE;
    headers['Content-Type'] = PROTOBUF_CONTENT_TYPE;
    headers['Cookie'] = cookies;
    return headers;
}

function addDefaultHeaders() {
    const headers = {};
    headers['Content-Type'] = JSON_CONTENT_TYPE;
    return headers;
}

async function login() {
    try {
        console.log("Attempting login...");

        // Step 1: Send login request
        const loginPayload = {
            username,
            password,
            useRememberMe: false
        };

        const loginResponse = await fetch(loginUrl, {
            method: "POST",
            credentials: 'include',
            redirect: 'follow',
            headers: {
                "Accept": "*/*",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(loginPayload)
        });

        if (!loginResponse.ok) {
            throw new Error("Login failed");
        }

        const loginData = await loginResponse.json();
        const redirectUrl = loginData.redirectUrl;
        console.log("Login successful, processing redirect...");

        // Step 2: Fetch redirected page to extract clientVersion
        const rrr = await fetch(redirectUrl, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'include'
        });

        console.log('Redirect Status:', rrr.status);
        console.log('Redirect Location:', rrr.headers.get('Location'));

        // Extract cookies from the redirect response
        const setCookie = rrr.headers.get('set-cookie');
        const newCookies = setCookie ? setCookie.split(',').map(c => c.split(';')[0]).join('; ') : '';

        // Follow the redirect to get the page with clientVersion
        const r2 = await fetch(rrr.headers.get('location'), {
            method: 'GET',
            redirect: 'manual',
            credentials: 'include',
            headers: { 'Cookie': newCookies },
        }).then(res => res.text());

        const clientVersionMatch = r2.match(/const\s+clientVersion\s*=\s*"([^"]+)"/);

        if (!clientVersionMatch) {
            throw new Error("Client version not found in redirected page");
        }

        const clientVersion = clientVersionMatch[1];
        console.log("Found client version:", clientVersion);

        // Step 3: Request play session
        const playPayload = {
            createDeviceToken: false,
            meta: {
                clientVersion,
                device: "browser",
                deviceHardware: "browser",
                deviceManufacturer: "none",
                deviceName: "browser",
                locale: "en_DK",
                networkType: "wlan",
                operatingSystemName: "browser",
                operatingSystemVersion: "1",
                userAgent: "hoh-helper-mobile"
            },
            network: "BROWSER_SESSION",
            token: "",
            worldId: null
        };

        const playResponse = await fetch(accountPlayUrl, {
            method: "POST",
            headers: {"Content-Type": "application/json", 'Cookie': newCookies},
            body: JSON.stringify(playPayload)
        });

        if (!playResponse.ok) {
            throw new Error("Failed to get session data");
        }

        const sessionData = await playResponse.json();

        // Add clientVersion to sessionData for later use
        sessionData.clientVersion = clientVersion;

        console.log("Session ID:", sessionData.sessionId);
        console.log("Game ID:", sessionData.gameId);
        console.log("World ID:", sessionData.worldId);

        return { sessionData, cookies: newCookies };
    } catch (error) {
        console.error("Login process failed:", error);
        throw error;
    }
}

async function getStartupAsync(sessionData, cookies) {
    console.log("Getting startup data...");

    const response = await fetch(startupApiUrl, {
        method: "POST",
        headers: addStartupHeaders(sessionData, cookies)
    });

    if (!response.ok) {
        throw new Error(`Startup request failed with status: ${response.status}`);
    }

    // Convert the response to base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
}

async function sendStartupAsync(startupData) {
    const payload = {
        inGameStartupData: startupData
    };

    console.log("Sending startup data to fog...");
    const response = await fetch(fogInGameDataUrl, {
        method: "POST",
        headers: addDefaultHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Fog request failed with status: ${response.status}`);
    }

    return await response.json();
}

function openUrl(url) {
    console.log(`Opening URL: ${url}`);

    const platform = os.platform();
    let command;

    switch (platform) {
        case 'darwin': // macOS
            command = `open "${url}"`;
            break;
        case 'win32': // Windows
            command = `start "" "${url}"`;
            break;
        default: // Linux and others
            command = `xdg-open "${url}"`;
            break;
    }

    try {
        execSync(command);
    } catch (error) {
        console.error('Failed to open URL automatically:', error.message);
        console.log('Please open this URL manually:', url);
    }
}

async function main() {
    try {
        if (!username || !password || username === "your_username_here" || password === "your_password_here") {
            console.error("Please set your username and password in the script before running.");
            return;
        }

        // Login and get session data with cookies
        const { sessionData, cookies } = await login();
        if (!sessionData) return;
        console.log("Session data received");

        // Get startup data
        const startupData = await getStartupAsync(sessionData, cookies);
        if (!startupData) return;
        console.log("Startup data received");

        // Send to fog API
        const fogResponse = await sendStartupAsync(startupData);
        if (fogResponse?.webResourceUrl) {
            console.log("Fog data received");
            openUrl(fogResponse.webResourceUrl);
        } else {
            console.log("No web resource URL received");
            console.log("Fog response:", fogResponse);
        }
    } catch (error) {
        console.error("Error running script:", error.message);
    }
}

main();