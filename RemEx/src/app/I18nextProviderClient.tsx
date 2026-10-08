"use client";

import i18n from "./i18n";
import { I18nextProvider } from "react-i18next";
import { ReactNode, useEffect } from "react";
import ClientOnly from "@/app/_components/clientOnly";
import { useLogger } from "@vortexiot/rmxng-common/client";

const I18nextProviderClient = ({ children }: { children: ReactNode }) => {
  const logger = useLogger();

  useEffect(() => {
    logger.debug("[I18nextProviderClient] Mounted", {
      isInitialized: i18n.isInitialized,
      language: i18n.language,
      ready: i18n.isInitialized && i18n.language,
      moduleId: module.id,
    });

    return () => {
      logger.debug("[I18nextProviderClient] Unmounting", {
        isInitialized: i18n.isInitialized,
        language: i18n.language,
      });
    };
  }, [logger]);

  return (
    <ClientOnly>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </ClientOnly>
  );
};

export default I18nextProviderClient;
