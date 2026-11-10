const { contextBridge, ipcRenderer } = require("electron");

function on(channel) {
  return (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

contextBridge.exposeInMainWorld("wispr", {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  setKey: (provider, value) => ipcRenderer.invoke("settings:setKey", provider, value),
  testConnection: (kind) => ipcRenderer.invoke("settings:test", kind),
  setHotkey: (accel) => ipcRenderer.invoke("hotkey:set", accel),
  suspendHotkey: (suspend) => ipcRenderer.invoke("hotkey:suspend", suspend),
  onSettings: on("settings:changed"),

  getHistory: () => ipcRenderer.invoke("history:get"),
  deleteHistory: (id) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  onHistoryAdded: on("history:added"),
  onHistoryReplaced: on("history:replaced"),

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
  hideBubble: () => ipcRenderer.invoke("bubble:hide"),

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
  getUpdate: () => ipcRenderer.invoke("update:get"),
  onUpdate: on("update:available"),
});
