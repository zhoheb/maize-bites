import { Check, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/Button';

/** Shares a link with the system share sheet where there is one, else copies it. */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => {
      setCopied(false);
    }, 2500);
    return () => {
      clearTimeout(id);
    };
  }, [copied]);

  async function share() {
    // `share` is missing on desktop Firefox and older browsers.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Dismissing the share sheet is not a failure; anything else falls back to copying.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access either (insecure context); the address bar still has the link.
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void share()}>
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-now-ink" />
      ) : (
        <Share2 aria-hidden="true" className="size-4" />
      )}
      <span role="status">{copied ? 'Link copied' : 'Share'}</span>
    </Button>
  );
}
