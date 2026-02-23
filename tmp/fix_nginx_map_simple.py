#!/usr/bin/env python3
import re
import sys

nginx_conf_path = '/etc/nginx/nginx.conf'

with open(nginx_conf_path, 'r') as f:
    lines = f.readlines()

new_lines = []
i = 0
in_map = False
map_brace_count = 0

while i < len(lines):
    line = lines[i]
    
    # Detect start of broken map
    if 'map' in line and '{' in line and '$http_upgrade' not in line:
        in_map = True
        map_brace_count = line.count('{') - line.count('}')
        i += 1
        # Skip until closing brace
        while i < len(lines) and map_brace_count > 0:
            map_brace_count += lines[i].count('{') - lines[i].count('}')
            i += 1
        continue
    
    new_lines.append(line)
    i += 1

content = ''.join(new_lines)

# Insert map after http {
http_idx = content.find('http {')
if http_idx == -1:
    print("ERROR: Could not find 'http {'", file=sys.stderr)
    sys.exit(1)

# Find end of "http {" line
insert_pos = content.find('\n', http_idx) + 1

map_block = '''    map $http_upgrade $connection_upgrade {
        default upgrade;
        ""      close;
    }
'''
content = content[:insert_pos] + map_block + content[insert_pos:]

with open(nginx_conf_path, 'w') as f:
    f.write(content)

print("nginx.conf patched successfully")
