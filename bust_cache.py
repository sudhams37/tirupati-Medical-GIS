import glob
import re

html_files = glob.glob('*.html')
for f in html_files:
    content = open(f, 'r', encoding='utf-8').read()
    # Find something like .css?v=86 and replace it with .css?v=99
    new_content = re.sub(r'\.css\?v=\d+', '.css?v=99', content)
    if new_content != content:
        open(f, 'w', encoding='utf-8').write(new_content)
        print('Busted cache for ' + f)
