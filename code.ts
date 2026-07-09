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
const ONBOARDING_STORAGE_KEY = 'clip.hasCompletedOnboarding';

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
  if (figma.currentPage.selection.length > 0) {
    figma.ui.postMessage({ type: 'canvas-selection-active' });
  } else {
    figma.ui.postMessage({ type: 'canvas-selection-cleared' });
  }
}

async function init() {
  // Uncomment the clientStorage check below when you are ready for production 
  // so users don't see onboarding every time. For now, it defaults to showing it.
  
  /*
  const hasCompletedOnboarding = await figma.clientStorage.getAsync(ONBOARDING_STORAGE_KEY);
  if (hasCompletedOnboarding) {
    figma.ui.postMessage({ type: 'show-main' });
  }
  */

  syncSelectionState();
  rebuildItemsFromStorage();
}

figma.on("selectionchange", () => {
  if (figma.currentPage.selection.length > 0) {
    // Tell the UI something is selected
    figma.ui.postMessage({ type: 'canvas-selection-active' });
  } else {
    // Tell the UI nothing is selected
    figma.ui.postMessage({ type: 'canvas-selection-cleared' });
  }
});

init();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'complete-onboarding') {
    await figma.clientStorage.setAsync(ONBOARDING_STORAGE_KEY, true);
    figma.ui.postMessage({ type: 'show-main' }); // Added this so UI knows to switch
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
      const clone = (node as any).clone();
      clone.visible = false;
      
      // ADD THIS LINE: Secretly store the original node's ID inside the clone
      clone.setPluginData('originalId', node.id); 
      
      storageFrame.appendChild(clone);
    }

    rebuildItemsFromStorage();
  }

  // --- TARGET ELEMENT LOGIC (Auto-Page Switching) ---
  if (msg.type === 'target-item') {
    try {
      const item = items.find(i => i.id === msg.id);
      if (!item) return;

      const originalId = item.node.getPluginData('originalId');
      if (!originalId) {
        figma.notify("Cannot find original element. (Was it copied before the update?)");
        return;
      }

      // THE FIX: Use the Async version!
      const originalNode = await figma.getNodeByIdAsync(originalId);

      if (originalNode && !originalNode.removed) {
        
        // Find which page this node actually lives on
        let nodePage: BaseNode | null = originalNode;
        while (nodePage && nodePage.type !== 'PAGE') {
          nodePage = nodePage.parent;
        }

        // If it's on a different page, use the Async page switcher!
        if (nodePage && nodePage.type === 'PAGE' && figma.currentPage.id !== nodePage.id) {
          await figma.setCurrentPageAsync(nodePage as PageNode);
        }

        // Ensure we aren't targeting the entire canvas itself
        if (originalNode.type !== 'DOCUMENT' && originalNode.type !== 'PAGE') {
          figma.currentPage.selection = [originalNode as SceneNode];
          figma.viewport.scrollAndZoomIntoView([originalNode as SceneNode]);
          figma.notify("Target located! 🎯");
        }
        
      } else {
        figma.notify("Original element was deleted from the canvas.");
      }

    } catch (error) {
      console.error("Target logic error:", error);
      figma.notify("Could not locate element.");
    }
  }

// ── BULK PASTE ──
  if (msg.type === 'paste-items') {
    const ids = msg.ids as string[];
    const clonesToSelect: SceneNode[] = [];

    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (item) {
        // We cast to any here to safely access clone() on supported nodes
        const clone = (item.node as any).clone();
        clone.visible = true;

        const center = figma.viewport.center;
        // Optional: add a slight offset if pasting multiple so they don't perfectly overlap
        clone.x = center.x;
        clone.y = center.y;

        figma.currentPage.appendChild(clone);
        clonesToSelect.push(clone);
      }
    }

    if (clonesToSelect.length > 0) {
      figma.currentPage.selection = clonesToSelect;
      figma.viewport.scrollAndZoomIntoView(clonesToSelect);
    }
  }

  // ── SINGLE PASTE (Kept just in case you add a paste button to individual rows later) ──
  if (msg.type === 'paste-item') {
    const item = items.find(i => i.id === msg.id);
    if (!item) return;

    const clone = (item.node as any).clone();
    clone.visible = true;
    clone.x = figma.viewport.center.x;
    clone.y = figma.viewport.center.y;

    figma.currentPage.appendChild(clone);
    figma.currentPage.selection = [clone];
    figma.viewport.scrollAndZoomIntoView([clone]);
  }

  // ── BULK DELETE ──
  if (msg.type === 'delete-items') {
    const ids = msg.ids as string[];
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (item) {
        item.node.remove();
      }
    }
    rebuildItemsFromStorage();
  }

  // ── SINGLE DELETE (For the pink trash can icon on each row) ──
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