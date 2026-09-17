import os
import re

def inline_assets(html_path):
    if not os.path.isfile(html_path):
        raise FileNotFoundError(f"File not found: {html_path}")

    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    base_dir = os.path.dirname(html_path)

    css_files = []
    js_files = []

    # Collect CSS
    def collect_css(match):
        href = match.group(1)
        css_path = os.path.join(base_dir, href)
        if os.path.isfile(css_path):
            with open(css_path, "r", encoding="utf-8") as css_file:
                css_files.append(css_file.read())
        return ""  # Remove the tag

    html = re.sub(
        r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\'][^>]*>',
        collect_css,
        html,
        flags=re.IGNORECASE
    )

    # Collect JS
    def collect_js(match):
        src = match.group(1)
        js_path = os.path.join(base_dir, src)
        if os.path.isfile(js_path):
            with open(js_path, "r", encoding="utf-8") as js_file:
                js_files.append(js_file.read())
        return ""  # Remove the tag

    html = re.sub(
        r'<script[^>]+src=["\']([^"\']+)["\'][^>]*>\s*</script>',
        collect_js,
        html,
        flags=re.IGNORECASE
    )

    # Prepare inlined tags
    inline_tags = ""
    if css_files:
        inline_tags += "<style>\n" + "\n".join(css_files) + "\n</style>\n"
    if js_files:
        inline_tags += "<script>\n" + "\n".join(js_files) + "\n</script>\n"

    # Insert after </body> (case-insensitive)
    if re.search(r'</body>', html, flags=re.IGNORECASE):
        html = re.sub(
            r'</body>',
            lambda m: m.group(0) + inline_tags,
            html,
            flags=re.IGNORECASE
        )
    else:
        html += inline_tags

    # Save back
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Inlined CSS and JS into: {html_path}")


if __name__ == "__main__":
    try:
        inline_assets("../dist/index.html")  # Change path if needed
    except Exception as e:
        print(f"Error: {e}")
