import json

with open('datasets/sample.geojson', 'r', encoding='utf-8') as f:
    geojson = json.load(f)
    
features = geojson.get('features', [])
print(f"Total features in geojson: {len(features)}")
for i, f in enumerate(features[:15]):
    props = f.get('properties', {})
    print(f"Feature {i+1}: name={props.get('name')}, code={props.get('code')}")
