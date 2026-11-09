import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

interface DescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
}

export function DescriptionEditor({ value, onChange, disabled = false }: DescriptionEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false, underline: false, listKeymap: false, trailingNode: false }), Markdown.configure({ html: false })],
    shouldRerenderOnTransaction: true,
    content: value,
    editable: !disabled,
    editorProps: { attributes: { role: "textbox", "aria-label": strings.description, "aria-multiline": "true", "data-dialog-editor-escape": "" } },
    onUpdate: ({ editor: activeEditor }) => {
      const markdown = activeEditor.storage.markdown.getMarkdown();
      onChange(markdown);
    }
  });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="description-editor">
      <div className="description-editor-toolbar">
        <button type="button" className="secondary" disabled={!editor?.isEditable} aria-pressed={editor?.isActive("bold") ?? false} onClick={() => editor?.isEditable && editor.chain().focus().toggleBold().run()} aria-label={strings.bold}>{strings.bold}</button>
        <button type="button" className="secondary" disabled={!editor?.isEditable} aria-pressed={editor?.isActive("italic") ?? false} onClick={() => editor?.isEditable && editor.chain().focus().toggleItalic().run()} aria-label={strings.italic}>{strings.italic}</button>
        <button type="button" className="secondary" disabled={!editor?.isEditable} aria-pressed={editor?.isActive("bulletList") ?? false} onClick={() => editor?.isEditable && editor.chain().focus().toggleBulletList().run()} aria-label={strings.list}>{strings.list}</button>
        <button type="button" className="secondary" disabled={!editor?.isEditable} aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false} onClick={() => editor?.isEditable && editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label={strings.heading2}>{strings.heading2}</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
