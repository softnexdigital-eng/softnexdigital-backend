ALTER TABLE "Tenant"
  ALTER COLUMN "enabledModules"
  SET DEFAULT '["dashboard","catalog","variants","attributes","categories","subcategories","brands","banners","orders","customers","suppliers","couriers","shipping","blocking","payments","expenses","coupons","returns","reviews","wishlist","incomplete_checkouts","landing","users","notifications","settings","marketing","inventory"]'::jsonb;

UPDATE "Tenant"
SET "enabledModules" = '["dashboard","catalog","variants","attributes","categories","subcategories","brands","banners","orders","customers","suppliers","couriers","shipping","blocking","payments","expenses","coupons","returns","reviews","wishlist","incomplete_checkouts","landing","users","notifications","settings","marketing","inventory"]'::jsonb
WHERE "enabledModules" = '["catalog","orders","customers","inventory"]'::jsonb;
