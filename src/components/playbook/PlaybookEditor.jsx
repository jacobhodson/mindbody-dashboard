import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Heading2, Heading3, List, ListOrdered, ListChecks,
  Quote, Minus, Link2, ImagePlus, Video, Undo2, Redo2, Loader2,
} from 'lucide-react';
import { Embed, toEmbedUrl } from './embedNode.js';
import { uploadPlaybookImage } from '../../utils/usePlaybook.js';

function extensions({ editable, placeholder }) {
  return [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Underline,
    Link.configure({ openOnClick: !editable, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    Embed,
    ...(editable ? [Placeholder.configure({ placeholder })] : []),
  ];
}

/** Read-only render of a page's Tiptap JSON — same schema as the editor, so it always matches. */
export function PlaybookContent({ content }) {
  const editor = useEditor({
    editable: false,
    extensions: extensions({ editable: false }),
    content: content || '',
  }, [content]);
  if (!content) return null;
  return <EditorContent editor={editor} className="playbook-prose" />;
}

/**
 * The SOP editor. Calls onChange({ json, text }) on every edit; the parent
 * decides when to save. Images upload to the playbook-media bucket.
 */
export default function PlaybookEditor({ content, onChange }) {
  // editorProps below are captured once at creation, so they reach the live
  // editor through this ref rather than a stale closure.
  const editorRef = useRef(null);
  const editor = useEditor({
    extensions: extensions({ editable: true, placeholder: 'Write the SOP — steps, checklists, screenshots, videos…' }),
    content: content || '',
    onUpdate: ({ editor: e }) => onChange({ json: e.getJSON(), text: e.getText() }),
    editorProps: {
      // Pasted / dropped image files upload instead of being dropped as base64.
      handlePaste: (view, event) => insertFiles(event.clipboardData?.files),
      handleDrop: (view, event) => insertFiles(event.dataTransfer?.files),
    },
  });
  editorRef.current = editor;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  function insertFiles(files) {
    const images = [...(files || [])].filter((f) => f.type.startsWith('image/'));
    const ed = editorRef.current;
    if (!images.length || !ed) return false;
    (async () => {
      setUploading(true); setUploadError(null);
      try {
        for (const f of images) {
          const src = await uploadPlaybookImage(f);
          ed.chain().focus().setImage({ src, alt: f.name }).run();
        }
      } catch (e) {
        setUploadError(e.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    })();
    return true;
  }

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL (leave empty to remove)', prev);
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
    const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const addEmbed = () => {
    const url = window.prompt('Paste a YouTube, Loom, Vimeo or Google Drive link');
    if (!url) return;
    const src = toEmbedUrl(url);
    if (!src) { window.alert("That link can't be embedded — supported: YouTube, Loom, Vimeo, Google Drive/Docs."); return; }
    editor.chain().focus().setEmbed(src).run();
  };

  const btn = (active) => `rounded p-1.5 transition-colors ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`;
  const tools = [
    [Bold, 'Bold', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold')],
    [Italic, 'Italic', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic')],
    [UnderlineIcon, 'Underline', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline')],
    null,
    [Heading2, 'Heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 })],
    [Heading3, 'Subheading', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 })],
    null,
    [List, 'Bullet list', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList')],
    [ListOrdered, 'Numbered steps', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList')],
    [ListChecks, 'Checklist', () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList')],
    [Quote, 'Callout / quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote')],
    [Minus, 'Divider', () => editor.chain().focus().setHorizontalRule().run(), false],
    null,
    [Link2, 'Link', setLink, editor.isActive('link')],
    [ImagePlus, 'Image', () => fileRef.current?.click(), false],
    [Video, 'Embed video / Google Drive file', addEmbed, false],
    null,
    [Undo2, 'Undo', () => editor.chain().focus().undo().run(), false],
    [Redo2, 'Redo', () => editor.chain().focus().redo().run(), false],
  ];

  return (
    <div className="rounded-xl border border-gray-300 bg-white">
      <div className="sticky top-[79px] z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-gray-200 bg-white/95 px-2 py-1.5 backdrop-blur">
        {tools.map((t, i) => (t === null
          ? <span key={i} className="mx-1 h-5 w-px bg-gray-200" />
          : (
            <button
              key={t[1]}
              type="button"
              title={t[1]}
              aria-label={t[1]}
              onMouseDown={(e) => e.preventDefault()}
              onClick={t[2]}
              className={btn(t[3])}
            >
              {(() => { const Icon = t[0]; return <Icon className="h-4 w-4" />; })()}
            </button>
          )))}
        {uploading && <span className="ml-2 flex items-center gap-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</span>}
        {uploadError && <span className="ml-2 text-xs text-red-600">{uploadError}</span>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { insertFiles(e.target.files); e.target.value = ''; }}
        />
      </div>
      <EditorContent editor={editor} className="playbook-prose playbook-editing px-4 py-3" />
    </div>
  );
}
