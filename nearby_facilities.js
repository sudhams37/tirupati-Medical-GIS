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
    function getFacilityIcon(type) {
        let color = '#ef4444'; // default red
        let svg = '';
        const lowerType = (type || '').toLowerCase();
        
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
                    border: 2px solid #ffffff; 
                    width: 24px; 
                    height: 24px; 
                    border-radius: 50%; 
                    box-shadow: 0 2px 6px rgba(0,0,0,0.4), 0 0 6px ${color}; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    cursor: pointer;
                " class="facility-map-marker">
                    ${svg}
                </div>
            `,
            className: 'custom-facility-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
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

                // 3. Clear search markers & circles layer
                searchLayers.clearLayers();

                // 4. Hide results table
                document.getElementById('search-results-table-card').style.display = 'none';
                document.getElementById('results-table-body').innerHTML = '';

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

    // Dark-styled map background layer
    const baseTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

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

    // Load resources
    const timestamp = new Date().getTime();
    Promise.all([
        fetch(`datasets/ap_mandals.geojson?v=${timestamp}`).then(r => r.json()),
        fetch(`datasets/tirupati-district-mandals.txt?v=${timestamp}`).then(r => r.text()),
        fetch(`datasets/mandal wise no of hospitals.json?v=${timestamp}`).then(r => r.json())
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

            // Clear previous search layers
            searchLayers.clearLayers();

            // Clear table
            const tableBody = document.getElementById('results-table-body');
            tableBody.innerHTML = '';
            document.getElementById('search-results-table-card').style.display = 'none';

            if (!selectedLayer) {
                btnResources.disabled = false;
                btnResources.textContent = originalText;
                return;
            }

            const center = selectedLayer.getBounds().getCenter();
            const corner = selectedLayer.getBounds().getNorthEast();
            const radiusMeters = map.distance(center, corner);
            const radiusKm = radiusMeters / 1000;

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
                    
                    if (plat && plon && element.tags) {
                        const name = element.tags.name || 'Mandal Health Facility';
                        const amenity = element.tags.amenity || 'Healthcare';
                        const amenityFormatted = amenity.charAt(0).toUpperCase() + amenity.slice(1);
                        const dist = parseFloat((map.distance(center, [plat, plon]) / 1000).toFixed(2));

                        // Custom SVG markers for Health Resources
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
                    }
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
                    btnZoom.onclick = () => {
                        map.setView([fac.lat, fac.lon], 16);
                        fac.marker.openPopup();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    };
                    tdAction.appendChild(btnZoom);
                    row.appendChild(tdAction);

                    tableBody.appendChild(row);
                });

                if (searchResults.length > 0) {
                    document.getElementById('search-results-table-card').style.display = 'block';
                }
            };

            const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:25];(node["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radiusMeters},${center.lat},${center.lng});way["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radiusMeters},${center.lat},${center.lng});relation["amenity"~"hospital|clinic|doctors|dentist|pharmacy"](around:${radiusMeters},${center.lat},${center.lng}););out body;>;out skel qt;`;

            fetch(overpassUrl)
                .then(res => res.json())
                .then(osmData => {
                    if (osmData && osmData.elements && osmData.elements.length > 0) {
                        processFacilities(osmData.elements);
                    }

                    if (searchResults.length === 0) {
                        generateFallbackFacilities(center.lat, center.lng, radiusKm, searchResults);
                    }

                    displayTable();
                    map.fitBounds(selectedLayer.getBounds(), { padding: [30, 30] });
                })
                .catch(err => {
                    console.warn("Overpass API failed. Generating fallback simulated facilities.");
                    generateFallbackFacilities(center.lat, center.lng, radiusKm, searchResults);
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
                            marker: marker
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
                    row.appendChild(tdDist);

                    // Travel Time
                    const tdTime = document.createElement('td');
                    tdTime.textContent = estimateTravelTime(fac.distance);
                    row.appendChild(tdTime);

                    // Action Zoom button
                    const tdAction = document.createElement('td');
                    const btnZoom = document.createElement('button');
                    btnZoom.className = 'btn-table-action';
                    btnZoom.textContent = 'Zoom on Map';
                    btnZoom.onclick = () => {
                        map.setView([fac.lat, fac.lon], 16);
                        fac.marker.openPopup();
                        // Scroll the page back to top smoothly to focus on the map
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    };
                    tdAction.appendChild(btnZoom);
                    row.appendChild(tdAction);

                    tableBody.appendChild(row);
                });

                if (searchResults.length > 0) {
                    document.getElementById('search-results-table-card').style.display = 'block';
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
                        generateFallbackFacilities(lat, lon, radius, searchResults);
                    }

                    displayResultsTable();
                    map.fitBounds(circle.getBounds(), { padding: [30, 30] });
                    villageMarker.openPopup();
                    
                    // Close modal
                    document.getElementById('radius-search-modal').style.display = 'none';
                })
                .catch(err => {
                    console.warn("Overpass API failed or offline. Generating simulated facilities.");
                    generateFallbackFacilities(lat, lon, radius, searchResults);
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

    function generateFallbackFacilities(centerLat, centerLon, radiusKm, resultsList) {
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
                marker: marker
            });
        }
    }
});
