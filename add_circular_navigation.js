// Handles navigation for circular UI text clicks
function setupCircularNavigation() {
    // Map text to page
    const navMap = [
        { text: 'DISTRICT ANALYSIS', page: 'index.html' },
        { text: 'MANDAL ANALYSIS', page: 'mandal_analysis.html' },
        { text: 'FACILITIES', page: 'nearby_facilities.html' },
        { text: 'WARD ANALYSIS', page: 'ward_analysis.html' },
        { text: 'TREND ANALYSIS', page: 'analysis.html' }
    ];
    // Get all circular text elements
    const svg = document.querySelector('.circular-svg');
    if (!svg) return;
    const textNodes = svg.querySelectorAll('text.circular-text');
    textNodes.forEach((node, i) => {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => {
            window.location.href = navMap[i].page;
        });
    });
}

document.addEventListener('DOMContentLoaded', setupCircularNavigation);