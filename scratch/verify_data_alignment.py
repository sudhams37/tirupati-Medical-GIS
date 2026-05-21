import json

# Load geojson
with open('datasets/sample.geojson', 'r', encoding='utf-8') as f:
    geojson = json.load(f)

# Load json stats
with open('datasets/ward_population_hospitals.json', 'r', encoding='utf-8') as f:
    stats = json.load(f)

geojson_codes = set()
features = geojson.get('features', [])
for f in features:
    props = f.get('properties', {})
    code = props.get('code')
    if code:
        geojson_codes.add(str(code))

stats_codes = set(stats.keys())

print(f"Total wards in GeoJSON: {len(geojson_codes)}")
print(f"Total wards in Stats JSON: {len(stats_codes)}")

missing_in_stats = geojson_codes - stats_codes
missing_in_geojson = stats_codes - geojson_codes

if missing_in_stats:
    print(f"Wards in GeoJSON but missing in Stats JSON ({len(missing_in_stats)}): {sorted(list(missing_in_stats))}")
else:
    print("All GeoJSON wards have corresponding entries in Stats JSON!")

if missing_in_geojson:
    print(f"Wards in Stats JSON but missing in GeoJSON ({len(missing_in_geojson)}): {sorted(list(missing_in_geojson))}")
else:
    print("All Stats JSON wards have corresponding entries in GeoJSON!")

# Print sum of population and hospitals
total_pop = sum(w['population'] for w in stats.values())
total_hosp = sum(w['hospitals'] for w in stats.values())
print(f"Total Population: {total_pop:,}")
print(f"Total Hospitals: {total_hosp}")
