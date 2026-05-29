import glob
import re

html_files = glob.glob('*.html')
for f in html_files:
    if f == 'home.html':
        continue # home.html doesn't load data

    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Check if already has data-load-utils
    if 'data-load-utils.js' not in content:
        # Find the line with the main script like script.js, mandal_analysis.js etc.
        # It's usually the last script before </body>
        # Let's insert it right after the leaflet.js or turf.min.js script
        
        # We can just inject it right before the last <script src="
        new_content = re.sub(
            r'(<script src="[^"]+\.js(?:\?v=\d+)?"></script>\s*</body>)',
            r'<script src="data-load-utils.js"></script>\n    \1',
            content
        )
        if new_content != content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print("Added to " + f)
        else:
            # Fallback, just add before </body>
            new_content = content.replace('</body>', '<script src="data-load-utils.js"></script>\n</body>')
            with open(f, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print("Added to (fallback) " + f)
