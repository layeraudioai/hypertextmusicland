import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dist = 'dist';
const assets = join(dist, 'assets');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Remove script tags with src
html = html.replace(/<script.*?rel="stylesheet".*?>/g, '');

// Remove link tags for stylesheets
html = html.replace(/<link.*?rel="stylesheet".*?>/g, '');

// Find CSS/JS files
const files = readdirSync(assets);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFile = files.find(f => f.endsWith('.js'));

if (cssFile) {
    const cssContent = readFileSync(join(assets, cssFile), 'utf8');
    html = html.replace('</head>', `<style>${cssContent}</style></head>`);
}

if (jsFile) {
    const jsContent = readFileSync(join(assets, jsFile), 'utf8');
    // Ensure the script is placed before </body> or </html>
    html = html.replace('</body>', `<script>${jsContent}</script></body>`);
}

writeFileSync(join(dist, 'index.html'), html);
console.log('Successfully inlined assets into dist/index.html');
