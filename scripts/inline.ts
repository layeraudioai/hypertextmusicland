import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dist = 'dist';
const assets = join(dist, 'assets');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Robust removal of link and script tags
// Remove all <link rel="stylesheet" ...>
html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
// Remove all <script ... src="..." ...></script>
html = html.replace(/<script[^>]*src=[^>]*><\/script>/gi, '');

// Find CSS/JS files
const files = readdirSync(assets);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFile = files.find(f => f.endsWith('.js'));

if (cssFile) {
    const cssContent = readFileSync(join(assets, cssFile), 'utf8');
    html = html.replace('</body>', `</body><style>${cssContent}</style>`);
}

if (jsFile) {
    const jsContent = readFileSync(join(assets, jsFile), 'utf8');
    // Ensure the script is placed before </body> or </html>
    html = html.replace('</style>', `</style><script>${jsContent}</script>`);
}

writeFileSync(join(dist, 'index.html'), html);
console.log('Successfully inlined assets into dist/index.html');
