const { contextBridge, ipcRenderer } = require("electron");

function on(channel) {
  return (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

contextBridge.exposeInMainWorld("saytype", {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  setKey: (provider, value) => ipcRenderer.invoke("settings:setKey", provider, value),
  testConnection: (kind) => ipcRenderer.invoke("settings:test", kind),
  setHotkey: (accel, kind) => ipcRenderer.invoke("hotkey:set", accel, kind),
  suspendHotkey: (suspend) => ipcRenderer.invoke("hotkey:suspend", suspend),
  onSettings: on("settings:changed"),

  getHistory: () => ipcRenderer.invoke("history:get"),
  deleteHistory: (id) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  onHistoryAdded: on("history:added"),
  onHistoryReplaced: on("history:replaced"),
  onHistoryUpdated: on("history:updated"),
  editHistory: (id, text) => ipcRenderer.invoke("history:edit", id, text),
  reprocessHistory: (id, opts) => ipcRenderer.invoke("history:reprocess", id, opts),
  useAlternative: (id) => ipcRenderer.invoke("history:useAlt", id),
  dropAlternative: (id) => ipcRenderer.invoke("history:dropAlt", id),

  listRecovery: () => ipcRenderer.invoke("recovery:list"),
  retryRecovery: (id) => ipcRenderer.invoke("recovery:retry", id),
  discardRecovery: (id) => ipcRenderer.invoke("recovery:discard", id),
  onRecoveryChanged: on("recovery:changed"),

  getSnippets: () => ipcRenderer.invoke("snippets:get"),
  setSnippets: (list) => ipcRenderer.invoke("snippets:set", list),

  getDictionary: () => ipcRenderer.invoke("dictionary:get"),
  setDictionary: (list) => ipcRenderer.invoke("dictionary:set", list),

  toggleDictation: () => ipcRenderer.invoke("dictation:toggle"),
  cancelDictation: () => ipcRenderer.invoke("dictation:cancel"),
  getState: () => ipcRenderer.invoke("dictation:getState"),
  onState: on("dictation:state"),

  // overlay
  onStart: on("dictation:start"),
  onStop: on("dictation:stop"),
  onCancel: on("dictation:cancel"),
  processAudio: (payload) => ipcRenderer.invoke("dictation:process", payload),
  setOverlayInteractive: (on) => ipcRenderer.send("overlay:interactive", Boolean(on)),
  recorderError: (message) => ipcRenderer.send("dictation:recorderError", message),

  bubbleDragStart: () => ipcRenderer.send("bubble:dragStart"),
  bubbleDragMove: () => ipcRenderer.send("bubble:dragMove"),
  bubbleDragEnd: () => ipcRenderer.invoke("bubble:dragEnd"),
  setBubbleCollapsed: (collapsed) => ipcRenderer.invoke("bubble:setCollapsed", Boolean(collapsed)),
  setBubbleInteractive: (on) => ipcRenderer.send("bubble:interactive", Boolean(on)),
  getBubbleLayout: () => ipcRenderer.invoke("bubble:getLayout"),
  onBubbleLayout: on("bubble:layout"),

  localInfo: () => ipcRenderer.invoke("local:info"),
  localModels: () => ipcRenderer.invoke("local:list"),
  downloadLocalModel: (id) => ipcRenderer.invoke("local:download", id),
  cancelLocalDownload: (id) => ipcRenderer.invoke("local:cancel", id),
  deleteLocalModel: (id) => ipcRenderer.invoke("local:delete", id),
  onLocalProgress: on("local:progress"),

  copy: (text) => ipcRenderer.invoke("clipboard:write", text),
  getPermissions: () => ipcRenderer.invoke("permissions:get"),
  requestMic: () => ipcRenderer.invoke("permissions:requestMic"),
  openAccessibility: () => ipcRenderer.invoke("permissions:openAccessibility"),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  appInfo: () => ipcRenderer.invoke("app:info"),
  onNavigate: on("navigate"),
  lastPaste: () => ipcRenderer.invoke("paste:last"),
  getUpdate: () => ipcRenderer.invoke("update:get"),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateProgress: on("update:progress"),
  onUpdate: on("update:available"),
});
