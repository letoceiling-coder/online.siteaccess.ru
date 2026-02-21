-- Fix column name casing to match Prisma schema @map directives
ALTER TABLE channels RENAME COLUMN " tokenHash\ TO tokenhash;
ALTER TABLE channels RENAME COLUMN \allowedDomains\ TO alloweddomains;
ALTER TABLE channels RENAME COLUMN \ownerUserId\ TO owneruserid;
ALTER TABLE channels RENAME COLUMN \widgetSettings\ TO widgetsettings;
ALTER TABLE channels RENAME COLUMN \installVerifiedAt\ TO installverifiedat;
ALTER TABLE channels RENAME COLUMN \lastWidgetPingAt\ TO lastwidgetpingat;
ALTER TABLE channels RENAME COLUMN \lastWidgetPingUrl\ TO lastwidgetpingurl;
ALTER TABLE channels RENAME COLUMN \lastWidgetPingUserAgent\ TO lastwidgetpinguseragent;
