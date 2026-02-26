import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { Prec } from '@codemirror/state';

interface SqlEditorProps {
  value: string;
  onChange: (val: string) => void;
  onRun: () => void;
}

export interface SqlEditorHandle {
  focus: () => void;
}

const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(
  ({ value, onChange, onRun }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<EditorView | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => editorRef.current?.focus(),
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const runKeymap = Prec.highest(
        keymap.of([
          {
            key: 'Ctrl-Enter',
            mac: 'Mod-Enter',
            run: () => { onRun(); return true; },
          },
        ])
      );

      const view = new EditorView({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          oneDark,
          runKeymap,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': { height: '180px', borderRadius: '6px', overflow: 'hidden' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
        parent: containerRef.current,
      });

      editorRef.current = view;
      return () => view.destroy();
    }, []); // eslint-disable-line

    // Sync external value changes
    useEffect(() => {
      const view = editorRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    }, [value]);

    return <div ref={containerRef} className="rounded-md overflow-hidden border border-gray-700" />;
  }
);

SqlEditor.displayName = 'SqlEditor';
export default SqlEditor;
