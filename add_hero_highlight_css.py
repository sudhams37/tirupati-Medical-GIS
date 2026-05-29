content = open('home.css', 'r', encoding='utf-8').read()

css_to_add = """
.hero-highlight-container {
    position: relative;
    overflow: hidden;
}

.hero-highlight-dots-static {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, rgb(212, 212, 212) 1px, transparent 1px);
    background-size: 16px 16px;
    opacity: 0.7;
    z-index: 0;
}

.hero-highlight-dots-interactive {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, rgb(99, 102, 241) 1px, transparent 1px);
    background-size: 16px 16px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 1;
    -webkit-mask-image: radial-gradient(200px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), black 0%, transparent 100%);
    mask-image: radial-gradient(200px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), black 0%, transparent 100%);
}

.hero-highlight-container:hover .hero-highlight-dots-interactive {
    opacity: 1;
}

@keyframes highlight-sweep {
    from { background-size: 0% 100%; }
    to { background-size: 100% 100%; }
}

.text-highlight {
    position: relative;
    display: inline;
    padding-bottom: 2px;
    padding-left: 4px;
    padding-right: 4px;
    border-radius: 8px;
    background-image: linear-gradient(to right, #93c5fd, #d8b4fe);
    background-repeat: no-repeat;
    background-position: left center;
    background-size: 100% 100%;
    animation: highlight-sweep 2s linear 0.5s both;
    color: #000;
    font-weight: 700;
}
"""

if 'hero-highlight-container' not in content:
    with open('home.css', 'w', encoding='utf-8') as file:
        file.write(content + "\n" + css_to_add)
    print("Added hero highlight CSS")
