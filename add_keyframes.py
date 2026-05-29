content = open('home.css', 'r', encoding='utf-8').read()
if '@keyframes shine' not in content:
    content += '\n@keyframes shine { 0% { background-position: 0 0; } 100% { background-position: 100% 0; } }\n'
    open('home.css', 'w', encoding='utf-8').write(content)
