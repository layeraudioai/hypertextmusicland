const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const { app, BrowserWindow } = require2("electron");
const path = require2("path");
function createWindow() {
    const win = new BrowserWindow({
        width: 66666,
        height: 42000,
        webPreferences: {
            preload: path.join(__dirname, "../preload/preload.js")
        }
    });
    win.loadFile("../../dist/index.html");
}
app.whenReady().then(createWindow);
