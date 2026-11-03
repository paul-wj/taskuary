import core from "./locales/core.json" with { type: "json" };
import tasks from "./locales/tasks.json" with { type: "json" };
import assistant from "./locales/assistant.json" with { type: "json" };
import connections from "./locales/connections.json" with { type: "json" };
import views from "./locales/views.json" with { type: "json" };
import settings from "./locales/settings.json" with { type: "json" };
import metadata from "./locales/metadata.json" with { type: "json" };

const translations = { ...core, ...tasks, ...assistant, ...connections, ...views, ...settings, ...metadata };
const KEY = "taskuary.language";
const normalize = (locale) => locale === "zh-CN" ? "zh-CN" : "en";
const initialLocale = () => {
  let stored = null;
  try { stored = globalThis.localStorage?.getItem(KEY) ?? null; } catch { /* storage unavailable */ }
  if (stored !== null) return normalize(stored);
  return /^zh(?:-|$)/i.test(globalThis.navigator?.language || "") ? "zh-CN" : "en";
};
let locale = initialLocale();
const listeners = new Set();
const updateDocument = () => { if (typeof document !== "undefined") document.documentElement.lang = locale; };
updateDocument();

export const getLocale = () => locale;
export const setLocale = (next) => {
  const value = normalize(next);
  try { globalThis.localStorage?.setItem(KEY, value); } catch { /* switching still works */ }
  if (locale === value) return;
  locale = value;
  updateDocument();
  listeners.forEach((listener) => listener());
};
export const subscribeLocale = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const t = (source, values = {}, context = "") => {
  const contextual = context ? `${context}::${source}` : source;
  const key = Object.prototype.hasOwnProperty.call(translations, contextual) ? contextual : source;
  const text = locale === "zh-CN" && Object.prototype.hasOwnProperty.call(translations, key) ? translations[key] : source;
  return String(text).replace(/\{([^{}]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
};

// Only structured presentation descriptors are translated; ordinary values remain data.
export const translateDescriptor = (descriptor) => {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor) ||
      typeof descriptor.source !== "string" || !descriptor.values ||
      typeof descriptor.values !== "object" || Array.isArray(descriptor.values)) return descriptor;
  const values = Object.fromEntries(Object.entries(descriptor.values).map(([key, value]) => [key, translateDescriptor(value)]));
  return t(descriptor.source, values);
};
