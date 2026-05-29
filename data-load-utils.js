/** Shared dataset fetch helpers and user-visible load errors. */
(function () {
    function showDataLoadError(message) {
        const id = 'data-load-error-banner';
        if (document.getElementById(id)) return;

        const banner = document.createElement('div');
        banner.id = id;
        banner.setAttribute('role', 'alert');
        banner.style.cssText = [
            'position: fixed',
            'top: 72px',
            'left: 50%',
            'transform: translateX(-50%)',
            'z-index: 10000',
            'max-width: min(640px, 92vw)',
            'padding: 14px 18px',
            'border-radius: 10px',
            'background: #7f1d1d',
            'color: #fef2f2',
            'font: 500 0.9rem/1.45 Inter, system-ui, sans-serif',
            'box-shadow: 0 8px 24px rgba(0,0,0,0.35)',
            'border: 1px solid #fca5a5',
        ].join(';');
        banner.textContent = message;
        document.body.appendChild(banner);
    }

    function fetchDataset(url, as = 'json') {
        return fetch(url).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
            }
            if (as === 'text') return response.text();
            return response.json();
        });
    }

    function assertGeoJson(geojson, label) {
        if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
            throw new Error(`Invalid or empty GeoJSON: ${label}`);
        }
        return geojson;
    }

    window.showDataLoadError = showDataLoadError;
    window.fetchDataset = fetchDataset;
    window.assertGeoJson = assertGeoJson;
})();
