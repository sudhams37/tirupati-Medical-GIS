document.addEventListener('DOMContentLoaded', () => {
    // Initialize the map, centered on Andhra Pradesh
    const map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([13.6, 79.4], 9);

    // Add zoom control to top right
    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    let legendControl;
    let selectedLayer = null;
    let currentFilteredFeatures = [];

    // Define the base map tile layer (light/white theme)
    const baseTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20
    });

    // Handle Map Mode Buttons
    const btnOutline = document.getElementById('btn-outline');
    const btnLeaflet = document.getElementById('btn-leaflet');

    btnOutline.addEventListener('click', () => {
        if (map.hasLayer(baseTileLayer)) {
            map.removeLayer(baseTileLayer);
        }
        btnOutline.classList.add('active');
        btnLeaflet.classList.remove('active');
    });

    btnLeaflet.addEventListener('click', () => {
        if (!map.hasLayer(baseTileLayer)) {
            baseTileLayer.addTo(map);
            if (geojsonLayer) geojsonLayer.bringToFront();
        }
        btnLeaflet.classList.add('active');
        btnOutline.classList.remove('active');
    });

    let geojsonLayer;
    let rawGeojsonData;
    let allowedMandalsList = [];
    let aboveAvgMarkersGroup = null;

    // Store parsed disease data
    let diseaseData = {
        dengue: {},
        malaria: {}
    };

    // Store parsed hospitals/medical facilities data
    let hospitalsData = {};

    // Current State
    let currentDisease = 'dengue';
    let currentMetric = 'total no of cases';

    // UI elements
    const analysisMandalEl = document.getElementById('analysis-mandal');
    const valIncidenceEl = document.getElementById('val-incidence');
    const valRecoveryEl = document.getElementById('val-recovery');
    const valDeathEl = document.getElementById('val-death');

    const diseaseSelect = document.getElementById('disease-select');
    const metricSelect = document.getElementById('metric-select');
    const compareRateSelect = document.getElementById('compare-rate-select');
    const analysisRateSelect = document.getElementById('analysis-rate-select');

    let currentCompareRate = 'death_ratio';
    let currentAnalysisRate = 'incidence_ratio';
    let showOnlyAboveAverageCases = false;
    let showOnlyAboveAverageRates = false;
    let showOnlyAboveAverageHospitals = false;
    let showOnlyHealthcareRanking = false;

    function sanitize(str) {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/thi/g, 'ti')
            .replace(/palli/g, 'palle')
            .replace(/pet$/g, 'peta');
    }

    // Helper to calculate the true centroid of a GeoJSON feature (Polygon or MultiPolygon)
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
        
        let area = 0;
        let cx = 0;
        let cy = 0;
        
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
            // Fallback to simple average centroid
            let sumLat = 0, sumLng = 0;
            pts.forEach(p => {
                sumLng += p[0];
                sumLat += p[1];
            });
            return L.latLng(sumLat / pts.length, sumLng / pts.length);
        }
    }

    // Fetch all datasets: GeoJSON, Mandals list, Dengue data, Malaria data, and Hospitals data
    const timestamp = new Date().getTime();
    Promise.all([
        fetch(`datasets/ap_mandals.geojson?v=${timestamp}`).then(r => r.json()),
        fetch(`datasets/tirupati-district-mandals.txt?v=${timestamp}`).then(r => r.text()),
        fetch(`datasets/dengue.json?v=${timestamp}`).then(r => r.json()),
        fetch(`datasets/malaria.json?v=${timestamp}`).then(r => r.json()),
        fetch(`datasets/mandal wise no of hospitals.json?v=${timestamp}`).then(r => r.json())
    ])
    .then(([geojson, mandalsText, dengueList, malariaList, hospitalsList]) => {
        rawGeojsonData = geojson;

        // Parse allowed mandals
        const allowedMandalsRaw = mandalsText.split('\n')
            .map(name => sanitize(name))
            .filter(name => name.length > 2);

        const aliases = {
            'kumaravenkatabhupalapuram': 'kvbpuram'
        };
        allowedMandalsList = allowedMandalsRaw.map(m => aliases[m] || m);

        // Populate disease data mappings
        dengueList.forEach(item => {
            const key = sanitize(item.mandal || '');
            const dist = (item['district '] || '').toLowerCase();
            // Discard Thotapalligudur, Krishna's Guduru, and Kurnool's Gudur
            if (key === 'thotapalligudur' || key === 'guduru' || (key === 'gudur' && dist === 'kurnool')) {
                return;
            }
            diseaseData.dengue[key] = item;
        });

        malariaList.forEach(item => {
            const key = sanitize(item.mandal || '');
            const dist = (item['district '] || '').toLowerCase();
            // Discard Thotapalligudur, Krishna's Guduru, and Kurnool's Gudur
            if (key === 'thotapalligudur' || key === 'guduru' || (key === 'gudur' && dist === 'kurnool')) {
                return;
            }
            diseaseData.malaria[key] = item;
        });

        // Populate hospitals data mappings
        hospitalsList.forEach(item => {
            const key = sanitize(item.mandal || '');
            hospitalsData[key] = item;
        });

        // Calculate and display District Totals
        function calculateDistrictTotals() {
            let totalPop = 0;
            let totalVhc = 0;
            let totalPhc = 0;
            let totalUphc = 0;
            let totalChc = 0;
            let totalAh = 0;
            let totalTh = 0;
            let totalFacilities = 0;

            allowedMandalsList.forEach(mKey => {
                const dItem = diseaseData.dengue[mKey];
                if (dItem && dItem.population) {
                    totalPop += Number(dItem.population);
                }

                const hItem = hospitalsData[mKey];
                if (hItem) {
                    totalVhc += hItem.village_health_clinics_vhc || 0;
                    totalPhc += hItem.primary_health_centers_phc || 0;
                    totalUphc += hItem.urban_primary_health_centers_uphc || 0;
                    totalChc += hItem.community_health_centers_chcs || 0;
                    totalAh += hItem.area_hospitals_ahs || 0;
                    totalTh += hItem.teaching_hospitals_ths || 0;
                    totalFacilities += hItem.total_health_facilities || 0;
                }
            });

            if (document.getElementById('dist-total-pop')) {
                document.getElementById('dist-total-pop').textContent = totalPop.toLocaleString();
            }
            if (document.getElementById('dist-total-facilities')) {
                document.getElementById('dist-total-facilities').textContent = totalFacilities.toLocaleString();
            }
            if (document.getElementById('dist-vhc')) {
                document.getElementById('dist-vhc').textContent = totalVhc.toLocaleString();
            }
            if (document.getElementById('dist-phc')) {
                document.getElementById('dist-phc').textContent = totalPhc.toLocaleString();
            }
            if (document.getElementById('dist-uphc')) {
                document.getElementById('dist-uphc').textContent = totalUphc.toLocaleString();
            }
            if (document.getElementById('dist-chc')) {
                document.getElementById('dist-chc').textContent = totalChc.toLocaleString();
            }
            if (document.getElementById('dist-ah')) {
                document.getElementById('dist-ah').textContent = totalAh.toLocaleString();
            }
            if (document.getElementById('dist-th')) {
                document.getElementById('dist-th').textContent = totalTh.toLocaleString();
            }
            if (document.getElementById('dist-avg-facilities')) {
                const avgFacilities = allowedMandalsList.length > 0 ? (totalFacilities / allowedMandalsList.length) : 0;
                document.getElementById('dist-avg-facilities').textContent = Math.round(avgFacilities).toLocaleString();
            }
        }
        calculateDistrictTotals();
        updateHospitalsAnalysis();

        // Add event listeners for dropdowns
        diseaseSelect.addEventListener('change', (e) => {
            currentDisease = e.target.value;
            resetAboveAvgFilter();
            renderGeojson();
        });

        if (compareRateSelect) {
            compareRateSelect.addEventListener('change', (e) => {
                currentCompareRate = e.target.value;
                updateComparisonStats();
            });
        }

        if (analysisRateSelect) {
            analysisRateSelect.addEventListener('change', (e) => {
                currentAnalysisRate = e.target.value;
                resetAboveAvgFilter();
                updateRateAnalysis();
                renderGeojson();
            });
        }

        metricSelect.addEventListener('change', (e) => {
            currentMetric = e.target.value;
            resetAboveAvgFilter();
            renderGeojson();
        });

        const btnShowAboveAvg = document.getElementById('btn-show-above-avg-map');
        if (btnShowAboveAvg) {
            btnShowAboveAvg.addEventListener('click', () => {
                // Mutually exclude other analysis markers
                showOnlyAboveAverageRates = false;
                const btnRates = document.getElementById('btn-show-above-avg-rate-map');
                if (btnRates) {
                    btnRates.textContent = 'Show in Map';
                    btnRates.classList.remove('filtering-active');
                }
                
                showOnlyAboveAverageHospitals = false;
                const btnHosp = document.getElementById('btn-show-above-avg-hospitals-map');
                if (btnHosp) {
                    btnHosp.textContent = 'Show in Map';
                    btnHosp.classList.remove('filtering-active');
                }

                showOnlyHealthcareRanking = false;
                const btnRank = document.getElementById('btn-show-healthcare-ranking-map');
                if (btnRank) {
                    btnRank.textContent = 'Show in Map';
                    btnRank.classList.remove('filtering-active');
                }
 
                showOnlyAboveAverageCases = !showOnlyAboveAverageCases;
                if (showOnlyAboveAverageCases) {
                    btnShowAboveAvg.textContent = 'Show All';
                    btnShowAboveAvg.classList.add('filtering-active');
                } else {
                    btnShowAboveAvg.textContent = 'Show in Map';
                    btnShowAboveAvg.classList.remove('filtering-active');
                }
                renderGeojson();
            });
        }
 
        const btnShowAboveAvgRate = document.getElementById('btn-show-above-avg-rate-map');
        if (btnShowAboveAvgRate) {
            btnShowAboveAvgRate.addEventListener('click', () => {
                // Mutually exclude other analysis markers
                showOnlyAboveAverageCases = false;
                const btnCases = document.getElementById('btn-show-above-avg-map');
                if (btnCases) {
                    btnCases.textContent = 'Show in Map';
                    btnCases.classList.remove('filtering-active');
                }
                
                showOnlyAboveAverageHospitals = false;
                const btnHosp = document.getElementById('btn-show-above-avg-hospitals-map');
                if (btnHosp) {
                    btnHosp.textContent = 'Show in Map';
                    btnHosp.classList.remove('filtering-active');
                }

                showOnlyHealthcareRanking = false;
                const btnRank = document.getElementById('btn-show-healthcare-ranking-map');
                if (btnRank) {
                    btnRank.textContent = 'Show in Map';
                    btnRank.classList.remove('filtering-active');
                }
 
                showOnlyAboveAverageRates = !showOnlyAboveAverageRates;
                if (showOnlyAboveAverageRates) {
                    btnShowAboveAvgRate.textContent = 'Show All';
                    btnShowAboveAvgRate.classList.add('filtering-active');
                } else {
                    btnShowAboveAvgRate.textContent = 'Show in Map';
                    btnShowAboveAvgRate.classList.remove('filtering-active');
                }
                renderGeojson();
            });
        }
 
        const btnShowAboveAvgHospitals = document.getElementById('btn-show-above-avg-hospitals-map');
        if (btnShowAboveAvgHospitals) {
            btnShowAboveAvgHospitals.addEventListener('click', () => {
                // Mutually exclude other analysis markers
                showOnlyAboveAverageCases = false;
                const btnCases = document.getElementById('btn-show-above-avg-map');
                if (btnCases) {
                    btnCases.textContent = 'Show in Map';
                    btnCases.classList.remove('filtering-active');
                }
                
                showOnlyAboveAverageRates = false;
                const btnRates = document.getElementById('btn-show-above-avg-rate-map');
                if (btnRates) {
                    btnRates.textContent = 'Show in Map';
                    btnRates.classList.remove('filtering-active');
                }

                showOnlyHealthcareRanking = false;
                const btnRank = document.getElementById('btn-show-healthcare-ranking-map');
                if (btnRank) {
                    btnRank.textContent = 'Show in Map';
                    btnRank.classList.remove('filtering-active');
                }
 
                showOnlyAboveAverageHospitals = !showOnlyAboveAverageHospitals;
                if (showOnlyAboveAverageHospitals) {
                    btnShowAboveAvgHospitals.textContent = 'Show All';
                    btnShowAboveAvgHospitals.classList.add('filtering-active');
                } else {
                    btnShowAboveAvgHospitals.textContent = 'Show in Map';
                    btnShowAboveAvgHospitals.classList.remove('filtering-active');
                }
                renderGeojson();
            });
        }

        const btnShowHealthcareRanking = document.getElementById('btn-show-healthcare-ranking-map');
        if (btnShowHealthcareRanking) {
            btnShowHealthcareRanking.addEventListener('click', () => {
                // Mutually exclude other analysis markers
                showOnlyAboveAverageCases = false;
                const btnCases = document.getElementById('btn-show-above-avg-map');
                if (btnCases) {
                    btnCases.textContent = 'Show in Map';
                    btnCases.classList.remove('filtering-active');
                }
                
                showOnlyAboveAverageRates = false;
                const btnRates = document.getElementById('btn-show-above-avg-rate-map');
                if (btnRates) {
                    btnRates.textContent = 'Show in Map';
                    btnRates.classList.remove('filtering-active');
                }

                showOnlyAboveAverageHospitals = false;
                const btnHosp = document.getElementById('btn-show-above-avg-hospitals-map');
                if (btnHosp) {
                    btnHosp.textContent = 'Show in Map';
                    btnHosp.classList.remove('filtering-active');
                }

                showOnlyHealthcareRanking = !showOnlyHealthcareRanking;
                if (showOnlyHealthcareRanking) {
                    btnShowHealthcareRanking.textContent = 'Show All';
                    btnShowHealthcareRanking.classList.add('filtering-active');
                } else {
                    btnShowHealthcareRanking.textContent = 'Show in Map';
                    btnShowHealthcareRanking.classList.remove('filtering-active');
                }
                renderGeojson();
            });
        }

        function resetAboveAvgFilter() {
            showOnlyAboveAverageCases = false;
            showOnlyAboveAverageRates = false;
            showOnlyAboveAverageHospitals = false;
            showOnlyHealthcareRanking = false;
            
            const btnCases = document.getElementById('btn-show-above-avg-map');
            if (btnCases) {
                btnCases.textContent = 'Show in Map';
                btnCases.classList.remove('filtering-active');
            }
            
            const btnRates = document.getElementById('btn-show-above-avg-rate-map');
            if (btnRates) {
                btnRates.textContent = 'Show in Map';
                btnRates.classList.remove('filtering-active');
            }
            
            const btnHosp = document.getElementById('btn-show-above-avg-hospitals-map');
            if (btnHosp) {
                btnHosp.textContent = 'Show in Map';
                btnHosp.classList.remove('filtering-active');
            }

            const btnRank = document.getElementById('btn-show-healthcare-ranking-map');
            if (btnRank) {
                btnRank.textContent = 'Show in Map';
                btnRank.classList.remove('filtering-active');
            }
            
            if (aboveAvgMarkersGroup) {
                aboveAvgMarkersGroup.clearLayers();
            }
        }

        renderGeojson();
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

    // Helper to calculate style based on disease metrics (Choropleth styling)
    function getFeatureStyle(feature) {
        const mandalName = sanitize(feature.properties.mandal || '');
        const data = diseaseData[currentDisease][mandalName];
        
        let fillColor = '#cbd5e1'; // Gray/slate if no data
        let fillOpacity = 0.2;

        if (data) {
            const val = Number(data[currentMetric]) || 0;
            // Get minimum and maximum values for precise min-to-max color grading
            const allVals = Object.values(diseaseData[currentDisease]).map(d => Number(d[currentMetric]) || 0);
            const minVal = Math.min(...allVals);
            const maxVal = Math.max(...allVals);
            const range = maxVal - minVal;
            const ratio = range > 0 ? (val - minVal) / range : 0;

            if (currentDisease === 'dengue') {
                // Dengue: Beautiful hot red/orange gradient
                fillColor = ratio > 0.8 ? '#b91c1c' :
                            ratio > 0.6 ? '#ea580c' :
                            ratio > 0.4 ? '#f97316' :
                            ratio > 0.2 ? '#fb923c' :
                                          '#ffedd5';
            } else {
                // Malaria: Gorgeous royal blue gradient
                fillColor = ratio > 0.8 ? '#1e3a8a' :
                            ratio > 0.6 ? '#2563eb' :
                            ratio > 0.4 ? '#3b82f6' :
                            ratio > 0.2 ? '#60a5fa' :
                                          '#dbeafe';
            }
            fillOpacity = 0.75;
        }

        return {
            color: '#1e293b', // Dark slate border for clean gridlines
            weight: 1.5,
            opacity: 0.5,
            fillColor: fillColor,
            fillOpacity: fillOpacity
        };
    }

    // Highlight style on hover
    const highlightStyle = {
        color: '#fbbf24', // Elegant gold border on hover
        weight: 3,
        opacity: 1,
        fillOpacity: 0.85
    };

    function renderGeojson() {
        if (geojsonLayer) {
            map.removeLayer(geojsonLayer);
        }
        selectedLayer = null;
        if (analysisMandalEl) analysisMandalEl.textContent = 'Select a Mandal';
        if (valIncidenceEl) valIncidenceEl.textContent = '-';
        if (valRecoveryEl) valRecoveryEl.textContent = '-';
        if (valDeathEl) valDeathEl.textContent = '-';
        
        // Reset the comparative analysis chart
        resetComparisonChart();

        // Reset Facility Density Panel
        const densityContainer = document.getElementById('facility-density-container');
        if (densityContainer) {
            densityContainer.innerHTML = `
                <div class="density-placeholder">
                    <p>Select a Mandal on the map to analyze Facility Density and Population Coverage</p>
                </div>
            `;
        }

        const exclusions = [
            { mandal: 'venkatagirikota', district: 'chittoor' },
            { mandal: 'koduru', district: 'krishna' },
            { mandal: 'ramachandrapuram', district: 'east godavari' },
            { mandal: 'vararamachandrapuram', district: 'east godavari' },
            { mandal: 'thotapalligudur', district: 'sri potti sriramulu nellore' },
            { mandal: 'guduru', district: 'krishna' },
            { mandal: 'gudur', district: 'kurnool' }
        ];

        // Filter the GeoJSON features based on the mandals list
        const filteredFeatures = rawGeojsonData.features.filter(feature => {
            const mandalName = sanitize(feature.properties.mandal || '');
            const districtName = (feature.properties.district || '').toLowerCase();

            // Check exclusions
            const isExcluded = exclusions.some(ex => 
                mandalName === sanitize(ex.mandal) && districtName === ex.district
            );
            if (isExcluded) return false;

            // Restrict to Nellore & Chittoor source districts to avoid overlaps (e.g. Gudur in Kurnool)
            if (districtName !== 'chittoor' && districtName !== 'sri potti sriramulu nellore') {
                return false;
            }

            return allowedMandalsList.some(allowed => mandalName === allowed);
        });

        // Calculate average cases and threshold stats across all active mandals first
        const mandalValues = filteredFeatures.map(feature => {
            const mandalKey = sanitize(feature.properties.mandal || '');
            const data = diseaseData[currentDisease][mandalKey];
            return data ? (Number(data[currentMetric]) || 0) : 0;
        });

        const totalMandals = mandalValues.length;
        let avgCases = 0;
        let aboveAvgCount = 0;
        let aboveAvgPercent = 0;

        if (totalMandals > 0) {
            const sumCases = mandalValues.reduce((sum, val) => sum + val, 0);
            avgCases = sumCases / totalMandals;
            aboveAvgCount = mandalValues.filter(val => val > avgCases).length;
            aboveAvgPercent = (aboveAvgCount / totalMandals) * 100;
        }

        // Keep track of the full list of filtered features for other components (like rate analysis)
        currentFilteredFeatures = [...filteredFeatures];

        const filteredData = {
            ...rawGeojsonData,
            features: filteredFeatures
        };

        geojsonLayer = L.geoJSON(filteredData, {
            style: getFeatureStyle,
            onEachFeature: onEachFeature
        }).addTo(map);

        if (filteredFeatures.length > 0) {
            map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });
        } else {
            if (analysisMandalEl) analysisMandalEl.textContent = 'No matching mandals found';
        }
        
        // Render or update the color gradient legend
        updateLegend();

        // Handle Above Average Markers Group
        if (!aboveAvgMarkersGroup) {
            aboveAvgMarkersGroup = L.featureGroup().addTo(map);
        }
        aboveAvgMarkersGroup.clearLayers();
        
        if (showOnlyAboveAverageCases) {
            geojsonLayer.eachLayer(layer => {
                const feature = layer.feature;
                const mandalKey = sanitize(feature.properties.mandal || '');
                const data = diseaseData[currentDisease][mandalKey];
                const val = data ? (Number(data[currentMetric]) || 0) : 0;
                if (val > avgCases) {
                    const center = getCentroid(feature) || layer.getBounds().getCenter();
                    const marker = L.circleMarker(center, {
                        radius: 8,
                        fillColor: '#f97316', // orange matching above-avg slice
                        color: '#0f172a',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    });
                    
                    // Bind descriptive tooltip to the marker
                    marker.bindTooltip(`<strong>${feature.properties.mandal || 'Mandal'}</strong><br>${currentMetric}: ${val}<br>(Above Avg: ${Math.round(avgCases)})`, {
                        direction: 'top',
                        className: 'custom-mandal-tooltip'
                    });
                    
                    aboveAvgMarkersGroup.addLayer(marker);
                }
            });
        } else if (showOnlyAboveAverageRates) {
            // Calculate avgRate
            const mandalRates = filteredFeatures.map(feature => {
                const mandalKey = sanitize(feature.properties.mandal || '');
                const data = diseaseData[currentDisease][mandalKey];
                return data ? (Number(data[currentAnalysisRate]) || 0) : 0;
            });
            const totalMandalsRate = mandalRates.length;
            let avgRate = 0;
            if (totalMandalsRate > 0) {
                avgRate = mandalRates.reduce((sum, val) => sum + val, 0) / totalMandalsRate;
            }

            let unitSuffix = '%';
            if (currentAnalysisRate === 'death_ratio') {
                unitSuffix = '‰';
            }

            geojsonLayer.eachLayer(layer => {
                const feature = layer.feature;
                const mandalKey = sanitize(feature.properties.mandal || '');
                const data = diseaseData[currentDisease][mandalKey];
                const val = data ? (Number(data[currentAnalysisRate]) || 0) : 0;
                if (val > avgRate) {
                    const center = getCentroid(feature) || layer.getBounds().getCenter();
                    const marker = L.circleMarker(center, {
                        radius: 8,
                        fillColor: '#f97316', // orange matching above-avg slice
                        color: '#0f172a',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    });
                    
                    const rateLabel = currentAnalysisRate.replace('_', ' ').toUpperCase();
                    marker.bindTooltip(`<strong>${feature.properties.mandal || 'Mandal'}</strong><br>${rateLabel}: ${val.toFixed(2)}${unitSuffix}<br>(Above Avg: ${avgRate.toFixed(2)}${unitSuffix})`, {
                        direction: 'top',
                        className: 'custom-mandal-tooltip'
                    });
                    
                    aboveAvgMarkersGroup.addLayer(marker);
                }
            });
        } else if (showOnlyAboveAverageHospitals) {
            // Calculate avgHospitals based on all 34 mandals
            const hospitalValues = allowedMandalsList.map(mKey => {
                const hItem = hospitalsData[mKey];
                return hItem ? (Number(hItem.total_health_facilities) || 0) : 0;
            });
            const totalHospMandals = allowedMandalsList.length;
            let avgHospitals = 0;
            if (totalHospMandals > 0) {
                avgHospitals = hospitalValues.reduce((sum, val) => sum + val, 0) / totalHospMandals;
            }

            geojsonLayer.eachLayer(layer => {
                const feature = layer.feature;
                const mandalKey = sanitize(feature.properties.mandal || '');
                const hItem = hospitalsData[mandalKey];
                const val = hItem ? (Number(hItem.total_health_facilities) || 0) : 0;
                if (val > avgHospitals) {
                    const center = getCentroid(feature) || layer.getBounds().getCenter();
                    const marker = L.circleMarker(center, {
                        radius: 8,
                        fillColor: '#f97316', // orange matching above-avg slice
                        color: '#0f172a',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 1
                    });
                    
                    marker.bindTooltip(`<strong>${feature.properties.mandal || 'Mandal'}</strong><br>Health Facilities: ${val}<br>(Above Avg: ${Math.round(avgHospitals)})`, {
                        direction: 'top',
                        className: 'custom-mandal-tooltip'
                    });
                    
                    aboveAvgMarkersGroup.addLayer(marker);
                }
            });
        } else if (showOnlyHealthcareRanking) {
            geojsonLayer.eachLayer(layer => {
                const feature = layer.feature;
                const mandalKey = sanitize(feature.properties.mandal || '');
                const hItem = hospitalsData[mandalKey];
                const dItem = diseaseData[currentDisease][mandalKey];
                
                const population = dItem ? (Number(dItem.population) || 0) : 0;
                const availableHospitals = hItem ? ((Number(hItem.total_health_facilities) || 0) - (Number(hItem.village_health_clinics_vhc) || 0)) : 0;
                
                const floatRequired = population / 50000;
                const requiredHospitals = Math.max(1, Math.round(floatRequired));
                
                let coveragePercent = 0;
                if (floatRequired > 0) {
                    coveragePercent = Math.round((availableHospitals / floatRequired) * 100);
                }
                
                let status = 'Critical';
                let markerColor = '#ef4444'; // Red
                if (coveragePercent >= 120) {
                    status = 'Sufficient';
                    markerColor = '#10b981'; // Green
                } else if (coveragePercent >= 80) {
                    status = 'Moderate';
                    markerColor = '#f59e0b'; // Amber/Yellow
                }
                
                const center = getCentroid(feature) || layer.getBounds().getCenter();
                const marker = L.circleMarker(center, {
                    radius: 8,
                    fillColor: markerColor,
                    color: '#0f172a',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 1
                });
                
                marker.bindTooltip(`<strong>${feature.properties.mandal || 'Mandal'}</strong><br>Coverage: ${coveragePercent}%<br>Hospitals (Avail/Req): ${availableHospitals} / ${requiredHospitals}<br>Status: ${status}`, {
                    direction: 'top',
                    className: 'custom-mandal-tooltip'
                });
                
                aboveAvgMarkersGroup.addLayer(marker);
            });
        }

        const valAvgCasesEl = document.getElementById('val-avg-cases');
        const valAboveAvgCountEl = document.getElementById('val-above-avg-count');
        const valAboveAvgPercentEl = document.getElementById('val-above-avg-percent');

        if (valAvgCasesEl) valAvgCasesEl.textContent = Math.round(avgCases).toLocaleString();
        if (valAboveAvgCountEl) valAboveAvgCountEl.textContent = `${aboveAvgCount} Mandals`;
        if (valAboveAvgPercentEl) valAboveAvgPercentEl.textContent = `${aboveAvgPercent.toFixed(1)}%`;

        // Draw the above average pie chart
        drawAboveAvgPieChart(aboveAvgCount, totalMandals - aboveAvgCount);

        // Run rate analysis updates
        updateRateAnalysis();

        // Calculate and populate active disease mini KPI values in the sidebar grid
        let totalDiseaseCases = 0;
        let totalDiseaseConfirmed = 0;
        let totalDiseaseRecovered = 0;
        let totalDiseaseDeaths = 0;
        
        let sumIncidence = 0;
        let sumRecovery = 0;
        let sumDeath = 0;
        let countedMandals = 0;

        filteredFeatures.forEach(feature => {
            const mandalKey = sanitize(feature.properties.mandal || '');
            const data = diseaseData[currentDisease][mandalKey];
            if (data) {
                totalDiseaseCases += (Number(data['total no of cases']) || 0);
                totalDiseaseConfirmed += (Number(data['confirmed cases']) || 0);
                totalDiseaseRecovered += (Number(data['recovered cases']) || 0);
                totalDiseaseDeaths += (Number(data['death cases']) || 0);
                
                sumIncidence += (Number(data.incidence_ratio) || 0);
                sumRecovery += (Number(data.recovery_ratio) || 0);
                sumDeath += (Number(data.death_ratio) || 0);
                countedMandals++;
            }
        });

        const avgIncidence = countedMandals > 0 ? (sumIncidence / countedMandals) : 0;
        const avgRecovery = countedMandals > 0 ? (sumRecovery / countedMandals) : 0;
        const avgDeath = countedMandals > 0 ? (sumDeath / countedMandals) : 0;

        const kpiMiniCasesEl = document.getElementById('kpi-mini-cases');
        const kpiMiniConfirmedEl = document.getElementById('kpi-mini-confirmed');
        const kpiMiniRecoveredEl = document.getElementById('kpi-mini-recovered');
        const kpiMiniDeathsEl = document.getElementById('kpi-mini-deaths');
        
        const kpiMiniAvgIncidenceEl = document.getElementById('kpi-mini-avg-incidence');
        const kpiMiniAvgRecoveryEl = document.getElementById('kpi-mini-avg-recovery');
        const kpiMiniAvgDeathEl = document.getElementById('kpi-mini-avg-death');
        const kpiMiniMandalsEl = document.getElementById('kpi-mini-mandals');

        if (kpiMiniCasesEl) kpiMiniCasesEl.textContent = totalDiseaseCases.toLocaleString();
        if (kpiMiniConfirmedEl) kpiMiniConfirmedEl.textContent = totalDiseaseConfirmed.toLocaleString();
        if (kpiMiniRecoveredEl) kpiMiniRecoveredEl.textContent = totalDiseaseRecovered.toLocaleString();
        if (kpiMiniDeathsEl) kpiMiniDeathsEl.textContent = totalDiseaseDeaths.toLocaleString();
        
        if (kpiMiniAvgIncidenceEl) kpiMiniAvgIncidenceEl.textContent = `${avgIncidence.toFixed(1)}%`;
        if (kpiMiniAvgRecoveryEl) kpiMiniAvgRecoveryEl.textContent = `${avgRecovery.toFixed(1)}%`;
        if (kpiMiniAvgDeathEl) kpiMiniAvgDeathEl.textContent = `${avgDeath.toFixed(1)}‰`;
        if (kpiMiniMandalsEl) kpiMiniMandalsEl.textContent = countedMandals.toLocaleString();
        
        // Update hospitals analysis stats and pie chart
        updateHospitalsAnalysis();
        updateRankingTable();
    }

    function updateRateAnalysis() {
        if (!currentFilteredFeatures || currentFilteredFeatures.length === 0) return;
        
        const mandalRates = currentFilteredFeatures.map(feature => {
            const mandalKey = sanitize(feature.properties.mandal || '');
            const data = diseaseData[currentDisease][mandalKey];
            return data ? (Number(data[currentAnalysisRate]) || 0) : 0;
        });

        const totalMandals = mandalRates.length;
        let avgRate = 0;
        let aboveAvgCount = 0;
        let aboveAvgPercent = 0;

        if (totalMandals > 0) {
            const sumRates = mandalRates.reduce((sum, val) => sum + val, 0);
            avgRate = sumRates / totalMandals;
            aboveAvgCount = mandalRates.filter(val => val > avgRate).length;
            aboveAvgPercent = (aboveAvgCount / totalMandals) * 100;
        }

        const labelAvgRateEl = document.getElementById('label-avg-rate');
        const valAvgIncidentRateEl = document.getElementById('val-avg-incident-rate');
        const valAboveAvgIncidentCountEl = document.getElementById('val-above-avg-incident-count');
        const valAboveAvgIncidentPercentEl = document.getElementById('val-above-avg-incident-percent');

        if (labelAvgRateEl) {
            if (currentAnalysisRate === 'incidence_ratio') {
                labelAvgRateEl.textContent = 'Avg Incident Rate:';
            } else if (currentAnalysisRate === 'recovery_ratio') {
                labelAvgRateEl.textContent = 'Avg Recovery Rate:';
            } else {
                labelAvgRateEl.textContent = 'Avg Death Rate:';
            }
        }

        let unitSuffix = '%';
        if (currentAnalysisRate === 'death_ratio') {
            unitSuffix = '‰';
        }

        if (valAvgIncidentRateEl) valAvgIncidentRateEl.textContent = `${avgRate.toFixed(2)}${unitSuffix}`;
        if (valAboveAvgIncidentCountEl) valAboveAvgIncidentCountEl.textContent = aboveAvgCount.toLocaleString();
        if (valAboveAvgIncidentPercentEl) valAboveAvgIncidentPercentEl.textContent = `${aboveAvgPercent.toFixed(1)}%`;

        // Draw the above average incident rate pie chart
        drawAboveAvgIncidentPieChart(aboveAvgCount, totalMandals - aboveAvgCount);
    }

    function drawAboveAvgPieChart(above, below) {
        const canvas = document.getElementById('above-avg-pie-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        if (above === 0 && below === 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();
            return;
        }
        
        const total = above + below;
        const aboveAngle = (above / total) * 2 * Math.PI;
        const belowAngle = (below / total) * 2 * Math.PI;
        
        // Draw Above Average slice (orange/warning)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + aboveAngle);
        ctx.closePath();
        ctx.fillStyle = '#f97316';
        ctx.fill();
        
        // Draw Below/Equal Average slice (sky blue)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2 + aboveAngle, -Math.PI / 2 + aboveAngle + belowAngle);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        
        // Donut punch out
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f172a'; // Match container dark background color
        ctx.fill();
        
        // Text inside donut
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${above}/${total}`, centerX, centerY - 6);
        ctx.font = '600 9px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ABOVE AVG', centerX, centerY + 10);
    }

    function drawAboveAvgIncidentPieChart(above, below) {
        const canvas = document.getElementById('above-avg-incident-pie-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        if (above === 0 && below === 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();
            return;
        }
        
        const total = above + below;
        const aboveAngle = (above / total) * 2 * Math.PI;
        const belowAngle = (below / total) * 2 * Math.PI;
        
        // Draw Above Average slice (orange/warning)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + aboveAngle);
        ctx.closePath();
        ctx.fillStyle = '#f97316';
        ctx.fill();
        
        // Draw Below/Equal Average slice (sky blue)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2 + aboveAngle, -Math.PI / 2 + aboveAngle + belowAngle);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        
        // Donut punch out
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f172a'; // Match container dark background color
        ctx.fill();
        
        // Text inside donut
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${above}/${total}`, centerX, centerY - 6);
        ctx.font = '600 9px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ABOVE AVG', centerX, centerY + 10);
    }

    function updateHospitalsAnalysis() {
        if (!allowedMandalsList || allowedMandalsList.length === 0) return;

        const hospitalValues = allowedMandalsList.map(mKey => {
            const hItem = hospitalsData[mKey];
            return hItem ? (Number(hItem.total_health_facilities) || 0) : 0;
        });

        const totalHospMandals = allowedMandalsList.length; // Always 34
        let avgHospitals = 0;
        let aboveAvgHospCount = 0;
        let aboveAvgHospPercent = 0;

        if (totalHospMandals > 0) {
            const sumHospitals = hospitalValues.reduce((sum, val) => sum + val, 0);
            avgHospitals = sumHospitals / totalHospMandals;
            aboveAvgHospCount = hospitalValues.filter(val => val > avgHospitals).length;
            aboveAvgHospPercent = (aboveAvgHospCount / totalHospMandals) * 100;
        }

        const valAvgHospitalsEl = document.getElementById('val-avg-hospitals');
        const valAboveAvgHospitalsCountEl = document.getElementById('val-above-avg-hospitals-count');
        const valAboveAvgHospitalsPercentEl = document.getElementById('val-above-avg-hospitals-percent');

        if (valAvgHospitalsEl) valAvgHospitalsEl.textContent = Math.round(avgHospitals).toLocaleString();
        if (valAboveAvgHospitalsCountEl) valAboveAvgHospitalsCountEl.textContent = aboveAvgHospCount.toLocaleString();
        if (valAboveAvgHospitalsPercentEl) valAboveAvgHospitalsPercentEl.textContent = `${aboveAvgHospPercent.toFixed(1)}%`;

        drawAboveAvgHospitalsPieChart(aboveAvgHospCount, totalHospMandals - aboveAvgHospCount);
    }

    function drawAboveAvgHospitalsPieChart(above, below) {
        const canvas = document.getElementById('above-avg-hospitals-pie-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        if (above === 0 && below === 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();
            return;
        }
        
        const total = above + below;
        const aboveAngle = (above / total) * 2 * Math.PI;
        const belowAngle = (below / total) * 2 * Math.PI;
        
        // Draw Above Average slice (orange/warning)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + aboveAngle);
        ctx.closePath();
        ctx.fillStyle = '#f97316';
        ctx.fill();
        
        // Draw Below/Equal Average slice (sky blue)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2 + aboveAngle, -Math.PI / 2 + aboveAngle + belowAngle);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        
        // Donut punch out
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f172a'; // Match container dark background color
        ctx.fill();
        
        // Text inside donut
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${above}/${total}`, centerX, centerY - 6);
        ctx.font = '600 9px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('ABOVE AVG', centerX, centerY + 10);
    }

    function onEachFeature(feature, layer) {
        const props = feature.properties;
        const mandalName = props.mandal || 'Unknown Mandal';
        const districtName = 'Tirupati';
        const mandalKey = sanitize(mandalName);
        const data = diseaseData[currentDisease][mandalKey];

        const metricLabel = metricSelect.options[metricSelect.selectedIndex].text;
        const metricVal = data ? Number(data[currentMetric]).toLocaleString() : '0';
        // Add popup for click
        const popupContent = `
            <div style="text-align: left; font-family: 'Inter', sans-serif; padding: 6px;">
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px; font-weight: 700;">${mandalName}</h3>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 12px; color: #334155;">
                    <div style="margin-bottom: 4px;"><strong>Population:</strong> ${data ? Number(data.population).toLocaleString() : 'N/A'}</div>
                    <div style="margin-bottom: 4px; color: #dc2626;"><strong>Total Cases:</strong> ${data ? Number(data['total no of cases']).toLocaleString() : '0'}</div>
                    <div style="margin-bottom: 4px; color: #ea580c;"><strong>Confirmed Cases:</strong> ${data ? Number(data['confirmed cases']).toLocaleString() : '0'}</div>
                    <div style="margin-bottom: 4px; color: #16a34a;"><strong>Recovered Cases:</strong> ${data ? Number(data['recovered cases']).toLocaleString() : '0'}</div>
                    <div style="color: #000000;"><strong>Death Cases:</strong> ${data ? Number(data['death cases']).toLocaleString() : '0'}</div>
                </div>
            </div>
        `;
        layer.bindPopup(popupContent);

        // Add event listeners for hover effects and click-selection
        layer.on({
            mouseover: highlightFeature,
            mouseout: resetHighlight,
            click: selectMandal
        });
    }

    function highlightFeature(e) {
        const layer = e.target;
        if (layer !== selectedLayer) {
            layer.setStyle(highlightStyle);
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                layer.bringToFront();
            }
        }
    }

    function resetHighlight(e) {
        const layer = e.target;
        if (layer !== selectedLayer) {
            geojsonLayer.resetStyle(layer);
        }
    }

    function selectMandal(e) {
        const layer = e.target;

        // Reset previous selection style if any
        if (selectedLayer) {
            geojsonLayer.resetStyle(selectedLayer);
        }

        // Lock new selection
        selectedLayer = layer;

        // Visual selection style (amber border)
        layer.setStyle({
            color: '#fbbf24',
            weight: 3.5,
            opacity: 1
        });

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }

        // Update Mandal Analysis card on Click
        const props = layer.feature.properties;
        const mandalName = props.mandal || 'Unknown';
        const mandalKey = sanitize(mandalName);
        const data = diseaseData[currentDisease][mandalKey];

        if (analysisMandalEl) analysisMandalEl.textContent = mandalName;
        
        if (data) {
            if (valIncidenceEl) valIncidenceEl.textContent = data.incidence_ratio !== undefined ? `${Number(data.incidence_ratio).toFixed(2)}%` : '0.00%';
            if (valRecoveryEl) valRecoveryEl.textContent = data.recovery_ratio !== undefined ? `${Number(data.recovery_ratio).toFixed(2)}%` : '0.00%';
            if (valDeathEl) valDeathEl.textContent = data.death_ratio !== undefined ? `${Number(data.death_ratio).toFixed(2)}%` : '0.00%';
        } else {
            if (valIncidenceEl) valIncidenceEl.textContent = '-';
            if (valRecoveryEl) valRecoveryEl.textContent = '-';
            if (valDeathEl) valDeathEl.textContent = '-';
        }

        // Calculate and update comparison stats
        updateComparisonStats();

        // Update Bottom Facility Density Panel
        updateFacilityDensity(mandalName, mandalKey);
    }

    function updateFacilityDensity(mandalName, mandalKey) {
        const densityContainer = document.getElementById('facility-density-container');
        if (!densityContainer) return;

        const hData = hospitalsData[mandalKey];
        const dData = diseaseData[currentDisease][mandalKey];
        const population = dData ? Number(dData.population) : 0;

        if (!hData) {
            densityContainer.innerHTML = `
                <div class="density-placeholder">
                    <p>No health facilities data found for ${mandalName}</p>
                </div>
            `;
            return;
        }

        // Helper to calculate density per 10,000 people
        function getDensity(count) {
            if (!population || population === 0) return '0.00';
            return ((count / population) * 10000).toFixed(2);
        }

        // List of facilities with labels, values, keys, and a standard scale factor for UI progress bar
        const facilities = [
            { label: 'VHC (Clinics)', count: hData.village_health_clinics_vhc, scale: 5 },
            { label: 'PHC (Primary)', count: hData.primary_health_centers_phc, scale: 1 },
            { label: 'UPHC (Urban)', count: hData.urban_primary_health_centers_uphc, scale: 1 },
            { label: 'CHC (Community)', count: hData.community_health_centers_chcs, scale: 0.5 },
            { label: 'AH (Area Hospital)', count: hData.area_hospitals_ahs, scale: 0.2 },
            { label: 'TH (Teaching)', count: hData.teaching_hospitals_ths, scale: 0.1 },
            { label: 'Total Facilities', count: hData.total_health_facilities, scale: 10 }
        ];

        let gridHtml = '';
        facilities.forEach(f => {
            const density = getDensity(f.count);
            const densityNum = parseFloat(density);
            const barWidth = Math.min(100, Math.max(0, (densityNum / f.scale) * 100));

            gridHtml += `
                <div class="density-card">
                    <div class="density-card-header">
                        <span class="density-card-title">${f.label}</span>
                    </div>
                    <div class="density-card-count">${f.count}</div>
                    <div class="density-card-val">${density} <span style="font-size: 0.65rem; color: #94a3b8; font-weight: normal;">per 10k</span></div>
                    <div class="density-bar-bg">
                        <div class="density-bar-fill" style="width: ${barWidth}%;"></div>
                    </div>
                </div>
            `;
        });

        densityContainer.innerHTML = `
            <div class="density-header">
                <h2>Health Facility Density — ${mandalName}</h2>
                <div class="density-pop-badge">Mandal Population: ${population ? population.toLocaleString() : 'N/A'}</div>
            </div>
            <div class="density-grid">
                ${gridHtml}
            </div>
        `;
    }

    function updateLegend() {
        if (legendControl) {
            map.removeControl(legendControl);
        }

        legendControl = L.control({ position: 'bottomright' });

        legendControl.onAdd = function () {
            const div = L.DomUtil.create('div', 'info legend');
            
            // Get all values to calculate min and max
            const allVals = Object.values(diseaseData[currentDisease]).map(d => Number(d[currentMetric]) || 0);
            const minVal = Math.min(...allVals);
            const maxVal = Math.max(...allVals);
            
            // CSS gradient string
            const colorsString = currentDisease === 'dengue' 
                ? '#ffedd5, #fb923c, #f97316, #ea580c, #b91c1c'
                : '#dbeafe, #60a5fa, #3b82f6, #2563eb, #1e3a8a';

            const metricLabel = metricSelect.options[metricSelect.selectedIndex].text;
            
            div.innerHTML = `
                <h4>${currentDisease.toUpperCase()} - ${metricLabel}</h4>
                <div class="gradient-bar" style="background: linear-gradient(to right, ${colorsString});"></div>
                <div class="legend-labels">
                    <span>Min (${minVal.toLocaleString()})</span>
                    <span>Max (${maxVal.toLocaleString()})</span>
                </div>
            `;
            return div;
        };

        legendControl.addTo(map);
    }

    function resetComparisonChart() {
        const valCompareLowerEl = document.getElementById('val-compare-lower');
        const valCompareHigherEl = document.getElementById('val-compare-higher');
        if (valCompareLowerEl) valCompareLowerEl.textContent = '-';
        if (valCompareHigherEl) valCompareHigherEl.textContent = '-';
        drawComparisonPie(0, 0);

        const tableBody = document.getElementById('comparison-table-body');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Select a Mandal to view comparisons</td>
                </tr>
            `;
        }
    }

    function drawComparisonPie(lower, higher) {
        const canvas = document.getElementById('comparison-pie');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 8;
        
        if (lower === 0 && higher === 0) {
            // Draw smooth placeholder circle
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Text placeholder
            ctx.fillStyle = '#f8fafc';
            ctx.font = '500 11px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Select a Mandal', centerX, centerY);
            return;
        }
        
        const total = lower + higher;
        const lowerAngle = (lower / total) * 2 * Math.PI;
        const higherAngle = (higher / total) * 2 * Math.PI;
        
        // Draw Lower Death Rate slice (emerald green)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + lowerAngle);
        ctx.closePath();
        ctx.fillStyle = '#10b981';
        ctx.fill();
        
        // Draw Higher/Equal Death Rate slice (rose red)
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, -Math.PI / 2 + lowerAngle, -Math.PI / 2 + lowerAngle + higherAngle);
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        
        // Draw a clean center circle for the donut chart effect!
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.55, 0, 2 * Math.PI);
        ctx.fillStyle = '#DE8E7E'; // Matches the sidebar background color perfectly for a seamless glass/donut punch-out!
        ctx.fill();
    }

    function updateComparisonStats() {
        if (!selectedLayer) return;
        const props = selectedLayer.feature.properties;
        const mandalName = props.mandal || 'Unknown';
        const mandalKey = sanitize(mandalName);
        const data = diseaseData[currentDisease][mandalKey];
        
        const selectedRateVal = data ? (Number(data[currentCompareRate]) || 0) : 0;
        
        let lowerCount = 0;
        let higherEqualCount = 0;

        currentFilteredFeatures.forEach(feat => {
            const mKey = sanitize(feat.properties.mandal || '');
            const mData = diseaseData[currentDisease][mKey];
            if (mData) {
                const rate = Number(mData[currentCompareRate]) || 0;
                if (rate < selectedRateVal) {
                    lowerCount++;
                } else {
                    higherEqualCount++;
                }
            } else {
                if (0 < selectedRateVal) {
                    lowerCount++;
                } else {
                    higherEqualCount++;
                }
            }
        });

        const totalCompare = lowerCount + higherEqualCount;
        const lowerPercent = totalCompare > 0 ? (lowerCount / totalCompare) * 100 : 0;
        const higherPercent = totalCompare > 0 ? (higherEqualCount / totalCompare) * 100 : 0;

        const valCompareLowerEl = document.getElementById('val-compare-lower');
        const valCompareHigherEl = document.getElementById('val-compare-higher');

        if (valCompareLowerEl) valCompareLowerEl.textContent = `${lowerCount} Mandals (${lowerPercent.toFixed(1)}%)`;
        if (valCompareHigherEl) valCompareHigherEl.textContent = `${higherEqualCount} Mandals (${higherPercent.toFixed(1)}%)`;

        // Render the comparative pie/donut chart
        drawComparisonPie(lowerCount, higherEqualCount);

        // Update the detailed comparison table
        updateComparisonTable();
    }

    function updateComparisonTable() {
        const tableBody = document.getElementById('comparison-table-body');
        if (!tableBody) return;

        if (!selectedLayer) return;

        const props = selectedLayer.feature.properties;
        const selectedMandalName = props.mandal || 'Unknown';
        const selectedMandalKey = sanitize(selectedMandalName);
        const selectedData = diseaseData[currentDisease][selectedMandalKey];
        const selectedRateVal = selectedData ? (Number(selectedData[currentCompareRate]) || 0) : 0;

        // Build array of comparisons
        const comparisons = [];
        currentFilteredFeatures.forEach(feat => {
            const mName = feat.properties.mandal || 'Unknown';
            const mKey = sanitize(mName);
            const mData = diseaseData[currentDisease][mKey];
            const mRate = mData ? (Number(mData[currentCompareRate]) || 0) : 0;
            const diff = mRate - selectedRateVal;
            
            comparisons.push({
                name: mName,
                rate: mRate,
                diff: diff
            });
        });

        // Sort comparisons by rate descending (leaderboard style!)
        comparisons.sort((a, b) => b.rate - a.rate);

        const maxDiff = Math.max(...comparisons.map(c => Math.abs(c.diff)), 0.01);

        let html = '';
        comparisons.forEach(c => {
            const isSelected = sanitize(c.name) === selectedMandalKey;
            const rowStyle = isSelected ? 'background: rgba(251, 191, 36, 0.12); font-weight: 600;' : '';
            const diffClass = c.diff < 0 ? 'color: #10b981;' : (c.diff > 0 ? 'color: #ef4444;' : 'color: #94a3b8;');
            const diffSign = c.diff > 0 ? '+' : '';
            
            // Normalize visual bar width
            const barWidth = (Math.abs(c.diff) / maxDiff) * 100;
            const barColor = c.diff < 0 ? '#10b981' : (c.diff > 0 ? '#ef4444' : '#94a3b8');

            html += `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); ${rowStyle}">
                    <td style="padding: 6px 4px; color: ${isSelected ? '#fbbf24' : '#e2e8f0'}; font-weight: ${isSelected ? '600' : 'normal'};">${c.name}</td>
                    <td style="padding: 6px 4px; text-align: right;">${c.rate.toFixed(2)}%</td>
                    <td style="padding: 6px 4px; text-align: right; color: #94a3b8;">${selectedRateVal.toFixed(2)}%</td>
                    <td style="padding: 6px 4px; text-align: right; ${diffClass}">${diffSign}${c.diff.toFixed(2)}%</td>
                    <td style="padding: 6px 4px; text-align: center; vertical-align: middle;">
                        <div style="display: inline-block; width: 45px; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden; text-align: left;">
                            <div style="width: ${barWidth}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;
    }

    function updateRankingTable() {
        const tbody = document.getElementById('healthcare-ranking-body');
        if (!tbody) return;

        // Gather data for all 34 mandals
        const rankingData = allowedMandalsList.map(mKey => {
            const hItem = hospitalsData[mKey];
            const dItem = diseaseData[currentDisease][mKey];
            
            const mandalName = hItem ? hItem.mandal : (dItem ? dItem.mandal : mKey);
            const population = dItem ? (Number(dItem.population) || 0) : 0;
            
            // Available Hospitals: total facilities minus VHCs (village health clinics)
            const availableHospitals = hItem ? ((Number(hItem.total_health_facilities) || 0) - (Number(hItem.village_health_clinics_vhc) || 0)) : 0;
            
            // Required Hospitals = Population / 50000 (float, capped at 1 minimum for divisor)
            const floatRequired = population / 50000;
            const requiredHospitals = Math.max(1, Math.round(floatRequired));
            
            // Coverage = (Available / floatRequired) * 100
            let coveragePercent = 0;
            if (floatRequired > 0) {
                coveragePercent = Math.round((availableHospitals / floatRequired) * 100);
            }
            
            // Status based on coverage
            let status = 'Critical';
            let statusClass = 'status-critical';
            if (coveragePercent >= 120) {
                status = 'Sufficient';
                statusClass = 'status-sufficient';
            } else if (coveragePercent >= 80) {
                status = 'Moderate';
                statusClass = 'status-moderate';
            }
            
            return {
                mandalName,
                population,
                availableHospitals,
                requiredHospitals,
                coveragePercent,
                status,
                statusClass
            };
        });

        // Sort by coverage percent descending
        rankingData.sort((a, b) => b.coveragePercent - a.coveragePercent);

        // Build HTML
        tbody.innerHTML = rankingData.map((row, index) => `
            <tr>
                <td>${index + 1}</td>
                <td class="mandal-cell">${row.mandalName}</td>
                <td>${row.population.toLocaleString()}</td>
                <td>${row.availableHospitals}</td>
                <td>${row.requiredHospitals}</td>
                <td class="coverage-cell">${row.coveragePercent}%</td>
                <td><span class="status-badge ${row.statusClass}">${row.status}</span></td>
            </tr>
        `).join('');
    }
});
