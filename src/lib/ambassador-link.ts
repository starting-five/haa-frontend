import { resolveAmbassadorLinkHost } from "@/lib/ambassador-link-host";

// The ambassador referral link. The host was inlined in four screens and
// formatDisplayLink was copy-pasted four times; both live here now so a change
// to the link shape reaches every screen at once. The host is build
// configuration (see lib/ambassador-link-host.ts); next.config.ts refuses a
// build without it, so this never meets an empty value in a built bundle.
export const AMBASSADOR_LINK_HOST = resolveAmbassadorLinkHost(process.env.NEXT_PUBLIC_AMBASSADOR_LINK_HOST);
export const AMBASSADOR_LINK_PREFIX = `${AMBASSADOR_LINK_HOST}/`;

// Strips the scheme and any trailing slash so a link reads the way the Figma
// frames show it — "go.helpafteraccident.com/jess", never "https://…/".
export function formatDisplayLink(link: string): string {
  if (!link) return "";
  return link.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// The preview shown while an ambassador is still typing a username, before the
// real short link comes back from the link service.
export function buildAmbassadorLinkPreview(username: string): string {
  return `${AMBASSADOR_LINK_PREFIX}${username}`;
}

// The absolute form, for the clipboard and the QR payload.
export function toAbsoluteLink(link: string): string {
  if (!link) return "";
  return /^https?:\/\//i.test(link) ? link : `https://${formatDisplayLink(link)}`;
}
