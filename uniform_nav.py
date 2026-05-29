import glob
import re

css_files = glob.glob('*.css')

for f in css_files:
    content = open(f, 'r', encoding='utf-8').read()
    
    # We want to add width and height to .nav-link
    # We can just replace padding: 8px 12px; with width: 140px; height: 36px; padding: 0; justify-content: center;
    if '.nav-link {' in content:
        # replace the display: inline-flex; align-items: center; with added uniform width/height
        new_content = re.sub(
            r'(display:\s*inline-flex;\s*align-items:\s*center;)',
            r'\1\n    justify-content: center;\n    width: 135px;\n    height: 36px;',
            content
        )
        if new_content != content:
            open(f, 'w', encoding='utf-8').write(new_content)
            print("Updated " + f)
