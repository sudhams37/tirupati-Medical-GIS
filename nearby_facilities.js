document.addEventListener('DOMContentLoaded', () => {
    // Initialize the Leaflet map centered on Tirupati region
    const map = L.map('nearby-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([13.6, 79.4], 10);

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    // Color-coded markers with SVG symbols for each medical facility type
    let highlightedFacility = null;

    function getFacilityIcon(type, highlighted) {
        let color = '#ef4444'; // default red
        let svg = '';
        const lowerType = (type || '').toLowerCase();
        const size = highlighted ? 32 : 24;
        const anchor = highlighted ? 16 : 12;
        const extraClass = highlighted ? ' facility-map-marker-active' : '';
        
        // Define SVGs for different types
        const hospitalSvg = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        
        const clinicSvg = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="8" width="18" height="12" rx="2" ry="2"></rect>
                <path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
        `;
        
        const pharmacySvg = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.5 16.5L16.5 4.5a4.24 4.24 0 1 1 6 6L10.5 22.5a4.24 4.24 0 1 1-6-6z"></path>
                <line x1="8.5" y1="12.5" x2="12.5" y2="8.5"></line>
            </svg>
        `;
        
        const specialistSvg = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.5 10.5v-2a8 8 0 0 1 16 0v2"></path>
                <path d="M12 14v4.5a2.5 2.5 0 0 0 5 0v-4.5"></path>
                <circle cx="12" cy="11.5" r="2.5"></circle>
            </svg>
        `;

        if (lowerType.includes('clinic') || lowerType.includes('vhc') || lowerType.includes('phc')) {
            color = '#38bdf8'; // light blue
            svg = clinicSvg;
        } else if (lowerType.includes('pharmacy') || lowerType.includes('kendra') || lowerType.includes('store') || lowerType.includes('chemist')) {
            color = '#10b981'; // green
            svg = pharmacySvg;
        } else if (lowerType.includes('hospital') || lowerType.includes('uphc')) {
            color = '#f43f5e'; // rose/red
            svg = hospitalSvg;
        } else {
            color = '#a855f7'; // purple for dentist/doctors/diagnostic/default
            svg = specialistSvg;
        }

        // Return a beautiful marker with a glowing shadow
        return L.divIcon({
            html: `
                <div style="
                    background-color: ${color}; 
                    color: #ffffff; 
                    border: ${highlighted ? '3px' : '2px'} solid #ffffff; 
                    width: ${size}px; 
                    height: ${size}px; 
                    border-radius: 50%; 
                    box-shadow: 0 2px 6px rgba(0,0,0,0.4), 0 0 ${highlighted ? '14px' : '6px'} ${color}; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    cursor: pointer;
                " class="facility-map-marker${extraClass}">
                    ${svg}
                </div>
            `,
            className: 'custom-facility-icon',
            iconSize: [size, size],
            iconAnchor: [anchor, anchor]
        });
    }

    function getHighlightedFacilityIcon(type) {
        return getFacilityIcon(type, true);
    }

    // Custom Refresh Control to clear selections
    const RefreshControl = L.Control.extend({
        options: {
            position: 'topright'
        },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', 'leaflet-control-refresh', container);
            button.innerHTML = '↻';
            button.href = '#';
            button.title = 'Reset Map & Clear Selections';
            button.style.fontSize = '1.2rem';
            button.style.fontWeight = 'bold';
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.justifyContent = 'center';
            button.style.cursor = 'pointer';

            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);

                // 1. Reset map view to fit district bounds
                if (mandalsGeojsonLayer) {
                    map.fitBounds(mandalsGeojsonLayer.getBounds(), { padding: [20, 20] });
                }

                // 2. Clear selected mandal layer style
                if (selectedLayer && mandalsGeojsonLayer) {
                    mandalsGeojsonLayer.resetStyle(selectedLayer);
                }
                selectedLayer = null;

                // 3. Clear search markers, routes & circles layer
                searchLayers.clearLayers();
                clearActiveRoute();
                currentRouteOrigin = null;

                // 4. Hide results table
                document.getElementById('search-results-table-card').style.display = 'none';
                document.getElementById('results-table-body').innerHTML = '';
                clearTableExportContext();

                // 5. Hide sidebar details and show the selection placeholder
                document.getElementById('sidebar-mandal-details').style.display = 'none';
                const placeholder = document.querySelector('.nearby-sidebar-left > p');
                if (placeholder) {
                    placeholder.style.display = 'block';
                }
            });

            return container;
        }
    });
    map.addControl(new RefreshControl());

    let mandalsGeojsonLayer = null;
    let searchLayers = L.layerGroup().addTo(map);
    let routeLayers = L.layerGroup().addTo(map);
    let activeRouteLine = null;
    let currentRouteOrigin = null;

    // High z-index pane so route line draws above mandal polygons
    if (!map.getPane('routePane')) {
        map.createPane('routePane');
        map.getPane('routePane').style.zIndex = 680;
    }

    // Dark-styled map background layer
    const baseTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    const googleTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps'
    });

    function getOriginIcon(label) {
        return L.divIcon({
            html: `<div title="${label}" style="background-color: #22c55e; border: 3px solid #ffffff; width: 16px; height: 16px; border-radius: 50%; box-shadow: 0 0 12px rgba(34,197,94,0.8);"></div>`,
            className: 'route-origin-icon',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
    }

    function formatRouteDuration(seconds) {
        const minutes = Math.round(seconds / 60);
        if (minutes < 1) return 'Under 1 min';
        if (minutes < 60) return `${minutes} mins`;
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hrs} hr ${mins} mins` : `${hrs} hr`;
    }

    function buildGoogleMapsDirectionsUrl(originLat, originLng, destLat, destLng) {
        return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
    }

    function normalizeCoords(point) {
        const lat = Number(point.lat);
        const lng = Number(point.lng != null ? point.lng : point.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
        }
        return { lat, lng };
    }

    function clearActiveRoute() {
        if (highlightedFacility && highlightedFacility.marker) {
            highlightedFacility.marker.setIcon(getFacilityIcon(highlightedFacility.type));
        }
        highlightedFacility = null;
        routeLayers.clearLayers();
        if (activeRouteLine) {
            map.removeLayer(activeRouteLine);
            activeRouteLine = null;
        }
        if (mandalsGeojsonLayer) {
            mandalsGeojsonLayer.eachLayer(layer => {
                layer.setStyle({ fillOpacity: 0.3 });
            });
        }
        if (map.hasLayer(googleTileLayer)) {
            map.removeLayer(googleTileLayer);
        }
        if (!map.hasLayer(baseTileLayer)) {
            baseTileLayer.addTo(map);
        }
    }

    function enableGoogleMapView() {
        if (!map.hasLayer(googleTileLayer)) {
            googleTileLayer.addTo(map);
        }
        if (mandalsGeojsonLayer) {
            mandalsGeojsonLayer.eachLayer(layer => {
                layer.setStyle({ fillOpacity: 0.15 });
            });
        }
        searchLayers.bringToFront();
    }

    function enableGoogleMapForRoute() {
        enableGoogleMapView();
        routeLayers.bringToFront();
    }

    function setRouteLine(latLngs, dashed) {
        if (activeRouteLine) {
            map.removeLayer(activeRouteLine);
            activeRouteLine = null;
        }
        activeRouteLine = L.polyline(latLngs, {
            color: '#1a73e8',
            weight: 7,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round',
            dashArray: dashed ? '10, 10' : null,
            pane: 'routePane'
        }).addTo(map);
        activeRouteLine.bringToFront();
        routeLayers.bringToFront();
        searchLayers.bringToFront();
        return activeRouteLine;
    }

    function fitMapToRoute(origin, facility, latLngs) {
        const bounds = L.latLngBounds(latLngs);
        bounds.extend([origin.lat, origin.lng]);
        bounds.extend([facility.lat, facility.lon || facility.lng]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }

    async function fetchDrivingRoute(origin, facility) {
        const o = normalizeCoords(origin);
        const d = normalizeCoords({ lat: facility.lat, lng: facility.lon });
        if (!o || !d) {
            throw new Error('Invalid coordinates');
        }

        const path = `${o.lng},${o.lat};${d.lng},${d.lat}`;
        const query = 'overview=full&geometries=geojson&steps=false';
        const servers = [
            `https://router.project-osrm.org/route/v1/driving/${path}?${query}`,
            `https://routing.openstreetmap.de/routed-car/route/v1/driving/${path}?${query}`
        ];

        for (const url of servers) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    return { route: data.routes[0], origin: o, dest: d };
                }
            } catch (err) {
                console.warn('Routing server failed:', url, err);
            }
        }
        return null;
    }

    function buildRoutePopupHtml(facility, origin, originLabel, routeDistKm, routeDurationText) {
        const googleUrl = buildGoogleMapsDirectionsUrl(
            origin.lat,
            origin.lng,
            facility.lat,
            facility.lon
        );
        return `
            <strong>${facility.name}</strong><br>
            <span style="font-size:0.8rem;">${facility.type}</span><br>
            <span style="font-size:0.78rem;color:#94a3b8;">From: ${originLabel}</span><br>
            <span style="font-size:0.78rem;">Route: <strong>${routeDistKm} km</strong> · ${routeDurationText}</span><br>
            <a href="${googleUrl}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block;margin-top:6px;font-size:0.78rem;color:#38bdf8;font-weight:600;">
               Open directions in Google Maps
            </a>
        `;
    }

    function updateFacilityRouteStats(facility, distKm, durationText) {
        if (facility._distanceCell) {
            facility._distanceCell.textContent = `${distKm} km`;
        }
        if (facility._travelTimeCell) {
            facility._travelTimeCell.textContent = durationText;
        }
    }

    function addRouteOriginMarker(origin) {
        if (origin.marker) {
            origin.marker.openPopup();
            return;
        }
        L.marker([origin.lat, origin.lng], { icon: getOriginIcon(origin.label || 'Village') })
            .bindPopup(`<strong>${origin.label || 'Start'}</strong><br><span style="font-size:0.78rem;">Route start (village)</span>`)
            .addTo(routeLayers);
    }

    function drawStraightLineRoute(origin, facility, originLabel) {
        const o = normalizeCoords(origin);
        const d = normalizeCoords({ lat: facility.lat, lng: facility.lon });
        if (!o || !d) return;

        const latLngs = [[o.lat, o.lng], [d.lat, d.lng]];
        setRouteLine(latLngs, true);

        const distKm = parseFloat((map.distance([o.lat, o.lng], [d.lat, d.lng]) / 1000).toFixed(2));
        const durationText = estimateTravelTime(distKm) + ' (est.)';
        facility.marker.setIcon(getHighlightedFacilityIcon(facility.type));
        facility.marker.bindPopup(buildRoutePopupHtml(facility, o, originLabel, distKm, durationText));
        facility.marker.openPopup();
        updateFacilityRouteStats(facility, distKm, durationText);
        fitMapToRoute(o, { lat: d.lat, lon: d.lng }, latLngs);
    }

    async function showFacilityWithRoute(facility, originOverride) {
        const rawOrigin = originOverride || facility.routeOrigin || currentRouteOrigin;
        const origin = normalizeCoords(rawOrigin);
        const dest = normalizeCoords({ lat: facility.lat, lng: facility.lon });

        if (!origin || !dest) {
            map.setView([facility.lat, facility.lon || facility.lng], 16);
            facility.marker.openPopup();
            return;
        }

        const originForUi = { lat: origin.lat, lng: origin.lng, label: rawOrigin.label, marker: rawOrigin.marker };
        currentRouteOrigin = originForUi;

        clearActiveRoute();
        currentRouteOrigin = originForUi;
        enableGoogleMapForRoute();
        highlightedFacility = facility;

        const originLabel = rawOrigin.label || 'Village';
        addRouteOriginMarker(originForUi);

        facility.marker.setIcon(getHighlightedFacilityIcon(facility.type));
        facility.marker.bindPopup(`<strong>${facility.name}</strong><br>Loading route from ${originLabel}…`);
        facility.marker.openPopup();

        // Show a provisional line immediately so the user always sees a route
        const straightLatLngs = [[origin.lat, origin.lng], [dest.lat, dest.lng]];
        setRouteLine(straightLatLngs, true);
        fitMapToRoute(origin, { lat: dest.lat, lon: dest.lng }, straightLatLngs);

        const result = await fetchDrivingRoute(originForUi, facility);
        if (result) {
            const latLngs = result.route.geometry.coordinates.map(c => [c[1], c[0]]);
            setRouteLine(latLngs, false);

            const distKm = (result.route.distance / 1000).toFixed(2);
            const durationText = formatRouteDuration(result.route.duration);
            facility.marker.bindPopup(buildRoutePopupHtml(facility, origin, originLabel, distKm, durationText));
            facility.marker.openPopup();
            updateFacilityRouteStats(facility, distKm, durationText);
            fitMapToRoute(origin, { lat: dest.lat, lon: dest.lng }, latLngs);
        } else {
            drawStraightLineRoute(originForUi, facility, originLabel);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function attachZoomMapButton(btnZoom, facility, mandalName) {
        btnZoom.onclick = () => {
            clearActiveRoute();
            enableGoogleMapView();
            highlightedFacility = facility;
            facility.marker.setIcon(getHighlightedFacilityIcon(facility.type));

            const googlePlaceUrl = `https://www.google.com/maps/search/?api=1&query=${facility.lat},${facility.lon}`;
            facility.marker.bindPopup(
                `<strong>${facility.name}</strong><br>` +
                `<span style="font-size:0.8rem;">${facility.type}</span><br>` +
                (mandalName ? `<span style="font-size:0.78rem;color:#94a3b8;">Mandal: ${mandalName}</span><br>` : '') +
                `<a href="${googlePlaceUrl}" target="_blank" rel="noopener noreferrer" ` +
                `style="display:inline-block;margin-top:6px;font-size:0.78rem;color:#38bdf8;font-weight:600;">` +
                `Open in Google Maps</a>`
            );

            map.setView([facility.lat, facility.lon], 16);
            facility.marker.openPopup();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }

    function attachZoomRouteButton(btnZoom, facility) {
        btnZoom.onclick = async () => {
            const origin = facility.routeOrigin || currentRouteOrigin;
            if (!origin) {
                alert('No village or start location found. Run a Nearby Facilities search first.');
                return;
            }
            const prevText = btnZoom.textContent;
            btnZoom.disabled = true;
            btnZoom.textContent = 'Loading…';
            try {
                await showFacilityWithRoute(facility, origin);
            } catch (err) {
                console.error('Route display failed:', err);
                drawStraightLineRoute(origin, facility, origin.label || 'Village');
            } finally {
                btnZoom.disabled = false;
                btnZoom.textContent = prevText;
            }
        };
    }

    let rawGeojsonData = null;
    let allowedMandals = [];
    let hospitalsData = {};

    // Helper functions
    function sanitize(str) {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/thi/g, 'ti')
            .replace(/palli/g, 'palle')
            .replace(/pet$/g, 'peta');
    }

    function estimateTravelTime(distanceKm) {
        const minutes = (distanceKm / 35) * 60; // Assumes 35 km/h driving speed
        if (minutes < 1) return "Under 1 min";
        return `${Math.round(minutes)} mins`;
    }

    let tableExportContext = null;
    const btnDownloadTable = document.getElementById('btn-download-table');

    function slugForFilename(value) {
        return String(value || 'data')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'data';
    }

    function setTableExportContext(facilities, context) {
        if (!facilities || facilities.length === 0) {
            tableExportContext = null;
            if (btnDownloadTable) btnDownloadTable.disabled = true;
            return;
        }

        tableExportContext = {
            ...context,
            facilitiesList: facilities
        };
        if (btnDownloadTable) btnDownloadTable.disabled = false;
    }

    function getExportRowsFromFacilities(facilities) {
        return facilities.map((fac, idx) => ({
            sno: idx + 1,
            name: fac.name,
            type: fac.type,
            distanceKm: fac._distanceCell
                ? fac._distanceCell.textContent.replace(/\s*km\s*$/i, '').trim()
                : fac.distance,
            travelTime: fac._travelTimeCell
                ? fac._travelTimeCell.textContent
                : estimateTravelTime(fac.distance),
            latitude: fac.lat,
            longitude: fac.lon
        }));
    }

    function clearTableExportContext() {
        tableExportContext = null;
        if (btnDownloadTable) btnDownloadTable.disabled = true;
    }

    function escapeCsvValue(value) {
        const text = String(value ?? '');
        if (/[",\n\r]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function downloadFacilitiesTableCsv() {
        if (!tableExportContext || !tableExportContext.facilitiesList.length) {
            alert('No facility data to download.');
            return;
        }

        const exportRows = getExportRowsFromFacilities(tableExportContext.facilitiesList);

        const headers = [
            'S.No',
            'Hospital Name',
            'Type',
            'Distance (km)',
            'Est. Travel Time',
            'Latitude',
            'Longitude'
        ];

        const metaRows = [];
        if (tableExportContext.source === 'health-resources') {
            metaRows.push(['Source', 'Health Resources']);
            metaRows.push(['Mandal', tableExportContext.mandalName || '']);
        } else {
            metaRows.push(['Source', 'Nearby Facilities']);
            metaRows.push(['Mandal', tableExportContext.mandalName || '']);
            metaRows.push(['Village', tableExportContext.village || '']);
            if (tableExportContext.radiusKm != null) {
                metaRows.push(['Search Radius (km)', tableExportContext.radiusKm]);
            }
        }
        metaRows.push(['Exported', new Date().toLocaleString()]);
        metaRows.push([]);

        const dataRows = exportRows.map(f => [
            f.sno,
            f.name,
            f.type,
            f.distanceKm,
            f.travelTime,
            f.latitude,
            f.longitude
        ]);

        const csv = [...metaRows, headers, ...dataRows]
            .map(row => row.map(escapeCsvValue).join(','))
            .join('\r\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const datePart = new Date().toISOString().slice(0, 10);
        let filename;

        if (tableExportContext.source === 'health-resources') {
            filename = `health-resources-${slugForFilename(tableExportContext.mandalName)}-${datePart}.csv`;
        } else {
            filename = `nearby-facilities-${slugForFilename(tableExportContext.village)}-${slugForFilename(tableExportContext.mandalName)}-${datePart}.csv`;
        }

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    if (btnDownloadTable) {
        btnDownloadTable.addEventListener('click', downloadFacilitiesTableCsv);
    }

    // Point-in-polygon helpers (filter facilities to mandal boundary only)
    function isPointInPolygon(point, ring) {
        const x = point[0];
        const y = point[1];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0];
            const yi = ring[i][1];
            const xj = ring[j][0];
            const yj = ring[j][1];
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function isPointInFeature(point, geometry) {
        if (!geometry) return false;
        if (geometry.type === 'Polygon') {
            return isPointInPolygon(point, geometry.coordinates[0]);
        }
        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.some(poly => isPointInPolygon(point, poly[0]));
        }
        return false;
    }

    function generateRandomPointInPolygon(geometry) {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;

        const processRing = (ring) => {
            ring.forEach(pt => {
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
            });
        };

        if (geometry.type === 'Polygon') {
            processRing(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(poly => processRing(poly[0]));
        }

        for (let attempt = 0; attempt < 80; attempt++) {
            const randLat = minLat + Math.random() * (maxLat - minLat);
            const randLng = minLng + Math.random() * (maxLng - minLng);
            if (isPointInFeature([randLng, randLat], geometry)) {
                return { lat: randLat, lng: randLng };
            }
        }

        return null;
    }

    function generateMandalFallbackFacilities(mandalFeature, center, resultsList, mandalName) {
        const geometry = mandalFeature.geometry;
        const seed = sanitize(mandalName || 'mandal').length;
        const count = 2 + (seed % 3);
        const facilityNames = [
            'Mandal Primary Health Centre',
            'Community Health Clinic',
            'Village Health Sub-Centre',
            'Urban Primary Health Center',
            'Jan Aushadhi Medical Store'
        ];
        const facilityTypes = ['PHC', 'Clinic', 'VHC', 'UPHC', 'Pharmacy'];

        for (let i = 0; i < count; i++) {
            const pt = generateRandomPointInPolygon(geometry);
            if (!pt) continue;

            const name = `${mandalName} ${facilityNames[(seed + i) % facilityNames.length]} (Simulated)`;
            const type = facilityTypes[(seed + i) % facilityTypes.length];
            const dist = parseFloat((map.distance(center, [pt.lat, pt.lng]) / 1000).toFixed(2));

            const marker = L.marker([pt.lat, pt.lng], { icon: getFacilityIcon(type) })
                .bindPopup(`<strong>${name}</strong><br>Type: ${type}<br>Mandal: ${mandalName}`)
                .addTo(searchLayers);

            resultsList.push({
                name,
                type,
                distance: dist,
                lat: pt.lat,
                lon: pt.lng,
                marker
            });
        }
    }

    // Load resources
    const timestamp = new Date().getTime();
    Promise.all([
        fetchDataset(`datasets/ap_mandals.geojson?v=${timestamp}`).then(g => assertGeoJson(g, 'ap_mandals.geojson')),
        fetchDataset(`datasets/tirupati-district-mandals.txt?v=${timestamp}`, 'text'),
        fetchDataset(`datasets/mandal wise no of hospitals.json?v=${timestamp}`)
    ])
    .then(([geojson, mandalsText, hospitalsList]) => {
        rawGeojsonData = geojson;

        // Parse allowed mandals list
        const allowedMandalsRaw = mandalsText.split('\n')
            .map(name => name.trim())
            .filter(name => name.length > 2);

        const aliases = {
            'kumaravenkatabhupalapuram': 'kvbpuram'
        };

        // Populate hospital metrics
        hospitalsList.forEach(item => {
            const key = sanitize(item.mandal || '');
            hospitalsData[key] = item;
        });

        // Set up allowed mandals list object
        allowedMandals = allowedMandalsRaw.map(name => {
            const rawKey = sanitize(name);
            const key = aliases[rawKey] || rawKey;
            return { name, key };
        });

        // Initialize Map
        updateMap();
    })
    .catch(err => {
        console.error("Error loading resources for Nearby Facilities page: ", err);
        showDataLoadError(
            'Could not load map data. Run "python run.py" and open the URL shown in the terminal (port 8080).'
        );
    });



    // Get color based on facility counts
    function getColor(facilities) {
        if (facilities >= 20) return '#10b981'; // Green
        if (facilities >= 5)  return '#0ea5e9'; // Blue
        if (facilities >= 1)  return '#f59e0b'; // Amber
        return '#64748b'; // Slate (none)
    }

    let selectedLayer = null;

    function updateSidebar(feature, layer) {
        if (selectedLayer && mandalsGeojsonLayer) {
            mandalsGeojsonLayer.resetStyle(selectedLayer);
        }
        if (layer) {
            selectedLayer = layer;
            layer.setStyle({
                weight: 3,
                color: '#38bdf8',
                fillOpacity: 0.5
            });
        } else {
            selectedLayer = null;
        }

        const fKey = sanitize(feature.properties.mandal || '');
        const mandalName = feature.properties.mandal;
        const hItem = hospitalsData[fKey];

        const total = hItem ? (Number(hItem.total_health_facilities) || 0) : 0;
        const vhc = hItem ? (Number(hItem.village_health_clinics_vhc) || 0) : 0;
        const phc = hItem ? (Number(hItem.primary_health_centers_phc) || 0) : 0;
        const uphc = hItem ? (Number(hItem.urban_primary_health_centers_uphc) || 0) : 0;
        const chc = hItem ? (Number(hItem.community_health_centers_chcs || hItem.community_health_centers_chc) || 0) : 0;
        const ah = hItem ? (Number(hItem.area_hospitals_ahs || hItem.area_hospitals_ah) || 0) : 0;
        const th = hItem ? (Number(hItem.teaching_hospitals_ths || hItem.teaching_hospitals_th) || 0) : 0;

        document.getElementById('side-mandal-name').textContent = mandalName;
        document.getElementById('side-total').textContent = total;
        document.getElementById('side-vhc').textContent = vhc;
        document.getElementById('side-phc').textContent = phc;
        document.getElementById('side-uphc').textContent = uphc;
        document.getElementById('side-chc').textContent = chc;
        document.getElementById('side-ah').textContent = ah;
        document.getElementById('side-th').textContent = th;

        // Show details block
        document.getElementById('sidebar-mandal-details').style.display = 'block';
        document.getElementById('search-results-table-card').style.display = 'none';

        // Setup Health Resources on-map search click action
        const btnResources = document.getElementById('btn-health-resources');
        btnResources.onclick = () => {
            const originalText = btnResources.textContent;
            btnResources.disabled = true;
            btnResources.textContent = 'Loading...';

            // Clear previous search layers and routes
            searchLayers.clearLayers();
            clearActiveRoute();

            // Clear table
            const tableBody = document.getElementById('results-table-body');
            tableBody.innerHTML = '';
            document.getElementById('search-results-table-card').style.display = 'none';
            clearTableExportContext();

            if (!selectedLayer) {
                btnResources.disabled = false;
                btnResources.textContent = originalText;
                return;
            }

            const mandalFeature = selectedLayer.feature;
            const mandalGeometry = mandalFeature.geometry;
            const center = selectedLayer.getBounds().getCenter();
            const bounds = selectedLayer.getBounds();
            const south = bounds.getSouthWest().lat;
            const west = bounds.getSouthWest().lng;
            const north = bounds.getNorthEast().lat;
            const east = bounds.getNorthEast().lng;

            const searchResults = [];

            const processFacilities = (elements) => {
                elements.forEach(element => {
                    let plat, plon;
                    if (element.type === 'node') {
                        plat = element.lat;
                        plon = element.lon;
                    } else if (element.center) {
                        plat = element.center.lat;
                        plon = element.center.lon;
                    }

                    if (!plat || !plon || !element.tags) return;
                    // Only include facilities strictly inside this mandal polygon
                    if (!isPointInFeature([plon, plat], mandalGeometry)) return;

                    const name = element.tags.name || 'Mandal Health Facility';
                    const amenity = element.tags.amenity || 'Healthcare';
                    const amenityFormatted = amenity.charAt(0).toUpperCase() + amenity.slice(1);
                    const dist = parseFloat((map.distance(center, [plat, plon]) / 1000).toFixed(2));

                    const marker = L.marker([plat, plon], { icon: getFacilityIcon(amenityFormatted) })
                        .bindPopup(`<strong>${name}</strong><br>Type: ${amenityFormatted}<br>Mandal: ${mandalName}`)
                        .addTo(searchLayers);

                    searchResults.push({
                        name: name,
                        type: amenityFormatted,
                        distance: dist,
                        lat: plat,
                        lon: plon,
                        marker: marker
                    });
                });
            };

            const displayTable = () => {
                searchResults.sort((a, b) => a.distance - b.distance);

                searchResults.forEach((fac, idx) => {
                    const row = document.createElement('tr');
                    
                    const tdNo = document.createElement('td');
                    tdNo.textContent = idx + 1;
                    row.appendChild(tdNo);

                    const tdName = document.createElement('td');
                    tdName.innerHTML = `<strong>${fac.name}</strong> <span style="font-size: 0.72rem; color: #a855f7; margin-left: 4px;">(${fac.type})</span>`;
                    row.appendChild(tdName);

                    const tdDist = document.createElement('td');
                    tdDist.textContent = `${fac.distance} km`;
                    row.appendChild(tdDist);

                    const tdTime = document.createElement('td');
                    tdTime.textContent = estimateTravelTime(fac.distance);
                    row.appendChild(tdTime);

                    const tdAction = document.createElement('td');
                    const btnZoom = document.createElement('button');
                    btnZoom.className = 'btn-table-action';
                    btnZoom.textContent = 'Zoom on Map';
                    attachZoomMapButton(btnZoom, fac, mandalName);
                    tdAction.appendChild(btnZoom);
                    row.appendChild(tdAction);

                    tableBody.appendChild(row);
                });

                if (searchResults.length > 0) {
                    const titleEl = document.querySelector('#search-results-table-card .table-title');
                    if (titleEl) {
                        titleEl.textContent = `Health facilities inside ${mandalName} mandal boundary`;
                    }
                    setTableExportContext(searchResults, {
                        source: 'health-resources',
                        mandalName
                    });
                    document.getElementById('search-results-table-card').style.display = 'block';
                } else {
                    const titleEl = document.querySelector('#search-results-table-card .table-title');
                    if (titleEl) {
                        titleEl.textContent = `No health facilities found inside ${mandalName} boundary`;
                    }
                    clearTableExportContext();
                }
            };

            const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(node["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](${south},${west},${north},${east});way["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](${south},${west},${north},${east});relation["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](${south},${west},${north},${east}););out center;`;

            fetch(overpassUrl)
                .then(res => res.json())
                .then(osmData => {
                    if (osmData && osmData.elements && osmData.elements.length > 0) {
                        processFacilities(osmData.elements);
                    }

                    if (searchResults.length === 0) {
                        generateMandalFallbackFacilities(mandalFeature, center, searchResults, mandalName);
                    }

                    displayTable();
                    map.fitBounds(selectedLayer.getBounds(), { padding: [30, 30] });
                })
                .catch(err => {
                    console.warn("Overpass API failed. Generating simulated facilities inside mandal boundary.", err);
                    generateMandalFallbackFacilities(mandalFeature, center, searchResults, mandalName);
                    displayTable();
                    map.fitBounds(selectedLayer.getBounds(), { padding: [30, 30] });
                })
                .finally(() => {
                    btnResources.disabled = false;
                    btnResources.textContent = originalText;
                });
        };

        const btnSearch = document.getElementById('btn-nearby-search');
        btnSearch.onclick = () => {
            const modal = document.getElementById('radius-search-modal');
            document.getElementById('modal-mandal-name').value = mandalName;
            document.getElementById('modal-village-name').value = '';
            document.getElementById('modal-radius').value = 5;
            modal.style.display = 'flex';
        };
    }

    // Main Update trigger
    function updateMap() {
        if (!rawGeojsonData) return;

        const exclusions = [
            { mandal: 'venkatagirikota', district: 'chittoor' },
            { mandal: 'koduru', district: 'krishna' },
            { mandal: 'ramachandrapuram', district: 'east godavari' },
            { mandal: 'vararamachandrapuram', district: 'east godavari' },
            { mandal: 'thotapalligudur', district: 'sri potti sriramulu nellore' },
            { mandal: 'guduru', district: 'krishna' },
            { mandal: 'gudur', district: 'kurnool' }
        ];

        if (mandalsGeojsonLayer) {
            map.removeLayer(mandalsGeojsonLayer);
        }

        // Filter and draw full Tirupati District bounds
        const districtFeatures = rawGeojsonData.features.filter(f => {
            const fKey = sanitize(f.properties.mandal || '');
            const dist = (f.properties.district || '').toLowerCase();
            const isExcluded = exclusions.some(ex => 
                fKey === sanitize(ex.mandal) && dist === ex.district
            );
            if (isExcluded) return false;
            
            return (dist === 'chittoor' || dist === 'sri potti sriramulu nellore') &&
                   allowedMandals.some(am => am.key === fKey);
        });

        mandalsGeojsonLayer = L.geoJSON(districtFeatures, {
            style: (f) => {
                const fKey = sanitize(f.properties.mandal || '');
                const hItem = hospitalsData[fKey];
                const count = hItem ? (Number(hItem.total_health_facilities) || 0) : 0;

                return {
                    color: '#475569',
                    weight: 1.5,
                    fillColor: getColor(count),
                    fillOpacity: 0.3
                };
            },
            onEachFeature: (feature, layer) => {
                layer.on({
                    click: () => {
                        updateSidebar(feature, layer);
                    }
                });
            }
        }).addTo(map);

        // Force Leaflet map layout calculation
        map.invalidateSize();

        // Select a default mandal to display on load (Tirupati Urban)
        mandalsGeojsonLayer.eachLayer(layer => {
            const mName = layer.feature.properties.mandal || '';
            if (sanitize(mName) === sanitize('tirupati urban')) {
                updateSidebar(layer.feature, layer);
            }
        });

        // Zoom to fit the entire district bounds
        map.fitBounds(mandalsGeojsonLayer.getBounds(), { padding: [20, 20] });
    }

    // Modal Cancel Action
    document.getElementById('btn-modal-cancel').onclick = () => {
        document.getElementById('radius-search-modal').style.display = 'none';
    };

    // Modal Submit Action
    document.getElementById('btn-modal-submit').onclick = () => {
        const mandalName = document.getElementById('modal-mandal-name').value;
        const village = document.getElementById('modal-village-name').value.trim();
        const radius = parseFloat(document.getElementById('modal-radius').value);

        if (!village) {
            alert('Please enter a village name.');
            return;
        }
        if (isNaN(radius) || radius <= 0) {
            alert('Please enter a valid radius in kilometers.');
            return;
        }

        const btnSubmit = document.getElementById('btn-modal-submit');
        const originalText = btnSubmit.textContent;
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Searching...';

        // Clear previous layers
        searchLayers.clearLayers();
        clearActiveRoute();

        // Travel time estimation helper
        const estimateTravelTime = (distanceKm) => {
            const minutes = (distanceKm / 35) * 60; // Assumes 35 km/h driving speed
            if (minutes < 1) return "Under 1 min";
            return `${Math.round(minutes)} mins`;
        };

        const performSearch = (lat, lon, isFallback) => {
            // Clear previous table rows and hide table
            const tableBody = document.getElementById('results-table-body');
            tableBody.innerHTML = '';
            document.getElementById('search-results-table-card').style.display = 'none';
            clearTableExportContext();

            // Add Village Marker
            const markerColor = isFallback ? '#f59e0b' : '#10b981';
            const labelText = isFallback 
                ? `<strong>Mandal Center: ${mandalName}</strong><br><span style="font-size: 0.8rem; color: #fcd34d;">(Village "${village}" not found)</span>` 
                : `<strong>Village: ${village}</strong><br>Mandal: ${mandalName}`;

            const villageIcon = L.divIcon({
                html: `<div style="background-color: ${markerColor}; border: 2px solid #ffffff; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
                className: 'custom-village-icon',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const villageMarker = L.marker([lat, lon], { icon: villageIcon })
                .bindPopup(labelText)
                .addTo(searchLayers);

            const villageRouteOrigin = {
                lat: lat,
                lng: lon,
                label: isFallback ? `${mandalName} (Mandal center)` : `Village: ${village}`,
                marker: villageMarker
            };
            currentRouteOrigin = villageRouteOrigin;

            // Add Radius Circle
            const circle = L.circle([lat, lon], {
                radius: radius * 1000,
                color: '#38bdf8',
                fillColor: '#0ea5e9',
                fillOpacity: 0.12,
                weight: 2
            }).addTo(searchLayers);

            const searchResults = [];

            const processFacilityElements = (elements) => {
                elements.forEach(element => {
                    let plat, plon;
                    if (element.type === 'node') {
                        plat = element.lat;
                        plon = element.lon;
                    } else if (element.center) {
                        plat = element.center.lat;
                        plon = element.center.lon;
                    }
                    
                    if (plat && plon && element.tags) {
                        const name = element.tags.name || 'Unnamed Clinic';
                        const amenity = element.tags.amenity || 'Healthcare';
                        const amenityFormatted = amenity.charAt(0).toUpperCase() + amenity.slice(1);
                        const dist = parseFloat((map.distance([lat, lon], [plat, plon]) / 1000).toFixed(2));

                        const marker = L.marker([plat, plon], { icon: getFacilityIcon(amenityFormatted) })
                            .bindPopup(`<strong>${name}</strong><br>Type: ${amenityFormatted}<br>Distance: ${dist} km`)
                            .addTo(searchLayers);

                        searchResults.push({
                            name: name,
                            type: amenityFormatted,
                            distance: dist,
                            lat: plat,
                            lon: plon,
                            marker: marker,
                            routeOrigin: villageRouteOrigin
                        });
                    }
                });
            };

            const displayResultsTable = () => {
                // Sort by distance
                searchResults.sort((a, b) => a.distance - b.distance);

                searchResults.forEach((fac, idx) => {
                    const row = document.createElement('tr');
                    
                    // S.No
                    const tdNo = document.createElement('td');
                    tdNo.textContent = idx + 1;
                    row.appendChild(tdNo);

                    // Name
                    const tdName = document.createElement('td');
                    tdName.innerHTML = `<strong>${fac.name}</strong> <span style="font-size: 0.72rem; color: #94a3b8; margin-left: 4px;">(${fac.type})</span>`;
                    row.appendChild(tdName);

                    // Distance
                    const tdDist = document.createElement('td');
                    tdDist.textContent = `${fac.distance} km`;
                    fac._distanceCell = tdDist;
                    row.appendChild(tdDist);

                    // Travel Time
                    const tdTime = document.createElement('td');
                    tdTime.textContent = estimateTravelTime(fac.distance);
                    fac._travelTimeCell = tdTime;
                    row.appendChild(tdTime);

                    // Action — route from village to hospital on Google map
                    const tdAction = document.createElement('td');
                    const btnZoom = document.createElement('button');
                    btnZoom.className = 'btn-table-action';
                    btnZoom.textContent = 'Zoom on Map';
                    btnZoom.title = `Show driving route from ${village} to this hospital`;
                    attachZoomRouteButton(btnZoom, fac);
                    tdAction.appendChild(btnZoom);
                    row.appendChild(tdAction);

                    tableBody.appendChild(row);
                });

                if (searchResults.length > 0) {
                    const titleEl = document.querySelector('#search-results-table-card .table-title');
                    if (titleEl) {
                        titleEl.textContent = `Hospitals near ${village} — Zoom on Map shows driving route from your village`;
                    }
                    setTableExportContext(searchResults, {
                        source: 'nearby-facilities',
                        mandalName,
                        village,
                        radiusKm: radius
                    });
                    document.getElementById('search-results-table-card').style.display = 'block';
                } else {
                    clearTableExportContext();
                }
            };

            // Fetch real facilities from OpenStreetMap Overpass API
            const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(node["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radius * 1000},${lat},${lon});way["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radius * 1000},${lat},${lon});relation["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radius * 1000},${lat},${lon}););out body;>;out skel qt;`;

            fetch(overpassUrl)
                .then(res => res.json())
                .then(osmData => {
                    if (osmData && osmData.elements && osmData.elements.length > 0) {
                        processFacilityElements(osmData.elements);
                    }

                    if (searchResults.length === 0) {
                        generateFallbackFacilities(lat, lon, radius, searchResults, villageRouteOrigin);
                    }

                    displayResultsTable();
                    map.fitBounds(circle.getBounds(), { padding: [30, 30] });
                    villageMarker.openPopup();
                    
                    // Close modal
                    document.getElementById('radius-search-modal').style.display = 'none';
                })
                .catch(err => {
                    console.warn("Overpass API failed or offline. Generating simulated facilities.");
                    generateFallbackFacilities(lat, lon, radius, searchResults, villageRouteOrigin);
                    displayResultsTable();
                    map.fitBounds(circle.getBounds(), { padding: [30, 30] });
                    villageMarker.openPopup();
                    document.getElementById('radius-search-modal').style.display = 'none';
                })
                .finally(() => {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = originalText;
                });
        };

        const queries = [
            `${village}, ${mandalName}, Tirupati, Andhra Pradesh, India`,
            `${village}, ${mandalName}, Andhra Pradesh, India`,
            `${village}, Tirupati, Andhra Pradesh, India`,
            `${village}, Andhra Pradesh, India`,
            `${village}, Tirupati`,
            `${village}`
        ];

        let queryIndex = 0;

        const tryNextQuery = () => {
            if (queryIndex >= queries.length) {
                // If geocoding completely fails, fall back to the selected mandal's center bounds
                if (selectedLayer) {
                    const mCenter = selectedLayer.getBounds().getCenter();
                    alert(`Could not find village "${village}" in Nominatim database. Centering search at the center of ${mandalName} mandal instead.`);
                    performSearch(mCenter.lat, mCenter.lng, true);
                } else {
                    alert(`Could not find village "${village}". Please try a different spelling.`);
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = originalText;
                }
                return;
            }

            const query = queries[queryIndex];
            queryIndex++;

            const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

            fetch(geocodeUrl)
                .then(res => res.json())
                .then(data => {
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lon = parseFloat(data[0].lon);
                        performSearch(lat, lon, false);
                    } else {
                        tryNextQuery();
                    }
                })
                .catch(err => {
                    tryNextQuery();
                });
        };

        tryNextQuery();
    };

    function generateFallbackFacilities(centerLat, centerLon, radiusKm, resultsList, routeOrigin) {
        const count = 3 + Math.floor(Math.random() * 4);
        const facilityNames = [
            "Mandal Primary Health Centre", 
            "Community Health Clinic", 
            "Arogya Wellness Center", 
            "Village Health Sub-Centre",
            "Sri Venkateswara Care Clinic",
            "Jan Aushadhi Medical Store",
            "Pratham Diagnostics & Pharmacy"
        ];
        const facilityTypes = ["PHC", "VHC", "UPHC", "Clinic", "Pharmacy"];

        for (let i = 0; i < count; i++) {
            const distance = Math.random() * radiusKm;
            const angle = Math.random() * Math.PI * 2;
            
            const latOffset = (distance / 111) * Math.sin(angle);
            const lonOffset = (distance / (111 * Math.cos(centerLat * Math.PI / 180))) * Math.cos(angle);
            
            const plat = centerLat + latOffset;
            const plon = centerLon + lonOffset;
            
            const name = facilityNames[i % facilityNames.length] + " (Simulated)";
            const type = facilityTypes[i % facilityTypes.length];
            const dist = parseFloat(distance.toFixed(2));

            const marker = L.marker([plat, plon], { icon: getFacilityIcon(type) })
                .bindPopup(`<strong>${name}</strong><br>Type: ${type}<br>Distance: ${dist} km`)
                .addTo(searchLayers);

            resultsList.push({
                name: name,
                type: type,
                distance: dist,
                lat: plat,
                lon: plon,
                marker: marker,
                routeOrigin: routeOrigin || currentRouteOrigin
            });
        }
    }
});
