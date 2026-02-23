#!/usr/bin/env python3
"""
Patch nginx.conf to add correct map block for WebSocket upgrade.
"""
import re
import sys

nginx_conf_path = '/etc/nginx/nginx.conf'

# Read current config
with open(nginx_conf_path, 'r') as f:
    content = f.read()

# Remove any broken map blocks
lines = content.split('\n')
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Skip broken map blocks
    if re.match(r'^\s*map\s+\S*\s+\S*\s*\{', line) or re.match(r'^\s*map\s+\{\s*$', line):
        # Skip until closing brace
        brace_count = line.count('{') - line.count('}')
        i += 1
        while i < len(lines) and brace_count > 0:
            brace_count += lines[i].count('{') - lines[i].count('}')
            i += 1
        continue
    new_lines.append(line)
    i += 1

content = '\n'.join(new_lines)

# Find http { and insert map after it
http_pattern = r'(http\s+\{)'
map_block = '''    map $http_upgrade $connection_upgrade {
        default upgrade;
        ""      close;
    }'''

# Insert map block right after "http {"
if re.search(http_pattern, content):
    content = re.sub(
        http_pattern,
        r'\1\n' + map_block,
        content,
        count=1
    )
else:
    print("ERROR: Could not find 'http {' block", file=sys.stderr)
    sys.exit(1)

# Write back
with open(nginx_conf_path, 'w') as f:
    f.write(content)

print("nginx.conf patched successfully")
