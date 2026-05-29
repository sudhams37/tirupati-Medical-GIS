import glob
files = glob.glob('*.css')
keyframes = '\n@keyframes shine { 0% { background-position: 0 0; } 100% { background-position: 100% 0; } }\n'
target = 'background: linear-gradient(135deg, #38bdf8, #818cf8);'
replacement = 'background: linear-gradient(90deg, #38bdf8, #818cf8, #ffffff, #818cf8, #38bdf8);\n    background-size: 200% auto;\n    animation: shine 3s linear infinite alternate;'
for f in files:
    content = open(f, 'r', encoding='utf-8').read()
    if '@keyframes shine' not in content and target in content:
        content = content.replace(target, replacement) + keyframes
        open(f, 'w', encoding='utf-8').write(content)
        print('Updated ' + f)
