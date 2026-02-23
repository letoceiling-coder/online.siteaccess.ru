# NGINX CONFIGURATION RULES

## ⚠️ CRITICAL: NEVER BREAK VARIABLE SUBSTITUTION

### ABSOLUTE PROHIBITIONS

**NEVER use these methods to edit Nginx configs:**
- ❌ `sed` with variable substitution
- ❌ `echo` with variable interpolation
- ❌ PowerShell string interpolation
- ❌ Any command that may escape `$` symbols

**Why?** Nginx uses `$variable` syntax. If `$` is escaped or removed, the config breaks silently.

### ALLOWED METHODS ONLY

**✅ Use ONLY these safe methods:**

#### Method 1: Heredoc with single quotes (RECOMMENDED)
```bash
cat <<'EOF' | sudo tee /etc/nginx/sites-available/online.siteaccess.ru > /dev/null
server {
  ...
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  ...
}
EOF
```

**Key:** Use `<<'EOF'` (single quotes) NOT `<<EOF` (double quotes).

#### Method 2: Interactive editor
```bash
sudo nano /etc/nginx/sites-available/online.siteaccess.ru
```

### REQUIRED WORKFLOW

1. **Always backup first:**
   ```bash
   sudo cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%F-%H%M%S)
   sudo cp -a /etc/nginx/sites-available/online.siteaccess.ru /etc/nginx/sites-available/online.siteaccess.ru.bak.$(date +%F-%H%M%S)
   ```

2. **Edit config using safe method (heredoc or nano)**

3. **Always validate before reload:**
   ```bash
   sudo nginx -t
   ```
   **If `nginx -t` fails, STOP and restore from backup.**

4. **Only reload if validation passes:**
   ```bash
   sudo systemctl reload nginx
   ```

5. **Verify service status:**
   ```bash
   sudo systemctl status nginx --no-pager | head -20
   ```

### SAFE DEPLOYMENT SCRIPT

Use the protected deployment script:
```bash
/usr/local/bin/sa-nginx-apply.sh <config-file-path>
```

This script:
- Creates automatic backups
- Validates config before applying
- Restores from backup if validation fails
- Only reloads if validation passes

### CRITICAL CONFIGURATION ELEMENTS

#### 1. Map for WebSocket upgrade (in `/etc/nginx/nginx.conf`):
```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}
```

**Must be inside `http { ... }` block.**

#### 2. Socket.IO location (in site config):
```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  ...
}
```

**Key:** Use `$connection_upgrade` (map variable), NOT literal string `"Upgrade"`.

### VALIDATION CHECKLIST

Before committing or deploying any Nginx config change:

- [ ] Config file uses `$http_upgrade` (not escaped)
- [ ] Config file uses `$connection_upgrade` (not escaped)
- [ ] Map block exists in `nginx.conf` with correct syntax
- [ ] `sudo nginx -t` passes
- [ ] Backup was created before changes
- [ ] No `sed`/`echo`/PowerShell was used for writing config

### COMMON MISTAKES

❌ **WRONG:**
```bash
echo "proxy_set_header Connection upgrade;" >> config
# This breaks $variable substitution
```

❌ **WRONG:**
```bash
sed -i 's/Connection upgrade/Connection $connection_upgrade/' config
# sed may escape $ incorrectly
```

✅ **CORRECT:**
```bash
cat <<'EOF' | sudo tee config > /dev/null
proxy_set_header Connection $connection_upgrade;
EOF
```

### CI/CD VALIDATION

Before committing Nginx config templates, validate:
- Template contains `$http_upgrade` (not escaped)
- Template contains `$connection_upgrade` (not escaped)
- Map section exists with correct syntax
- No literal `"Upgrade"` strings (should use map variable)

---

**Last updated:** 2026-02-23  
**Maintained by:** Infrastructure team
