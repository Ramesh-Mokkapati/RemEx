"use client";

import { Children, cloneElement, isValidElement } from "react";

/**
 * <RibbonTab label mode> — wraps a set of <RibbonGroup>s for one tab.
 * Children that aren't <RibbonGroup> are rendered as-is.
 */
export default function RibbonTab({ label, mode = "default", children }) {
  return (
    <>
      {Children.map(children, (child) =>
        isValidElement(child) ? cloneElement(child) : child
      )}
    </>
  );
}
