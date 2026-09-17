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
if (jsFile) {
    const jsContent = readFileSync(join(assets, jsFile));
    // Escape </script> to prevent premature closing
    const escapedJs = jsContent.replace(/<\/script>/gi, '<\\/script>');
    html = html.replace('</body>', `</body><script>${escapedJs}</script>`);
}

if (cssFile) {
    const cssContent = readFileSync(join(assets, cssFile));
    // Escape </style> to prevent premature closing
    const escapedCss = cssContent.replace(/<\/style>/gi, '<\\/style>');
    html = html.replace('</script>', `<style>${escapedCss}</style>`);
}

writeFileSync(join(dist, 'index.html'), html);
console.log('Successfully inlined assets into dist/index.html');
