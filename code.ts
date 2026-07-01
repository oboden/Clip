const UI_WIDTH = 420;
const UI_HEIGHT = 520;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, title: 'Clip' });

interface ClipItem {
  id: string;
  name: string;
  type: string;
  node: SceneNode;
}

let items: ClipItem[] = [];
const STORAGE_FRAME_NAME = '__clip_storage__';

function rebuildItemsFromStorage() {
  items = [];

  const storageFrame = figma.currentPage.children.find(
    node => node.type === 'FRAME' && node.name === STORAGE_FRAME_NAME
  ) as FrameNode | undefined;

  if (!storageFrame) {
    syncUI();
    return;
  }

  for (const child of storageFrame.children) {
    items.push({
      id: child.id,
      name: child.name,
      type: child.type,
      node: child as SceneNode
    });
  }

  syncUI();
}

const ONBOARDING_STORAGE_KEY = 'clip.hasCompletedOnboarding';

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

function syncSelectionState() {
  figma.ui.postMessage({
    type: 'selection-updated',
    hasSelection: figma.currentPage.selection.length > 0
  });
}

/*async function init() {
  const hasCompletedOnboarding = await figma.clientStorage.getAsync(ONBOARDING_STORAGE_KEY);

  if (hasCompletedOnboarding) {
    figma.ui.postMessage({ type: 'show-main' });
  }

  syncSelectionState();
  syncUI();
}*/

async function init() {

  syncSelectionState();

  rebuildItemsFromStorage();

}


async function init() {
  // Development mode:
  // Always show onboarding when the plugin opens.

  syncSelectionState();
  syncUI();
}

figma.on('selectionchange', syncSelectionState);

init();

figma.ui.onmessage = async (msg) => {

  if (msg.type === 'complete-onboarding') {
    await figma.clientStorage.setAsync(ONBOARDING_STORAGE_KEY, true);
    return;
  }

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

    rebuildItemsFromStorage();
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
  rebuildItemsFromStorage();
}
  }

  if (msg.type === 'resize') {
    figma.ui.resize(UI_WIDTH, msg.height);
  }
};