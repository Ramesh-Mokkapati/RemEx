"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import enTranslations from "../../messages/en.json";
import frTranslations from "../../messages/fr.json";
import elTranslations from "../../messages/el.json";
import prTranslations from "../../messages/pr.json";
import gaTranslations from "../../messages/ga.json";
import cyTranslations from "../../messages/cy.json";
import gdTranslations from "../../messages/gd.json";
import { ConsoleLogger } from "@vortexiot/rmxng-common";

const logger = new ConsoleLogger();

// Using JSON.stringify to ensure objects are properly displayed in Electron logs
logger.debug("i18n Module loaded", {
  existingInstance: Boolean(i18n.isInitialized),
  moduleId: module.id,
});

const i18nInstance = i18n.createInstance();

logger.debug("i18n Instance created", {
  isInitialized: i18nInstance.isInitialized,
  instanceId: i18nInstance.options?.contextSeparator || "default",
});

const initOptions = {
  debug: false,
  resources: {
    en: { translation: enTranslations },
    fr: { translation: frTranslations },
    el: { translation: elTranslations },
    pr: { translation: prTranslations },
    ga: { translation: gaTranslations },
    cy: { translation: cyTranslations },
    gd: { translation: gdTranslations },
  },
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
};

logger.verbose(`i18n Init options`, initOptions);

i18nInstance
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(initOptions)
  .then(() => {
    logger.debug("i18n Initialization completed", {
      isInitialized: i18nInstance.isInitialized,
      language: i18nInstance.language,
      languages: i18nInstance.languages,
      resources: Object.keys(i18nInstance.store.data),
    });
  })
  .catch((error) => {
    logger.error("i18n Initialization failed", error.message);
  });

i18nInstance.on("languageChanged", (lng) => {
  logger.debug(`i18n Language changed to: ${lng}`);
});

i18nInstance.on("initialized", (_options) => {
  logger.debug("i18n Initialized event", {
    isInitialized: i18nInstance.isInitialized,
    language: i18nInstance.language,
  });
});

i18nInstance.on("failedLoading", (lng, ns, msg) => {
  logger.error("i18n Failed loading", { lng, ns, msg });
});

i18nInstance.on("missingKey", (lngs, namespace, key, res) => {
  logger.warn("i18n Missing key", { lngs, namespace, key, res });
});

export default i18nInstance;
