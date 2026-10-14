-- Push subscription keys are stored as unpadded URL-safe base64, which the API now enforces
-- on save. Rewrite any row saved in standard base64 (+ / and = padding). Idempotent.
UPDATE "push_subscriptions"
SET
  "p256dh" = rtrim(translate(trim("p256dh"), '+/', '-_'), '='),
  "auth" = rtrim(translate(trim("auth"), '+/', '-_'), '=')
WHERE "p256dh" ~ '[+/=[:space:]]' OR "auth" ~ '[+/=[:space:]]';
