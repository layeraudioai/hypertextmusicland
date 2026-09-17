import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dist = 'dist';
const assets = join(dist, 'assets');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Robust removal of link and script tags
// Remove all <link rel="stylesheet" ...>
html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
// Remove all <script ... src="..." ...></script> (Handles multi-line tags)
html = html.replace(/<script[\s\S]*?src=["'][^"']*["'][\s\S]*?>[\s\S]*?<\/script>/gi, '');

// Find CSS/JS files
const files = readdirSync(assets);
const cssFile = files.find(f => f.endsWith('.css'));
const jsFile = files.find(f => f.endsWith('.js'));

if (cssFile) {
    const cssContent = readFileSync(join(assets, cssFile), 'utf8');
    // Escape </style> to prevent premature closing
    const escapedCss = cssContent.replace(/<\/style>/gi, '<\\/style>');
    html = html.replace('</head>', `<style>${escapedCss}</style></head>`);
}

if (jsFile) {
    const jsContent = readFileSync(join(assets, jsFile), 'utf8');
    // Escape </script> to prevent premature closing
    const escapedJs = jsContent.replace(/<\/script>/gi, '<\\/script>');
    // Ensure the script is placed before </body>
    if (html.includes('</body>')) {
        html = html.replace('</body>', `<script>${escapedJs}</script></body>`);
    } else {
        html += `<script>${escapedJs}</script>`;
    }
}

writeFileSync(join(dist, 'index.html'), html);
console.log('Successfully inlined assets into dist/index.html');
