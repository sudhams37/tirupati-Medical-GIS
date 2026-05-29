import glob
import re

css_files = glob.glob('*.css')

replacement_css = """@keyframes rotate-border {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.nav-link {
    color: #ffffff;
    text-decoration: none;
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    transition: all 0.25s ease;
    position: relative;
    padding: 4px 6px;
    border-radius: 8px;
    overflow: hidden;
    gap: 4px !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 115px;
    height: 30px;
    white-space: nowrap;
    background: transparent;
    z-index: 1;
}

.nav-link svg {
    width: 10px;
    height: 10px;
}

.nav-links-wrapper {
    gap: 8px !important;
}

.nav-link::before {
    content: '';
    position: absolute;
    top: -50%; left: -50%; width: 200%; height: 200%;
    background: conic-gradient(from 0deg, transparent 0%, transparent 40%, #38bdf8 50%, #818cf8 60%, transparent 60%);
    animation: rotate-border 4s linear infinite;
    z-index: -2;
    opacity: 0.4;
    transition: opacity 0.3s;
    pointer-events: none;
}

.nav-link.active::before,
.nav-link:hover::before {
    opacity: 1;
}

.nav-link::after {
    content: '';
    position: absolute;
    inset: 1.5px;
    background: #0f172a;
    border-radius: 7px;
    z-index: -1;
    pointer-events: none;
}

.nav-link:hover,
.nav-link.active {
    color: #38bdf8;
}"""

for f in css_files:
    content = open(f, 'r', encoding='utf-8').read()
    
    # We want to replace the block starting with @keyframes rotate-border up to .nav-link.active { color: #38bdf8; }
    # Or just replace the block we added in update_nav.py
    pattern = r'@keyframes rotate-border\s*\{.*?.nav-link\.active\s*\{\s*color:\s*#38bdf8;\s*\}'
    
    if re.search(pattern, content, re.DOTALL):
        new_content = re.sub(pattern, replacement_css, content, flags=re.DOTALL)
        if new_content != content:
            open(f, 'w', encoding='utf-8').write(new_content)
            print("Updated " + f)
