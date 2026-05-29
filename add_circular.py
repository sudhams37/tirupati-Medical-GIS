import re

html_content = open('home.html', 'r', encoding='utf-8').read()

circular_html = """
                <div class="circular-reveal-container">
                    <div class="circular-images">
                        <img id="img-district" src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop" class="circular-img" alt="">
                        <img id="img-mandal" src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=500&h=500&fit=crop" class="circular-img" alt="">
                        <img id="img-facilities" src="https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=500&h=500&fit=crop" class="circular-img" alt="">
                        <img id="img-ward" src="https://images.unsplash.com/photo-1551076805-e18690c5e561?w=500&h=500&fit=crop" class="circular-img" alt="">
                        <img id="img-trend" src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&h=500&fit=crop" class="circular-img" alt="">
                    </div>

                    <div class="circular-center-text" id="circular-center-text">
                        TIRUPATI GIS
                    </div>

                    <svg viewBox="0 0 400 400" class="circular-svg">
                        <defs>
                            <path id="circle-curve" fill="none" d="M 200,200 m -160,0 a 160,160 0 1,1 320,0 a 160,160 0 1,1 -320,0" />
                            <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#38bdf8" />
                                <stop offset="100%" stop-color="#818cf8" />
                            </linearGradient>
                        </defs>
                        <text class="circular-text" onmouseenter="showCircularImage('img-district')" onmouseleave="hideCircularImages()">
                            <textPath href="#circle-curve" startOffset="0%" textLength="14%" lengthAdjust="spacingAndGlyphs">DISTRICT ANALYSIS</textPath>
                        </text>
                        <text class="circular-text" onmouseenter="showCircularImage('img-mandal')" onmouseleave="hideCircularImages()">
                            <textPath href="#circle-curve" startOffset="20%" textLength="14%" lengthAdjust="spacingAndGlyphs">MANDAL ANALYSIS</textPath>
                        </text>
                        <text class="circular-text" onmouseenter="showCircularImage('img-facilities')" onmouseleave="hideCircularImages()">
                            <textPath href="#circle-curve" startOffset="40%" textLength="14%" lengthAdjust="spacingAndGlyphs">FACILITIES</textPath>
                        </text>
                        <text class="circular-text" onmouseenter="showCircularImage('img-ward')" onmouseleave="hideCircularImages()">
                            <textPath href="#circle-curve" startOffset="60%" textLength="14%" lengthAdjust="spacingAndGlyphs">WARD ANALYSIS</textPath>
                        </text>
                        <text class="circular-text" onmouseenter="showCircularImage('img-trend')" onmouseleave="hideCircularImages()">
                            <textPath href="#circle-curve" startOffset="80%" textLength="14%" lengthAdjust="spacingAndGlyphs">TREND ANALYSIS</textPath>
                        </text>
                    </svg>
                </div>
"""

script_to_add = """
        function showCircularImage(id) {
            document.getElementById('circular-center-text').style.opacity = '0';
            document.getElementById(id).classList.add('active');
        }
        function hideCircularImages() {
            document.getElementById('circular-center-text').style.opacity = '1';
            document.querySelectorAll('.circular-img').forEach(img => img.classList.remove('active'));
        }
"""

if 'circular-reveal-container' not in html_content:
    new_html = html_content.replace('</p>\n            </div>', '</p>\n' + circular_html + '            </div>')
    new_html = new_html.replace('</script>', script_to_add + '</script>')
    open('home.html', 'w', encoding='utf-8').write(new_html)
    print("Added circular HTML to home.html")

css_content = open('home.css', 'r', encoding='utf-8').read()
circular_css = """
.circular-reveal-container {
    position: relative;
    width: 400px;
    height: 400px;
    margin-top: 50px;
    border-radius: 50%;
    background: #e6e6e6;
    box-shadow: 16px 16px 32px #bebebe, -16px -16px 32px #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: all 0.5s ease-out;
}

.circular-reveal-container:hover {
    box-shadow: 20px 20px 40px #bebebe, -20px -20px 40px #ffffff;
}

.circular-reveal-container::before {
    content: '';
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: #e6e6e6;
    box-shadow: inset 6px 6px 12px #d1d1d1, inset -6px -6px 12px #ffffff;
    pointer-events: none;
}

.circular-reveal-container::after {
    content: '';
    position: absolute;
    inset: 12px;
    border-radius: 50%;
    background: #e6e6e6;
    box-shadow: inset 4px 4px 8px #d1d1d1, inset -4px -4px 8px #ffffff;
    pointer-events: none;
}

.circular-center-text {
    position: relative;
    z-index: 10;
    padding: 24px;
    border-radius: 24px;
    background: #e6e6e6;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 700;
    color: #444;
    transition: opacity 0.3s;
}

.circular-center-text:hover {
    box-shadow: inset 3px 3px 6px #d1d1d1, inset -3px -3px 6px #ffffff;
}

.circular-images {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.circular-img {
    position: absolute;
    width: 75%;
    height: 75%;
    object-fit: cover;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.3s ease;
    filter: brightness(0.9);
}

.circular-img.active {
    opacity: 1;
}

@keyframes rotate-svg {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.circular-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    animation: rotate-svg 30s linear infinite;
    z-index: 30;
}

.circular-text {
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    fill: url(#textGradient);
    cursor: pointer;
    transition: fill 0.3s ease;
}

.circular-text:hover {
    fill: #2d3436;
}
"""

if 'circular-reveal-container' not in css_content:
    open('home.css', 'w', encoding='utf-8').write(css_content + '\n' + circular_css)
    print("Added circular CSS to home.css")
