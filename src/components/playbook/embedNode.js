import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Turns a share link from a supported video/doc host into its embeddable
 * URL, or null if the host isn't supported (so arbitrary sites can't be
 * iframed into an SOP).
 */
export function toEmbedUrl(raw) {
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'loom.com') {
    const id = url.pathname.match(/^\/(?:share|embed)\/([\w-]+)/)?.[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.match(/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    // /file/d/<id>/view → /preview; Docs/Sheets/Slides /edit → /preview
    if (/\/(view|edit|preview)/.test(url.pathname)) {
      return `https://${host}${url.pathname.replace(/\/(view|edit)(.*)$/, '/preview')}`;
    }
    return null;
  }
  return null;
}

/** A block-level iframe embed (videos, Google Drive files). */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed] iframe', getAttrs: (el) => ({ src: el.getAttribute('src') }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-embed': '', class: 'playbook-embed' },
      ['iframe', mergeAttributes(HTMLAttributes, {
        frameborder: '0',
        allowfullscreen: 'true',
        allow: 'autoplay; fullscreen; picture-in-picture',
        loading: 'lazy',
      })],
    ];
  },

  addCommands() {
    return {
      setEmbed: (src) => ({ commands }) => commands.insertContent({ type: this.name, attrs: { src } }),
    };
  },
});
