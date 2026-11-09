import { useEffect, useRef, useState } from "react";

// "Link" copies the project's address. "Share" opens the device's own share
// sheet where there is one (phones, Safari, Windows), which covers Messages,
// WhatsApp, Mail, AirDrop, Instagram and whatever else is installed. Elsewhere
// it shows the main networks and email. Shared links show the project's
// first image as their preview (the page's og:image).

export function shareTargets({ url, title, image }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { name: "Email", href: `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n${url}`)}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { name: "X", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    ...(image ? [{ name: "Pinterest", href: `https://pinterest.com/pin/create/button/?url=${u}&media=${encodeURIComponent(image)}&description=${t}` }] : [])
  ];
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** @param {{ url: string, title: string, image?: string }} props */
export default function ShareButtons({ url, title, image }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copyLink() {
    if (await copyText(url)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return; // closed the share sheet
      }
    }
    setOpen((value) => !value);
  }

  return (
    <div className="project-actions">
      <div className="space-x-4">
        <button type="button" onClick={copyLink} aria-live="polite">
          {copied ? "Copied" : "Link"}
        </button>
        <button type="button" onClick={share} aria-expanded={open}>
          Share
        </button>
      </div>
      {open && (
        <ul className="project-share-options" aria-label="Share on">
          {shareTargets({ url, title, image }).map((target) => (
            <li key={target.name}>
              <a href={target.href} target={target.name === "Email" ? undefined : "_blank"} rel="noopener noreferrer">
                {target.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
