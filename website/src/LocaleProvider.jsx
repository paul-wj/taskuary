import React, { createContext, useContext, useSyncExternalStore } from "react";
import { getLocale, subscribeLocale } from "./i18n.js";

export const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
