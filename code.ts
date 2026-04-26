figma.showUI(__html__, { width: 280, height: 400, title: 'Clipboard' });

interface ClipItem {
  id: string;
  name: string;
  type: string;
  node: SceneNode;
}

let items: ClipItem[] = [];
const STORAGE_FRAME_NAME = '__clip_storage__';

function getOrCreateStorageFrame(): FrameNode {
  let frame = figma.currentPage.children.find(
    n => n.name === STORAGE_FRAME_NAME && n.type === 'FRAME'
  ) as FrameNode | undefined;

  if (!frame) {
    frame = figma.createFrame();
    frame.name = STORAGE_FRAME_NAME;
    frame.visible = false;
    frame.x = -99999;
    frame.y = -99999;
    frame.resize(100, 100);
    figma.currentPage.appendChild(frame);
  }

  return frame;
}

function syncUI() {
  figma.ui.postMessage({
    type: 'items-updated',
    items: items.map(i => ({ id: i.id, name: i.name, type: i.type }))
  });
}

figma.ui.onmessage = async (msg) => {

  if (msg.type === 'save-selection') {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Select something first' });
      return;
    }

    const storageFrame = getOrCreateStorageFrame();

    for (const node of selection) {
      const clone = (node as FrameNode).clone();
      clone.visible = false;
      storageFrame.appendChild(clone);

      items.push({
        id: String(Date.now()) + Math.random(),
        name: node.name,
        type: node.type,
        node: clone,
      });
    }

    syncUI();
  }

  if (msg.type === 'paste-item') {
    const item = items.find(i => i.id === msg.id);
    if (!item) {
      figma.ui.postMessage({ type: 'error', message: 'Item not found' });
      return;
    }

    const clone = (item.node as FrameNode).clone();
    clone.visible = true;

    const center = figma.viewport.center;
    clone.x = center.x;
    clone.y = center.y;

    figma.currentPage.appendChild(clone);
    figma.currentPage.selection = [clone];
    figma.viewport.scrollAndZoomIntoView([clone]);
  }

  if (msg.type === 'delete-item') {
    const item = items.find(i => i.id === msg.id);
    if (item) {
      item.node.remove();
      items = items.filter(i => i.id !== item.id);
      syncUI();
    }
  }

  if (msg.type === 'resize') {
    figma.ui.resize(280, msg.height);
  }

};