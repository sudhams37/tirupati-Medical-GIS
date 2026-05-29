document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Leaflet Map (Choropleth + Heatmap)
    const map = L.map('prediction-map').setView([13.6288, 79.4192], 10); // Tirupati coordinates

    // Use a light-themed tile layer (CartoDB Positron) for white map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    function sanitize(str) {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/thi/g, 'ti')
            .replace(/palli/g, 'palle')
            .replace(/pet$/g, 'peta');
    }

    let choroplethLayer = null;
    let heatLayer = null;
    let filteredFeatures = [];

    // Fetch GeoJSON and filter for Tirupati Mandals
    Promise.all([
        fetchDataset('datasets/ap_mandals.geojson').then(g => assertGeoJson(g, 'ap_mandals.geojson')),
        fetchDataset('datasets/tirupati-district-mandals.txt', 'text')
    ]).then(([geojson, mandalsText]) => {
        const allowedMandalsRaw = mandalsText.split('\n').map(name => sanitize(name)).filter(name => name.length > 2);
        const aliases = { 'kumaravenkatabhupalapuram': 'kvbpuram' };
        const allowedMandalsList = allowedMandalsRaw.map(m => aliases[m] || m);

        const exclusions = [
            { mandal: 'venkatagirikota', district: 'chittoor' },
            { mandal: 'koduru', district: 'krishna' },
            { mandal: 'ramachandrapuram', district: 'east godavari' },
            { mandal: 'vararamachandrapuram', district: 'east godavari' },
            { mandal: 'thotapalligudur', district: 'sri potti sriramulu nellore' },
            { mandal: 'guduru', district: 'krishna' },
            { mandal: 'gudur', district: 'kurnool' }
        ];

        filteredFeatures = geojson.features.filter(feature => {
            const mandalName = sanitize(feature.properties.mandal || '');
            const districtName = (feature.properties.district || '').toLowerCase();
            const isExcluded = exclusions.some(ex => mandalName === sanitize(ex.mandal) && districtName === ex.district);
            if (isExcluded) return false;
            if (districtName !== 'chittoor' && districtName !== 'sri potti sriramulu nellore') return false;
            return allowedMandalsList.includes(mandalName);
        });

        updateMapData();
    }).catch(err => {
        console.error('Error loading trend analysis data:', err);
        showDataLoadError(
            'Could not load map data. Run "python run.py" and open the URL shown in the terminal (port 8080).'
        );
    });

    function updateMapData() {
        if (!filteredFeatures.length) return;

        // Add mock intensity to features based on current filters
        const disease = document.getElementById('disease-model-select').value;
        const multiplier = disease === 'dengue' ? 1.0 : 0.6; // Dengue has more cases

        filteredFeatures.forEach(feature => {
            feature.properties.intensity = Math.floor(Math.random() * 100 * multiplier);
        });

        if (choroplethLayer) map.removeLayer(choroplethLayer);

        choroplethLayer = L.geoJSON({ type: "FeatureCollection", features: filteredFeatures }, {
            style: function (feature) {
                let color = '#38bdf8'; // low
                if (feature.properties.intensity > 70) color = '#ef4444'; // high
                else if (feature.properties.intensity > 40) color = '#f59e0b'; // medium
                return {
                    fillColor: color,
                    weight: 1,
                    opacity: 1,
                    color: 'rgba(0,0,0,0.2)', // Darker border for light map
                    fillOpacity: 0.6 // Slightly more opaque for light map
                };
            },
            onEachFeature: function (feature, layer) {
                layer.bindPopup(`<b>${feature.properties.mandal || feature.properties.name}</b><br>Predicted Case Intensity: ${feature.properties.intensity}%`);
            }
        }).addTo(map);

        if (filteredFeatures.length > 0 && !heatLayer) { // Only fit bounds on first load
            map.fitBounds(choroplethLayer.getBounds(), { padding: [20, 20] });
        }

        // Generate Hotspot Analysis markers instead of heatmap
        if (heatLayer) map.removeLayer(heatLayer);
        heatLayer = L.featureGroup().addTo(map);

        choroplethLayer.eachLayer(layer => {
            const feature = layer.feature;
            const intensity = feature.properties.intensity;
            const center = layer.getBounds().getCenter();
            
            // Significant hotspots (>75) and coldspots (<25)
            if (intensity > 75 || intensity < 25) {
                const isHot = intensity > 75;
                const marker = L.circleMarker(center, {
                    radius: isHot ? 14 : 10,
                    fillColor: isHot ? '#ef4444' : '#3b82f6', // Red for hot, Blue for cold
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.95
                });
                
                // Add a glowing effect for hotspots
                if (isHot) {
                    marker.setStyle({
                        shadowColor: '#ef4444',
                        shadowBlur: 10
                    });
                }
                
                marker.bindPopup(`<b>${feature.properties.mandal || feature.properties.name}</b><br>Status: <b>${isHot ? 'Significant Hotspot 🔥' : 'Significant Coldspot ❄️'}</b><br>Intensity Score: ${intensity}%`);
                heatLayer.addLayer(marker);
            }
        });
    }

    // 2. Setup Chart Defaults
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Charts instances
    let lineChart, featuresChart, compareChart, capacityChart;

    function initCharts() {
        // Line Chart setup
        const lineCtx = document.getElementById('prediction-line-chart').getContext('2d');
        lineChart = new Chart(lineCtx, {
            type: 'line',
            data: getLineChartData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            filter: item => !item.text.includes('Confidence'),
                            usePointStyle: true, boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#38bdf8', bodyColor: '#f8fafc',
                        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, beginAtZero: true }
                }
            }
        });

        // Top Features Horizontal Bar Chart
        const featuresCtx = document.getElementById('top-features-chart').getContext('2d');
        featuresChart = new Chart(featuresCtx, {
            type: 'bar',
            data: getFeaturesData(),
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { grid: { display: false } }
                }
            }
        });

        // Disease Comparison Bar Chart
        const compareCtx = document.getElementById('disease-comparison-chart').getContext('2d');
        compareChart = new Chart(compareCtx, {
            type: 'bar',
            data: getCompareData(),
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });

        // Healthcare Capacity Donut Chart
        const capacityCtx = document.getElementById('capacity-donut-chart').getContext('2d');
        capacityChart = new Chart(capacityCtx, {
            type: 'doughnut',
            data: getCapacityData(),
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc', bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1
                    }
                },
                cutout: '75%'
            }
        });
    }

    // Data generators based on filters
    function getLineChartData() {
        const disease = document.getElementById('disease-model-select').value;
        const timeframe = parseInt(document.getElementById('time-frame-select').value);
        const confidence = parseInt(document.getElementById('confidence-select').value);

        const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
        
        // Base actual cases (Jan to Jul)
        const baseActuals = disease === 'dengue' ? [120, 150, 180, 140, 200, 250, 300] : [80, 100, 90, 70, 110, 130, 160];
        
        // Create labels array based on timeframe
        const labels = allMonths.slice(0, 7 + timeframe);
        
        const actualCases = [...baseActuals, ...Array(timeframe).fill(null)];
        
        // Generate predictions
        const lastActual = baseActuals[baseActuals.length - 1];
        let preds = [];
        let uppers = [];
        let lowers = [];
        
        const varianceMap = { 90: 0.1, 95: 0.2, 99: 0.35 };
        const confVariance = varianceMap[confidence];

        for (let i = 0; i < timeframe; i++) {
            const trend = (Math.random() * 40) - 10; // slight upward trend
            const pred = Math.round(lastActual + (i + 1) * trend);
            preds.push(pred);
            
            const spread = Math.round(pred * confVariance * (i + 1) * 0.5); // Uncertainty grows over time
            uppers.push(pred + spread);
            lowers.push(Math.max(0, pred - spread));
        }

        const predictedCases = [...Array(7 - 1).fill(null), lastActual, ...preds];
        const upperConfidence = [...Array(7 - 1).fill(null), lastActual, ...uppers];
        const lowerConfidence = [...Array(7 - 1).fill(null), lastActual, ...lowers];

        return {
            labels: labels,
            datasets: [
                {
                    label: `Upper Confidence (${confidence}%)`, data: upperConfidence,
                    borderColor: 'transparent', backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    fill: '+1', pointRadius: 0, tension: 0.4
                },
                {
                    label: `Lower Confidence (${confidence}%)`, data: lowerConfidence,
                    borderColor: 'transparent', backgroundColor: 'transparent',
                    fill: false, pointRadius: 0, tension: 0.4
                },
                {
                    label: 'Predicted Cases', data: predictedCases,
                    borderColor: '#38bdf8', borderDash: [5, 5], borderWidth: 2,
                    pointBackgroundColor: '#0f172a', pointBorderColor: '#38bdf8', pointBorderWidth: 2, tension: 0.4
                },
                {
                    label: 'Actual Cases', data: actualCases,
                    borderColor: '#f43f5e', borderWidth: 2,
                    pointBackgroundColor: '#0f172a', pointBorderColor: '#f43f5e', pointBorderWidth: 2, tension: 0.4
                }
            ]
        };
    }

    function getFeaturesData() {
        const disease = document.getElementById('disease-model-select').value;
        const labels = ['Population Density', 'Historical Cases', 'Rainfall (Climate)', 'Distance to Hospitals', 'Sanitation Index'];
        const data = disease === 'dengue' ? [0.35, 0.25, 0.18, 0.12, 0.10] : [0.20, 0.30, 0.25, 0.15, 0.10];

        return {
            labels: labels,
            datasets: [{
                label: 'Feature Importance', data: data,
                backgroundColor: [
                    'rgba(56, 189, 248, 0.8)', 'rgba(129, 140, 248, 0.8)', 'rgba(192, 132, 252, 0.8)',
                    'rgba(244, 63, 94, 0.8)', 'rgba(16, 185, 129, 0.8)'
                ],
                borderRadius: 4
            }]
        };
    }

    function getCompareData() {
        const timeframe = parseInt(document.getElementById('time-frame-select').value);
        const mult = timeframe / 3.0; // scale based on months

        return {
            labels: ['Dengue', 'Malaria', 'Typhoid', 'Cholera'],
            datasets: [{
                label: `Predicted Cases (Next ${timeframe} Months)`,
                data: [Math.round(1200 * mult), Math.round(850 * mult), Math.round(400 * mult), Math.round(150 * mult)],
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderColor: '#38bdf8', borderWidth: 1, borderRadius: 4
            }]
        };
    }

    function getCapacityData() {
        const disease = document.getElementById('disease-model-select').value;
        const timeframe = parseInt(document.getElementById('time-frame-select').value);
        
        // Mock data logic based on filters (total mandals = 34)
        let sufficient = 24;
        let insufficient = 10;
        
        // Dengue typically strains capacity more in the mock
        if (disease === 'dengue') {
            sufficient -= timeframe;
            insufficient += timeframe;
        } else {
            sufficient -= Math.floor(timeframe / 2);
            insufficient += Math.floor(timeframe / 2);
        }

        // Update the text values below the chart
        document.getElementById('val-sufficient').textContent = sufficient;
        document.getElementById('val-insufficient').textContent = insufficient;

        return {
            labels: ['Sufficient Mandals', 'Insufficient Mandals'],
            datasets: [{
                data: [sufficient, insufficient],
                backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(244, 63, 94, 0.8)'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        };
    }

    function updateAllCharts() {
        lineChart.data = getLineChartData();
        lineChart.update();
        
        featuresChart.data = getFeaturesData();
        featuresChart.update();
        
        compareChart.data = getCompareData();
        compareChart.update();

        capacityChart.data = getCapacityData();
        capacityChart.update();
    }

    // Initialize everything
    initCharts();

    // 6. Handle Filters Changes
    const filters = document.querySelectorAll('select');
    filters.forEach(filter => {
        filter.addEventListener('change', () => {
            updateMapData();
            updateAllCharts();
        });
    });

    // 7. Show Cure Capacity on Map
    const showCapacityBtn = document.getElementById('show-capacity-map-btn');
    if (showCapacityBtn) {
        showCapacityBtn.addEventListener('click', () => {
            // Get current capacity data
            const disease = document.getElementById('disease-model-select').value;
            const timeframe = parseInt(document.getElementById('time-frame-select').value);
            
            let sufficient = 24;
            let insufficient = 10;
            
            if (disease === 'dengue') {
                sufficient -= timeframe;
                insufficient += timeframe;
            } else {
                sufficient -= Math.floor(timeframe / 2);
                insufficient += Math.floor(timeframe / 2);
            }

            if (heatLayer) map.removeLayer(heatLayer);
            heatLayer = L.featureGroup().addTo(map);

            // Get existing layers to avoid re-parsing geojson
            const layers = [];
            choroplethLayer.eachLayer(layer => {
                layers.push(layer);
            });

            // Sort features to pick 'insufficient' ones based on highest intensity
            layers.sort((a, b) => b.feature.properties.intensity - a.feature.properties.intensity);

            layers.forEach((layer, index) => {
                const feature = layer.feature;
                const isInsufficient = index < insufficient;
                const center = layer.getBounds().getCenter();
                
                const marker = L.circleMarker(center, {
                    radius: isInsufficient ? 12 : 8,
                    fillColor: isInsufficient ? '#f43f5e' : '#10b981', // Red for insufficient, Green for sufficient
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });
                
                if (isInsufficient) {
                    marker.setStyle({
                        shadowColor: '#f43f5e',
                        shadowBlur: 10
                    });
                }
                
                marker.bindPopup(`<b>${feature.properties.mandal || feature.properties.name}</b><br>Capacity Status: <b>${isInsufficient ? 'Insufficient 🚨' : 'Sufficient ✅'}</b>`);
                heatLayer.addLayer(marker);
            });

            // Button feedback
            const originalText = showCapacityBtn.textContent;
            showCapacityBtn.textContent = "Showing on Map...";
            showCapacityBtn.style.background = "rgba(56, 189, 248, 0.3)";
            
            // Re-fit bounds
            map.fitBounds(heatLayer.getBounds(), { padding: [20, 20] });
            
            setTimeout(() => {
                showCapacityBtn.textContent = originalText;
                showCapacityBtn.style.background = "rgba(56, 189, 248, 0.1)";
            }, 3000);
        });
    }
});
