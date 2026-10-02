// pnpm --filter worker vapid:keys
// Prints a fresh VAPID key pair for Web Push. Put both in the worker's env and the public key
// in the API's env. Rotating keys invalidates every existing browser push subscription.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}`);
