const usernameKeychainKey = "hoh_helper_mobile_username";
const passwordKeychainKey = "hoh_helper_mobile_password";
const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';
const JSON_CONTENT_TYPE = 'application/json';
const loginUrl = "https://www.heroesgame.com/api/login";
const accountPlayUrl = "https://un0.heroesofhistorygame.com/core/api/account/play";
const startupApiUrl = "https://un1.heroesofhistorygame.com/game/startup";

async function login() {
    const username = Keychain.get(usernameKeychainKey)
    const password = Keychain.get(passwordKeychainKey)
    const loginPayload = {
        username,
        password,
        useRememberMe: false
    };

    const loginReq = new Request(loginUrl);
    loginReq.method = "POST";
    loginReq.headers = addLoginHeaders();
    loginReq.body = JSON.stringify(loginPayload);

    const loginData = await loginReq.loadJSON();

    const redirectReq = new Request(loginData.redirectUrl);
    redirectReq.method = "GET";
    const redirectHtml = await redirectReq.loadString();
    let sessionCookie = redirectReq.response.cookies.find(c => c.name === "SESSION");
    let cookieHeader = sessionCookie ? "SESSION=" + sessionCookie.value : "";
    if (cookieHeader === "") {
        throw new Error("SESSION cookie not found.");
    }
    const clientVersionMatch = redirectHtml.match(/const\s+clientVersion\s*=\s*"([^"]+)"/);

    if (!clientVersionMatch) {
        throw new Error("Client version not found.");
    }

    const clientVersion = clientVersionMatch[1];

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

    const playReq = new Request(accountPlayUrl);
    playReq.method = "POST";
    playReq.headers = {
        "Content-Type": JSON_CONTENT_TYPE,
        "Cookie": cookieHeader
    };
    playReq.body = JSON.stringify(playPayload);

    return await playReq.loadJSON();
}

function addStartupHeaders(sessionData) {
    const headers = {};
    headers['X-AUTH-TOKEN'] = sessionData.sessionId;
    headers['X-Request-Id'] = UUID.string();
    headers['X-Platform'] = 'browser';
    headers['X-ClientVersion'] = sessionData.clientVersion;
    headers['Accept-Encoding'] = 'gzip';
    headers['Accept'] = PROTOBUF_CONTENT_TYPE;
    headers['Content-Type'] = PROTOBUF_CONTENT_TYPE;
    headers['X-Action-At'] = new Date().toISOString();
    return headers;
}

function addDefaultHeaders() {
    const headers = {};
    headers['Content-Type'] = JSON_CONTENT_TYPE;
    return headers;
}

function addLoginHeaders() {
    const headers = {};
    headers['Content-Type'] = JSON_CONTENT_TYPE;
    headers['Cookie'] = "hoh-helper-mobile";
    return headers;
}

async function getStartupAsync(sessionData) {
    const req = new Request(startupApiUrl);
    req.method = "POST";
    req.headers = addStartupHeaders(sessionData);
    const response = await req.load();
    return response; // Return raw Data object instead of base64 string
}

async function saveStartupDataToFiles(startupData) {
    try {
        // Create a filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `hoh_startup_data_${timestamp}.bin`;

        // Get the Documents directory path in iCloud Drive/Scriptable
        const documentsPath = FileManager.iCloud().documentsDirectory();
        const filePath = FileManager.iCloud().joinPath(documentsPath, filename);

        // Write the raw binary data to file
        FileManager.iCloud().write(filePath, startupData);

        console.log(`Data saved to: ${filename}`);

        // Show success alert with file location
        let alert = new Alert();
        alert.title = "Data Saved Successfully";
        alert.message = `Binary data saved to Files app:\nScriptable/${filename}`;
        alert.addAction("OK");
        await alert.present();

        return true;
    } catch (error) {
        console.error("Error saving file:", error);

        let alert = new Alert();
        alert.title = "Save Error";
        alert.message = `Failed to save data: ${error.message}`;
        alert.addAction("OK");
        await alert.present();

        return false;
    }
}

function checkCredentials() {
    return Keychain.contains(usernameKeychainKey) && Keychain.contains(passwordKeychainKey);
}

async function setupCredentials() {
    let prompt = new Alert()
    prompt.message = "Enter your in-game credentials."
    prompt.addTextField("Username")
    prompt.addSecureTextField("Password")
    prompt.addAction("Save")
    prompt.addCancelAction("Cancel")
    const action = await prompt.present()

    let username = prompt.textFieldValue(0)
    let password = prompt.textFieldValue(1)

    if (action === 0) {
        Keychain.set(usernameKeychainKey, username)
        Keychain.set(passwordKeychainKey, password)
    }

    return action;
}

async function pickAction() {
    let prompt = new Alert()
    prompt.message = "Do you want to run the script or delete login credentials?"
    prompt.addAction("Run")
    prompt.addDestructiveAction("Delete credentials")
    prompt.addCancelAction("Cancel")
    return await prompt.present()
}

async function deleteCredentials() {
    Keychain.remove(usernameKeychainKey)
    Keychain.remove(passwordKeychainKey)
}

async function main() {
    if (!checkCredentials()) {
        const setupCredentialsAction = await setupCredentials()

        if (setupCredentialsAction !== 0) {
            return;
        }
        if (!checkCredentials()) {
            let alert = new Alert()
            alert.title = "Credentials not set."
            alert.message = "You must provide your in-game login credentials. Restart the script to proceed."
            alert.addAction("OK")
            await alert.present()
            return;
        }
    } else {
        const action = await pickAction();
        if (action === 1) {
            await deleteCredentials();
            return;
        } else if (action === 2) {
            return;
        }
    }

    try {
        const sessionData = await login();
        if (!sessionData) return;
        console.log("Session data received");

        const startupData = await getStartupAsync(sessionData);
        if (!startupData) return;
        console.log("Startup data received");

        const saveSuccess = await saveStartupDataToFiles(startupData);
        if (saveSuccess) {
            console.log("Data successfully saved to Files");
        }
    } catch (error) {
        console.error("Error in main execution:", error);

        let alert = new Alert();
        alert.title = "Script Error";
        alert.message = `An error occurred: ${error.message}`;
        alert.addAction("OK");
        await alert.present();
    }
}

await main();