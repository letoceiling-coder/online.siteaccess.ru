# STEP 01: MVP Chat - Backend API

## РЎС‚Р°С‚СѓСЃ
вњ… REST API РґР»СЏ channels Рё widget session СЂРµР°Р»РёР·РѕРІР°РЅ
вњ… РЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ РЅР° РїРѕСЂС‚Сѓ 3100 (РЅР°СЃС‚СЂР°РёРІР°РµС‚СЃСЏ С‡РµСЂРµР· PORT РІ .env)

## РР·РјРµРЅРµРЅРёРµ РїРѕСЂС‚Р° СЃРµСЂРІРµСЂР°

Р•СЃР»Рё РїРѕСЂС‚ Р·Р°РЅСЏС‚ РёР»Рё РЅСѓР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РґСЂСѓРіРѕР№ РїРѕСЂС‚:

1. **РР·РјРµРЅРёС‚СЊ PORT РІ .env:**
   `ash
   cd /var/www/online.siteaccess.ru/apps/server
   # РћС‚СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ .env
   PORT=3100  # РёР»Рё РґСЂСѓРіРѕР№ СЃРІРѕР±РѕРґРЅС‹Р№ РїРѕСЂС‚
   `

2. **РџСЂРѕРІРµСЂРёС‚СЊ, С‡С‚Рѕ РїРѕСЂС‚ СЃРІРѕР±РѕРґРµРЅ:**
   `ash
   ss -ltnp | grep ':3100'  # РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїСѓСЃС‚Рѕ
   `

3. **РћСЃС‚Р°РЅРѕРІРёС‚СЊ СЃС‚Р°СЂС‹Р№ РїСЂРѕС†РµСЃСЃ (РµСЃР»Рё Р·Р°РїСѓС‰РµРЅ):**
   `ash
   # РќР°Р№С‚Рё PID РїСЂРѕС†РµСЃСЃР° РЅР° РїРѕСЂС‚Сѓ
   lsof -tiTCP:3100 -sTCP:LISTEN | xargs kill -9
   # РР»Рё РЅР°Р№С‚Рё РїРѕ РїСѓС‚Рё РїСЂРѕРµРєС‚Р°
   ps aux | grep '/var/www/online.siteaccess.ru' | grep node | grep -v grep | awk '{print \}' | xargs kill -9
   `

4. **Р—Р°РїСѓСЃС‚РёС‚СЊ СЃРµСЂРІРµСЂ С‡РµСЂРµР· screen (Р±РµР· Р·Р°РІРёСЃР°РЅРёСЏ SSH):**
   `ash
   cd /var/www/online.siteaccess.ru/apps/server
   screen -dmS online-server bash -c 'pnpm dev > /tmp/online-server.log 2>&1'
   `

5. **РџСЂРѕРІРµСЂРёС‚СЊ Р·Р°РїСѓСЃРє:**
   `ash
   # РџСЂРѕРІРµСЂРёС‚СЊ Р»РѕРіРё
   tail -40 /tmp/online-server.log
   
   # РџСЂРѕРІРµСЂРёС‚СЊ РїРѕСЂС‚
   ss -ltnp | grep ':3100'
   
   # РџСЂРѕРІРµСЂРёС‚СЊ HTTP
   curl -I http://127.0.0.1:3100/
   `

## API Endpoints

### POST /api/channels
РЎРѕР·РґР°С‚СЊ РєР°РЅР°Р»
`json
{ name: Demo}
`
РћС‚РІРµС‚: {id: ..., name: Demo, token: ...}

### PUT /api/channels/:id/domains
РЈСЃС‚Р°РЅРѕРІРёС‚СЊ СЂР°Р·СЂРµС€РµРЅРЅС‹Рµ РґРѕРјРµРЅС‹
`json
{domains: [localhost, site.ru]}
`

### POST /api/widget/session
РџРѕР»СѓС‡РёС‚СЊ session token РґР»СЏ РІРёРґР¶РµС‚Р°
`json
{token: channel-token, externalId: visitor-id}
`
Headers: Origin: http://localhost
РћС‚РІРµС‚: {conversationId: ..., visitorSessionToken: ..., externalId: ...}

## Р›РѕРіРё СЃРµСЂРІРµСЂР°
`ash
tail -f /tmp/online-server.log
`

## РћСЃС‚Р°РЅРѕРІРєР° СЃРµСЂРІРµСЂР°
`ash
# РќР°Р№С‚Рё screen СЃРµСЃСЃРёСЋ
screen -list

# РћСЃС‚Р°РЅРѕРІРёС‚СЊ С‡РµСЂРµР· screen
screen -S online-server -X quit

# РР»Рё СѓР±РёС‚СЊ РїСЂРѕС†РµСЃСЃ
ps aux | grep 'node.*dist/main' | grep online.siteaccess | grep -v grep | awk '{print \}' | xargs kill
