document.addEventListener('DOMContentLoaded', () => {
    // Initialize the Leaflet map centered on Tirupati region
    const map = L.map('mandal-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([13.6, 79.4], 10);

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    const comparisonMarkersGroup = L.layerGroup().addTo(map);

    // Dark-styled map background layer
    const baseTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Data stores
    let rawGeojsonData = null;
    let allowedMandals = [];
    let diseaseData = {
        dengue: {},
        malaria: {}
    };
    let hospitalsData = {};
    let currentMandalKey = '';
    let currentDisease = 'dengue';
    let currentMandalLayer = null;
    let centroidMarker = null;
    let currentCompareMetric = 'incidence_ratio';
    let mapMode = 'leaflet';
    let districtOutlineLayer = null;
    let showComparisonMarkers = false;
    let showFacilityMarkers = false;
    let currentFacilityTab = 'greater';

    // Helper functions
    function sanitize(str) {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/thi/g, 'ti')
            .replace(/palli/g, 'palle')
            .replace(/pet$/g, 'peta');
    }

    function getCentroid(feature) {
        let pts = [];
        function extractPoints(coords) {
            for (let i = 0; i < coords.length; i++) {
                pts.push(coords[i]);
            }
        }
        if (feature.geometry.type === 'Polygon') {
            extractPoints(feature.geometry.coordinates[0]);
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(poly => {
                extractPoints(poly[0]);
            });
        }
        
        if (pts.length === 0) return null;
        
        let area = 0, cx = 0, cy = 0;
        for (let i = 0; i < pts.length; i++) {
            let p1 = pts[i];
            let p2 = pts[(i + 1) % pts.length];
            let factor = (p1[0] * p2[1]) - (p2[0] * p1[1]);
            area += factor;
            cx += (p1[0] + p2[0]) * factor;
            cy += (p1[1] + p2[1]) * factor;
        }
        area = area * 0.5;
        if (Math.abs(area) > 1e-9) {
            cx = cx / (6 * area);
            cy = cy / (6 * area);
            return L.latLng(cy, cx);
        } else {
            let sumLat = 0, sumLng = 0;
            pts.forEach(p => {
                sumLng += p[0];
                sumLat += p[1];
            });
            return L.latLng(sumLat / pts.length, sumLng / pts.length);
        }
    }

    // Load resources
    const timestamp = new Date().getTime();
    Promise.all([
        fetchDataset(`datasets/ap_mandals.geojson?v=${timestamp}`).then(g => assertGeoJson(g, 'ap_mandals.geojson')),
        fetchDataset(`datasets/tirupati-district-mandals.txt?v=${timestamp}`, 'text'),
        fetchDataset(`datasets/dengue.json?v=${timestamp}`),
        fetchDataset(`datasets/malaria.json?v=${timestamp}`),
        fetchDataset(`datasets/mandal wise no of hospitals.json?v=${timestamp}`)
    ])
    .then(([geojson, mandalsText, dengueList, malariaList, hospitalsList]) => {
        rawGeojsonData = geojson;

        // Parse allowed mandals list
        const allowedMandalsRaw = mandalsText.split('\n')
            .map(name => name.trim())
            .filter(name => name.length > 2);

        const aliases = {
            'kumaravenkatabhupalapuram': 'kvbpuram'
        };

        // Create mappings
        dengueList.forEach(item => {
            const key = sanitize(item.mandal || '');
            const dist = (item['district '] || '').toLowerCase();
            if (key === 'thotapalligudur' || key === 'guduru' || (key === 'gudur' && dist === 'kurnool')) {
                return;
            }
            diseaseData.dengue[key] = item;
        });

        malariaList.forEach(item => {
            const key = sanitize(item.mandal || '');
            const dist = (item['district '] || '').toLowerCase();
            if (key === 'thotapalligudur' || key === 'guduru' || (key === 'gudur' && dist === 'kurnool')) {
                return;
            }
            diseaseData.malaria[key] = item;
        });

        hospitalsList.forEach(item => {
            const key = sanitize(item.mandal || '');
            hospitalsData[key] = item;
        });

        // Set up dropdown list
        const dropdown = document.getElementById('mandal-dropdown');
        allowedMandals = allowedMandalsRaw.map(name => {
            const rawKey = sanitize(name);
            const key = aliases[rawKey] || rawKey;
            return { name, key };
        }).sort((a, b) => a.name.localeCompare(b.name));

        allowedMandals.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.key;
            opt.textContent = m.name;
            dropdown.appendChild(opt);
        });

        // Event listener for select changes
        dropdown.addEventListener('change', (e) => {
            currentMandalKey = e.target.value;
            updateMandalDetails();
        });

        // Toggle Disease Buttons
        const toggleDengue = document.getElementById('toggle-dengue');
        const toggleMalaria = document.getElementById('toggle-malaria');

        toggleDengue.addEventListener('click', () => {
            currentDisease = 'dengue';
            toggleDengue.classList.add('active');
            toggleMalaria.classList.remove('active');
            updateMandalDetails();
        });

        toggleMalaria.addEventListener('click', () => {
            currentDisease = 'malaria';
            toggleMalaria.classList.add('active');
            toggleDengue.classList.remove('active');
            updateMandalDetails();
        });

        // Event listener for compare metric select changes
        const compareMetricSelect = document.getElementById('compare-metric-select');
        if (compareMetricSelect) {
            compareMetricSelect.addEventListener('change', (e) => {
                console.log("Comparison metric dropdown changed to:", e.target.value);
                currentCompareMetric = e.target.value;
                updateMandalDetails();
            });
        }

        // Event listeners for Map Mode controls
        const btnLeaflet = document.getElementById('btn-leaflet');
        const btnOutline = document.getElementById('btn-outline');
        const btnShowCompareMap = document.getElementById('btn-show-compare-map');
        const btnShowFacilityMap = document.getElementById('btn-show-facility-map');

        if (btnLeaflet && btnOutline) {
            btnLeaflet.addEventListener('click', () => {
                if (mapMode === 'leaflet') return;
                mapMode = 'leaflet';
                btnLeaflet.classList.add('active');
                btnOutline.classList.remove('active');
                
                // Turn off comparison markers when going back to Leaflet mode
                showComparisonMarkers = false;
                showFacilityMarkers = false;
                if (btnShowCompareMap) {
                    btnShowCompareMap.textContent = 'Show Comparison in Map';
                    btnShowCompareMap.classList.remove('active');
                }
                if (btnShowFacilityMap) {
                    btnShowFacilityMap.textContent = 'Show Comparison in Map';
                    btnShowFacilityMap.classList.remove('active');
                }
                
                updateMandalDetails();
            });

            btnOutline.addEventListener('click', () => {
                if (mapMode === 'outline') return;
                mapMode = 'outline';
                btnOutline.classList.add('active');
                btnLeaflet.classList.remove('active');
                updateMandalDetails();
            });
        }

        if (btnShowCompareMap) {
            btnShowCompareMap.addEventListener('click', () => {
                showComparisonMarkers = !showComparisonMarkers;
                if (showComparisonMarkers) {
                    btnShowCompareMap.textContent = 'Hide Comparison Map';
                    btnShowCompareMap.classList.add('active');
                    
                    // Turn off facility comparison
                    showFacilityMarkers = false;
                    if (btnShowFacilityMap) {
                        btnShowFacilityMap.textContent = 'Show Comparison in Map';
                        btnShowFacilityMap.classList.remove('active');
                    }
                    
                    // Force outline map mode
                    mapMode = 'outline';
                    if (btnOutline) btnOutline.classList.add('active');
                    if (btnLeaflet) btnLeaflet.classList.remove('active');
                } else {
                    btnShowCompareMap.textContent = 'Show Comparison in Map';
                    btnShowCompareMap.classList.remove('active');
                }
                updateMandalDetails();
            });
        }

        if (btnShowFacilityMap) {
            btnShowFacilityMap.addEventListener('click', () => {
                showFacilityMarkers = !showFacilityMarkers;
                if (showFacilityMarkers) {
                    btnShowFacilityMap.textContent = 'Hide Comparison Map';
                    btnShowFacilityMap.classList.add('active');
                    
                    // Turn off disease comparison
                    showComparisonMarkers = false;
                    if (btnShowCompareMap) {
                        btnShowCompareMap.textContent = 'Show Comparison in Map';
                        btnShowCompareMap.classList.remove('active');
                    }
                    
                    // Force outline map mode
                    mapMode = 'outline';
                    if (btnOutline) btnOutline.classList.add('active');
                    if (btnLeaflet) btnLeaflet.classList.remove('active');
                } else {
                    btnShowFacilityMap.textContent = 'Show Comparison in Map';
                    btnShowFacilityMap.classList.remove('active');
                }
                updateMandalDetails();
            });
        }

        // Event listeners for Facility comparison tabs
        const tabGreater = document.getElementById('tab-facility-greater');
        const tabLess = document.getElementById('tab-facility-less');

        if (tabGreater && tabLess) {
            tabGreater.addEventListener('click', () => {
                if (currentFacilityTab === 'greater') return;
                currentFacilityTab = 'greater';
                tabGreater.classList.add('active');
                tabLess.classList.remove('active');
                updateMandalDetails();
            });

            tabLess.addEventListener('click', () => {
                if (currentFacilityTab === 'less') return;
                currentFacilityTab = 'less';
                tabLess.classList.add('active');
                tabGreater.classList.remove('active');
                updateMandalDetails();
            });
        }

        // Set initial selection
        if (allowedMandals.length > 0) {
            currentMandalKey = allowedMandals[0].key;
            dropdown.value = currentMandalKey;
            updateMandalDetails();
        }
    })
    .catch(err => {
        console.error("Error loading GIS resources: ", err);
        showDataLoadError(
            'Could not load map data. Run "python run.py" and open the URL shown in the terminal (port 8080).'
        );
    });

    // Update Mandal Report Panel
    function updateMandalDetails() {
        if (!currentMandalKey) return;

        const currentMandalName = allowedMandals.find(m => m.key === currentMandalKey)?.name || '';
        const dItem = diseaseData[currentDisease][currentMandalKey];
        const hItem = hospitalsData[currentMandalKey];

        // 1. Profile section
        const population = dItem ? (Number(dItem.population) || 0) : 0;
        document.getElementById('mandal-profile-population').textContent = population.toLocaleString();
        
        const floatRequired = population / 50000;
        const requiredHospitals = Math.max(1, Math.round(floatRequired));
        document.getElementById('mandal-profile-required').textContent = requiredHospitals;

        // 2. Disease Card details
        const totalCases = dItem ? (Number(dItem['total no of cases']) || 0) : 0;
        const confirmed = dItem ? (Number(dItem['confirmed cases']) || 0) : 0;
        const recovered = dItem ? (Number(dItem['recovered cases']) || 0) : 0;
        const deaths = dItem ? (Number(dItem['death cases']) || 0) : 0;

        document.getElementById('rep-total-cases').textContent = totalCases;
        document.getElementById('rep-confirmed').textContent = confirmed;
        document.getElementById('rep-recovered').textContent = recovered;
        document.getElementById('rep-deaths').textContent = deaths;

        // Rates & progress bars
        const incidenceRate = dItem ? (Number(dItem.incidence_ratio) || 0) : 0;
        const recoveryRate = dItem ? (Number(dItem.recovery_ratio) || 0) : 0;
        const deathRate = dItem ? (Number(dItem.death_ratio) || 0) : 0;

        document.getElementById('rep-ratio-incidence').textContent = incidenceRate.toFixed(2) + '%';
        document.getElementById('rep-ratio-recovery').textContent = recoveryRate.toFixed(2) + '%';
        const formattedDeathRate = deathRate.toFixed(2) + (currentDisease === 'malaria' ? '%' : '‰');
        document.getElementById('rep-ratio-death').textContent = formattedDeathRate;

        // Set bar widths (capped at 100%)
        document.getElementById('bar-incidence').style.width = Math.min(100, incidenceRate * 10) + '%';
        document.getElementById('bar-recovery').style.width = Math.min(100, recoveryRate) + '%';
        document.getElementById('bar-death').style.width = Math.min(100, deathRate * 20) + '%';

        // 3. Hospital adequacy and counts
        const availableHospitals = hItem ? ((Number(hItem.total_health_facilities) || 0) - (Number(hItem.village_health_clinics_vhc) || 0)) : 0;
        document.getElementById('rep-avail-hospitals').textContent = availableHospitals;

        let coveragePercent = 0;
        if (floatRequired > 0) {
            coveragePercent = Math.round((availableHospitals / floatRequired) * 100);
        }
        document.getElementById('rep-coverage-pct').textContent = coveragePercent + '%';

        const badge = document.getElementById('rep-adequacy-badge');
        badge.className = 'status-badge';
        if (coveragePercent >= 120) {
            badge.textContent = 'Sufficient';
            badge.classList.add('status-sufficient');
        } else if (coveragePercent >= 80) {
            badge.textContent = 'Moderate';
            badge.classList.add('status-moderate');
        } else {
            badge.textContent = 'Critical';
            badge.classList.add('status-critical');
        }

        // Breakdown facilities
        const vhc = hItem ? (Number(hItem.village_health_clinics_vhc) || 0) : 0;
        const phc = hItem ? (Number(hItem.primary_health_centers_phc) || 0) : 0;
        const uphc = hItem ? (Number(hItem.urban_primary_health_centers_uphc) || 0) : 0;
        const chc = hItem ? (Number(hItem.community_health_centers_chcs || hItem.community_health_centers_chc) || 0) : 0;
        const ah = hItem ? (Number(hItem.area_hospitals_ahs || hItem.area_hospitals_ah) || 0) : 0;
        const th = hItem ? (Number(hItem.teaching_hospitals_ths || hItem.teaching_hospitals_th) || 0) : 0;

        document.getElementById('rep-count-vhc').textContent = vhc;
        document.getElementById('rep-count-phc').textContent = phc;
        document.getElementById('rep-count-uphc').textContent = uphc;
        document.getElementById('rep-count-chc').textContent = chc;
        document.getElementById('rep-count-ah').textContent = ah;
        document.getElementById('rep-count-th').textContent = th;

        // Density per 10k calculation
        function getDensity(count) {
            if (population === 0) return 0;
            return (count / population) * 10000;
        }

        const densVhc = getDensity(vhc);
        const densPhc = getDensity(phc);
        const densUphc = getDensity(uphc);
        const densChc = getDensity(chc);
        const densAh = getDensity(ah);
        const densTh = getDensity(th);

        document.getElementById('rep-density-vhc').textContent = densVhc.toFixed(2);
        document.getElementById('rep-density-phc').textContent = densPhc.toFixed(2);
        document.getElementById('rep-density-uphc').textContent = densUphc.toFixed(2);
        document.getElementById('rep-density-chc').textContent = densChc.toFixed(2);
        document.getElementById('rep-density-ah').textContent = densAh.toFixed(2);
        document.getElementById('rep-density-th').textContent = densTh.toFixed(2);

        // Density bar fills (scaling against a standard of 10 facilities per 10,000 population)
        document.getElementById('bar-density-vhc').style.width = Math.min(100, (densVhc / 10) * 100) + '%';
        document.getElementById('bar-density-phc').style.width = Math.min(100, (densPhc / 2) * 100) + '%';
        document.getElementById('bar-density-uphc').style.width = Math.min(100, (densUphc / 2) * 100) + '%';
        document.getElementById('bar-density-chc').style.width = Math.min(100, (densChc / 1) * 100) + '%';
        document.getElementById('bar-density-ah').style.width = Math.min(100, (densAh / 0.5) * 100) + '%';
        document.getElementById('bar-density-th').style.width = Math.min(100, (densTh / 0.5) * 100) + '%';

        // 5. Update Comparison Donut Chart
        updateDonutChartFromMetric();

        // 6. Update Medical Facilities Comparison Table
        updateFacilitiesComparisonTable();

        // 4. Update the Map
        if (rawGeojsonData) {
            // Force Leaflet to recalculate container size in case of flexbox rendering delay
            map.invalidateSize();

            const exclusions = [
                { mandal: 'venkatagirikota', district: 'chittoor' },
                { mandal: 'koduru', district: 'krishna' },
                { mandal: 'ramachandrapuram', district: 'east godavari' },
                { mandal: 'vararamachandrapuram', district: 'east godavari' },
                { mandal: 'thotapalligudur', district: 'sri potti sriramulu nellore' },
                { mandal: 'guduru', district: 'krishna' },
                { mandal: 'gudur', district: 'kurnool' }
            ];

            // Clean up existing layers
            if (currentMandalLayer) {
                map.removeLayer(currentMandalLayer);
                currentMandalLayer = null;
            }
            if (centroidMarker) {
                map.removeLayer(centroidMarker);
                centroidMarker = null;
            }
            if (districtOutlineLayer) {
                map.removeLayer(districtOutlineLayer);
                districtOutlineLayer = null;
            }
            if (comparisonMarkersGroup) {
                comparisonMarkersGroup.clearLayers();
            }

            if (mapMode === 'leaflet') {
                // Ensure base tile layer is visible
                if (!map.hasLayer(baseTileLayer)) {
                    baseTileLayer.addTo(map);
                }

                // Find geojson feature for this mandal within allowed districts
                const feature = rawGeojsonData.features.find(f => {
                    const fKey = sanitize(f.properties.mandal || '');
                    const districtName = (f.properties.district || '').toLowerCase();

                    // Check exclusions
                    const isExcluded = exclusions.some(ex => 
                        fKey === sanitize(ex.mandal) && districtName === ex.district
                    );
                    if (isExcluded) return false;

                    // Restrict to Nellore & Chittoor source districts
                    if (districtName !== 'chittoor' && districtName !== 'sri potti sriramulu nellore') {
                        return false;
                    }

                    return fKey === currentMandalKey;
                });

                if (feature) {
                    // Render mandal boundary
                    currentMandalLayer = L.geoJSON(feature, {
                        style: {
                            color: '#f97316', // Bold orange border
                            weight: 3,
                            fillColor: '#38bdf8', // Sleek blue fill
                            fillOpacity: 0.15
                        }
                    }).addTo(map);

                    // Zoom to mandal bounds
                    map.fitBounds(currentMandalLayer.getBounds(), { padding: [30, 30] });

                    // Centroid Marker setup
                    const centroid = getCentroid(feature) || currentMandalLayer.getBounds().getCenter();
                    let statusColor = '#ef4444'; // Red
                    if (coveragePercent >= 120) statusColor = '#10b981'; // Green
                    else if (coveragePercent >= 80) statusColor = '#f59e0b'; // Amber

                    centroidMarker = L.circleMarker(centroid, {
                        radius: 10,
                        fillColor: statusColor,
                        color: '#0f172a',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    }).addTo(map);

                    centroidMarker.bindTooltip(`
                        <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#38bdf8;">${currentMandalName}</div>
                        <div>Coverage: <strong>${coveragePercent}%</strong></div>
                        <div>Hospitals (Avail/Req): <strong>${availableHospitals} / ${requiredHospitals}</strong></div>
                        <div>Active Cases (${currentDisease}): <strong>${totalCases}</strong></div>
                    `, {
                        direction: 'top',
                        className: 'custom-mandal-tooltip',
                        permanent: true
                    });
                }
            } else if (mapMode === 'outline') {
                // Hide base tile layer
                if (map.hasLayer(baseTileLayer)) {
                    map.removeLayer(baseTileLayer);
                }

                // Filter and draw the full Tirupati district outline map
                const districtFeatures = rawGeojsonData.features.filter(f => {
                    const fKey = sanitize(f.properties.mandal || '');
                    const districtName = (f.properties.district || '').toLowerCase();

                    // Check exclusions
                    const isExcluded = exclusions.some(ex => 
                        fKey === sanitize(ex.mandal) && districtName === ex.district
                    );
                    if (isExcluded) return false;

                    // Restrict to Nellore & Chittoor source districts
                    if (districtName !== 'chittoor' && districtName !== 'sri potti sriramulu nellore') {
                        return false;
                    }

                    // Check if this mandal is in allowedMandals list
                    return allowedMandals.some(am => am.key === fKey);
                });

                districtOutlineLayer = L.geoJSON(districtFeatures, {
                    style: (f) => {
                        const fKey = sanitize(f.properties.mandal || '');
                        const isSelected = (fKey === currentMandalKey);
                        return {
                            color: '#f97316', // Orange border
                            weight: isSelected ? 3 : 1.5,
                            fillColor: isSelected ? '#38bdf8' : '#1e293b',
                            fillOpacity: isSelected ? 0.25 : 0.05
                        };
                    }
                }).addTo(map);

                // Zoom to district bounds
                map.fitBounds(districtOutlineLayer.getBounds(), { padding: [30, 30] });

                // Render comparison markers if active
                if (showComparisonMarkers) {
                    // Get selected rate
                    const dItemSel = diseaseData[currentDisease][currentMandalKey];
                    const selectedRate = dItemSel ? (Number(dItemSel[currentCompareMetric]) || 0) : 0;
                    let unitSuffix = '%';
                    if (currentCompareMetric === 'death_ratio' && currentDisease === 'dengue') {
                        unitSuffix = '‰';
                    }

                    // Add a marker for each allowed mandal
                    districtFeatures.forEach(f => {
                        const fKey = sanitize(f.properties.mandal || '');
                        const dItem = diseaseData[currentDisease][fKey];
                        const rate = dItem ? (Number(dItem[currentCompareMetric]) || 0) : 0;

                        const centroid = getCentroid(f) || L.geoJSON(f).getBounds().getCenter();
                        if (!centroid) return;

                        let color = '#64748b'; // Equal (grey)
                        let statusText = 'Equal';
                        let isSelf = (fKey === currentMandalKey);

                        if (isSelf) {
                            color = '#38bdf8'; // Selected (blue)
                            statusText = 'Selected Mandal';
                        } else if (rate > selectedRate) {
                            color = '#f43f5e'; // Higher (red)
                            statusText = 'Higher Rate';
                        } else if (rate < selectedRate) {
                            color = '#10b981'; // Lower (green)
                            statusText = 'Lower Rate';
                        }

                        const marker = L.circleMarker(centroid, {
                            radius: isSelf ? 10 : 7,
                            fillColor: color,
                            color: '#0f172a',
                            weight: isSelf ? 3 : 1.5,
                            opacity: 1,
                            fillOpacity: 0.95
                        });

                        const metricLabel = currentCompareMetric.replace('_', ' ').toUpperCase();
                        marker.bindTooltip(`
                            <div style="font-weight:600; font-size:13px; margin-bottom:4px; color:${color};">${f.properties.mandal}</div>
                            <div>${metricLabel}: <strong>${rate.toFixed(2)}${unitSuffix}</strong></div>
                            <div style="margin-top:4px; font-size:11px; opacity:0.85; border-top:1px solid rgba(255,255,255,0.1); padding-top:2px;">
                                ${isSelf ? 'Selected Mandal' : `${statusText} than ${currentMandalName}`}
                            </div>
                        `, {
                            direction: 'top',
                            className: 'custom-mandal-tooltip'
                        });

                        comparisonMarkersGroup.addLayer(marker);
                    });
                } else if (showFacilityMarkers) {
                    const selFac = hospitalsData[currentMandalKey] ? (Number(hospitalsData[currentMandalKey].total_health_facilities) || 0) : 0;

                    districtFeatures.forEach(f => {
                        const fKey = sanitize(f.properties.mandal || '');
                        const fac = hospitalsData[fKey] ? (Number(hospitalsData[fKey].total_health_facilities) || 0) : 0;
                        const diff = fac - selFac;

                        const centroid = getCentroid(f) || L.geoJSON(f).getBounds().getCenter();
                        if (!centroid) return;

                        let color = '#64748b'; // Equal (grey)
                        let statusText = 'Equal Facilities';
                        let isSelf = (fKey === currentMandalKey);

                        if (isSelf) {
                            color = '#38bdf8'; // Selected (blue)
                            statusText = 'Selected Mandal';
                        } else if (diff > 0) {
                            color = '#10b981'; // More facilities (green)
                            statusText = `More Facilities (+${diff})`;
                        } else if (diff < 0) {
                            color = '#f43f5e'; // Fewer facilities (red)
                            statusText = `Fewer Facilities (${diff})`;
                        }

                        const marker = L.circleMarker(centroid, {
                            radius: isSelf ? 10 : 7,
                            fillColor: color,
                            color: '#0f172a',
                            weight: isSelf ? 3 : 1.5,
                            opacity: 1,
                            fillOpacity: 0.95
                        });

                        marker.bindTooltip(`
                            <div style="font-weight:600; font-size:13px; margin-bottom:4px; color:${color};">${f.properties.mandal}</div>
                            <div>Total Facilities: <strong>${fac}</strong></div>
                            <div>Selected (${currentMandalName}): <strong>${selFac}</strong></div>
                            <div style="margin-top:4px; font-size:11px; opacity:0.85; border-top:1px solid rgba(255,255,255,0.1); padding-top:2px;">
                                ${isSelf ? 'Selected Mandal' : `${statusText}`}
                            </div>
                        `, {
                            direction: 'top',
                            className: 'custom-mandal-tooltip'
                        });

                        comparisonMarkersGroup.addLayer(marker);
                    });
                }
            }
        }
    }

    function updateDonutChartFromMetric() {
        const dItem = diseaseData[currentDisease][currentMandalKey];
        const selectedRate = dItem ? (Number(dItem[currentCompareMetric]) || 0) : 0;
        console.log("Updating comparison donut chart: Mandal =", currentMandalKey, "| Disease =", currentDisease, "| Metric =", currentCompareMetric, "| Rate =", selectedRate);
        updateDonutChart(selectedRate);
    }

    // Donut Chart: Compare selected mandal's rate against all others based on selected metric
    function updateDonutChart(selectedRate) {
        let higher = 0;
        let lower = 0;
        let equal = 0;

        allowedMandals.forEach(m => {
            if (m.key === currentMandalKey) return; // skip self
            const dItem = diseaseData[currentDisease][m.key];
            if (!dItem) return;
            const rate = Number(dItem[currentCompareMetric]) || 0;
            if (rate > selectedRate) higher++;
            else if (rate < selectedRate) lower++;
            else equal++;
        });

        const total = higher + lower + equal;
        const higherPct = total > 0 ? Math.round((higher / total) * 100) : 0;
        const lowerPct = total > 0 ? Math.round((lower / total) * 100) : 0;
        const equalPct = total > 0 ? Math.round((equal / total) * 100) : 0;

        // Update legend counts with percentages
        const higherEl = document.getElementById('donut-higher-count');
        const lowerEl = document.getElementById('donut-lower-count');
        const equalEl = document.getElementById('donut-equal-count');

        if (higherEl) higherEl.textContent = `${higher} (${higherPct}%)`;
        if (lowerEl) lowerEl.textContent = `${lower} (${lowerPct}%)`;
        if (equalEl) equalEl.textContent = `${equal} (${equalPct}%)`;

        const labelsMap = {
            'incidence_ratio': 'Incidence Ratio',
            'recovery_ratio': 'Recovery Ratio',
            'death_ratio': 'Death Ratio'
        };

        const labelEl = document.getElementById('donut-selected-label');
        const valEl = document.getElementById('donut-selected-val');

        if (labelEl) {
            labelEl.textContent = labelsMap[currentCompareMetric] || 'Ratio';
        }

        let suffix = '%';
        if (currentCompareMetric === 'death_ratio' && currentDisease === 'dengue') {
            suffix = '‰';
        }
        document.getElementById('donut-selected-rate').textContent = selectedRate.toFixed(2) + suffix;

        if (valEl) {
            valEl.textContent = selectedRate.toFixed(2) + suffix;
        }

        // Build conic-gradient for donut
        if (total === 0) {
            document.getElementById('donut-chart').style.background = 'conic-gradient(#64748b 0deg 360deg)';
            return;
        }

        const higherDeg = (higher / total) * 360;
        const lowerDeg = (lower / total) * 360;
        // equal takes the rest

        const gradient = `conic-gradient(
            #f43f5e 0deg ${higherDeg}deg,
            #10b981 ${higherDeg}deg ${higherDeg + lowerDeg}deg,
            #64748b ${higherDeg + lowerDeg}deg 360deg
        )`;
        document.getElementById('donut-chart').style.background = gradient;
    }

    function updateFacilitiesComparisonTable() {
        const selFac = hospitalsData[currentMandalKey] ? (Number(hospitalsData[currentMandalKey].total_health_facilities) || 0) : 0;
        
        let greaterList = [];
        let lessList = [];
        let maxAbsDiff = 1;

        allowedMandals.forEach(m => {
            if (m.key === currentMandalKey) return;
            const fac = hospitalsData[m.key] ? (Number(hospitalsData[m.key].total_health_facilities) || 0) : 0;
            const diff = fac - selFac;
            const absDiff = Math.abs(diff);
            if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;

            const entry = {
                name: m.name,
                key: m.key,
                fac: fac,
                selFac: selFac,
                diff: diff
            };

            if (diff > 0) {
                greaterList.push(entry);
            } else if (diff < 0) {
                lessList.push(entry);
            }
        });

        greaterList.sort((a, b) => b.diff - a.diff);
        lessList.sort((a, b) => a.diff - b.diff);

        const countGreaterEl = document.getElementById('count-greater');
        const countLessEl = document.getElementById('count-less');
        if (countGreaterEl) countGreaterEl.textContent = greaterList.length;
        if (countLessEl) countLessEl.textContent = lessList.length;

        const tbody = document.getElementById('facilities-compare-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const activeList = currentFacilityTab === 'greater' ? greaterList : lessList;

        if (activeList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 20px;">No mandals found.</td></tr>`;
            return;
        }

        activeList.forEach(item => {
            const tr = document.createElement('tr');
            const isPos = item.diff > 0;
            const sign = isPos ? '+' : '';
            const pct = Math.min(100, Math.round((Math.abs(item.diff) / maxAbsDiff) * 100));

            tr.innerHTML = `
                <td><strong>${item.name}</strong></td>
                <td>${item.fac}</td>
                <td>${item.selFac}</td>
                <td>
                    <div class="diff-bar-container">
                        <span class="diff-bar-value" style="color: ${isPos ? '#10b981' : '#f43f5e'}">${sign}${item.diff}</span>
                        <div class="diff-bar-track">
                            <div class="diff-bar-fill ${isPos ? 'positive' : 'negative'}" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
});
