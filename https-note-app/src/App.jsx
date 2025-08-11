/*
Fabric.js-based HTTPS-ready note app (single-file React component)
Features:
- Sidebar notes list (create/delete/select)
- Each note is a Fabric canvas scene (text + images as movable objects)
- Insert images (file input / paste) and drag/scale/rotate them
- Add text boxes that are editable on double-click
- Save/Load to localStorage (key: 'https_canvas_notes_v1')
- Export/Import JSON

How to use:
1. Create a React project (Vite / CRA). Put this file as src/App.jsx.
2. Install: `npm install fabric`
3. Start dev server: `npm run dev` or `npm start`.

Notes:
- This uses fabric 4+ API and assumes browser environment.
- Tailwind classes are used for quick styling; if not using Tailwind it will still work but styling differs.
*/

import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';

const STORAGE_KEY = 'https_canvas_notes_v1';

function uid() { return Math.random().toString(36).slice(2,9); }

export default function HttpsCanvasNotes() {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const fileInputRef = useRef(null);

  // load notes from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setNotes(parsed);
        if (parsed.length) setActiveId(parsed[0].id);
      } else {
        const starter = {
          id: uid(),
          title: '新画布笔记',
          canvasJson: null,
          updatedAt: Date.now(),
        };
        setNotes([starter]);
        setActiveId(starter.id);
      }
    } catch (e) {
      console.error('读取本地存储失败', e);
      setNotes([]);
    }
  }, []);

  // initialize fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    // ensure canvas has width/height attributes
    const canvasEl = canvasRef.current;
    canvasEl.width = 900;
    canvasEl.height = 600;
    const c = new fabric.Canvas(canvasEl, {
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      width: 900,
      height: 600,
      uniScaleTransform: true,
    });
    fabricRef.current = c;

    // allow clipboard paste for images
    window.addEventListener('paste', handlePaste);

    // basic object styling on selection
    c.on('object:modified', saveActiveNote);
    c.on('object:added', saveActiveNote);
    c.on('object:removed', saveActiveNote);

    // cleanup
    return () => {
      window.removeEventListener('paste', handlePaste);
      c.dispose && c.dispose();
      fabricRef.current = null;
    };
  }, [canvasRef.current]);

  // whenever active note changes, load its canvas JSON
  useEffect(() => {
    const active = notes.find(n => n.id === activeId);
    const c = fabricRef.current;
    if (!c) return;
    // clear existing
    c.clear();
    c.setBackgroundColor('#fff', c.renderAll.bind(c));
    if (active && active.canvasJson) {
      try {
        c.loadFromJSON(active.canvasJson, () => {
          c.renderAll();
          // ensure images are selectable
          c.getObjects().forEach(obj => {
            obj.set({ selectable: true, evented: true });
          });
        });
      } catch (e) {
        console.error('加载画布 JSON 失败', e);
      }
    } else {
      // empty canvas: add example text
      const example = new fabric.Textbox('双击编辑文字。上传/粘贴图片，然后拖动缩放。', {
        left: 20, top: 20, width: 400, fontSize: 18, fill: '#333'
      });
      c.add(example);
      saveActiveNote();
    }
  }, [activeId, notes]);

  // autosave canvas to notes on changes
  function saveActiveNote() {
    const c = fabricRef.current;
    if (!c) return;
    const json = c.toJSON(['selectable']);
    setNotes(prev => prev.map(n => n.id === activeId ? { ...n, canvasJson: json, updatedAt: Date.now() } : n));
    // persist to localStorage (debounced-ish)
    setTimeout(() => {
      const cur = notes.map(n => n.id === activeId ? { ...n, canvasJson: json, updatedAt: Date.now() } : n);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cur)); } catch (e) { console.error('保存失败', e); }
    }, 200);
  }

  // create new note
  function createNote() {
    const n = { id: uid(), title: '未命名画布', canvasJson: null, updatedAt: Date.now() };
    setNotes(prev => [n, ...prev]);
    setActiveId(n.id);
  }

  // delete note
  function deleteNote(id) {
    if (!confirm('确认删除此笔记？')) return;
    setNotes(prev => prev.filter(p => p.id !== id));
    if (id === activeId) {
      setActiveId(prevId => {
        const remaining = notes.filter(n => n.id !== id);
        return remaining.length ? remaining[0].id : null;
      });
    }
  }

  // add text object
  function addText() {
    const c = fabricRef.current; if (!c) return;
    const t = new fabric.Textbox('新文字，双击编辑', { left: 50, top: 50, width: 300, fontSize: 18, fill: '#111' });
    c.add(t).setActiveObject(t);
    c.renderAll();
    saveActiveNote();
  }

  // handle image file input
  function onChooseFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const data = evt.target.result;
      fabric.Image.fromURL(data, img => {
        img.set({ left: 80, top: 80, scaleX: 0.5, scaleY: 0.5, selectable: true });
        fabricRef.current.add(img).setActiveObject(img);
        fabricRef.current.renderAll();
        saveActiveNote();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
    // reset input so same file can be chosen again
    e.target.value = null;
  }

  // handle paste (image from clipboard)
  function handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = function(evt) {
          const data = evt.target.result;
          fabric.Image.fromURL(data, img => {
            img.set({ left: 60, top: 60, scaleX: 0.5, scaleY: 0.5, selectable: true });
            fabricRef.current.add(img).setActiveObject(img);
            fabricRef.current.renderAll();
            saveActiveNote();
          });
        };
        reader.readAsDataURL(blob);
      }
    }
  }

  // export all notes (download JSON)
  function exportAll() {
    try {
      const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `canvas_notes_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert('导出失败'); }
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed)) throw new Error('格式不对');
        // basic merging
        const normalized = parsed.map(p => ({ id: p.id || uid(), title: p.title || '导入笔记', canvasJson: p.canvasJson || null, updatedAt: p.updatedAt || Date.now() }));
        setNotes(prev => [...normalized, ...prev]);
        alert('导入完成');
      } catch (e) { alert('导入失败：文件格式错误'); }
    };
    reader.readAsText(file);
  }

  // persist notes to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch (e) { console.error('保存本地失败', e); }
  }, [notes]);

  // update active note title
  function updateTitle(title) {
    setNotes(prev => prev.map(n => n.id === activeId ? { ...n, title, updatedAt: Date.now() } : n));
  }

  // helper: download single canvas as PNG
  function downloadPng() {
    const c = fabricRef.current; if (!c) return;
    const data = c.toDataURL({ format: 'png', multiplier: 2 });
    const a = document.createElement('a'); a.href = data; a.download = `canvas_${activeId || 'note'}.png`; a.click();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4">
        <aside className="md:col-span-1 bg-white rounded p-3 shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">画布笔记</h3>
            <div className="flex gap-2">
              <button onClick={createNote} className="px-2 py-1 rounded bg-green-500 text-white">新建</button>
            </div>
          </div>
          <div className="space-y-2 mb-3">
            <input placeholder="搜索（暂未实现高级过滤）" className="w-full px-2 py-1 border rounded" />
          </div>

          <div className="overflow-auto max-h-80 mb-3">
            {notes.map(n => (
              <div key={n.id} className={`p-2 rounded border mb-2 ${n.id === activeId ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="flex justify-between items-start">
                  <div onClick={() => setActiveId(n.id)} style={{cursor:'pointer'}}>
                    <div className="font-medium">{n.title || '(无标题)'}</div>
                    <div className="text-xs text-gray-500">{new Date(n.updatedAt).toLocaleString()}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button title="删除" onClick={() => deleteNote(n.id)} className="text-xs px-2 py-1 rounded bg-red-100">删</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-600 space-y-2">
            <div className="flex gap-2">
              <button onClick={exportAll} className="flex-1 px-2 py-1 rounded border">导出全部</button>
              <label className="flex-1 px-2 py-1 rounded border text-center cursor-pointer">导入
                <input type="file" accept="application/json" onChange={(e)=> e.target.files && importFile(e.target.files[0])} className="hidden" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={downloadPng} className="flex-1 px-2 py-1 rounded border">下载 PNG</button>
              <label className="flex-1 px-2 py-1 rounded border text-center cursor-pointer">插入图片
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onChooseFile} className="hidden" />
              </label>
            </div>
            <div className="mt-2">
              <button onClick={addText} className="w-full px-3 py-1 rounded border">添加文字</button>
            </div>
          </div>
        </aside>

        <main className="md:col-span-3 bg-white rounded p-3 shadow">
          {activeId ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <input value={(notes.find(n=>n.id===activeId)||{}).title||''} onChange={(e)=>updateTitle(e.target.value)} className="flex-1 px-2 py-1 border rounded" />
                <div className="text-sm text-gray-500">画布尺寸: 900 x 600</div>
              </div>

              <div className="border mb-2">
                <canvas ref={canvasRef} />
              </div>

              <div className="text-xs text-gray-500">说明：你可以拖动/缩放/旋转图片与文字。粘贴图片（Ctrl+V）也会插入。</div>
            </div>
          ) : (
            <div className="text-center text-gray-500 p-8">请选择或新建笔记</div>
          )}
        </main>
      </div>

      <footer className="max-w-7xl mx-auto mt-4 text-xs text-gray-500">提示：确保在本地开发环境中已安装 <code>fabric</code>。如需我把这个打包并部署（含 HTTPS），可帮你处理。</footer>
    </div>
  );
}
