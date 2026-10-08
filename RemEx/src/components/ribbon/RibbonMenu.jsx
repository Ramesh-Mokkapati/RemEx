"use client";

/**
 * RibbonMenu — drop-in replacement for the @olton/ribbon-menu API.
 *
 * Children are expected to be <RibbonTab label="..." mode="default|static">.
 * The component renders the tab strip (with optional brand/user-bar slots)
 * and a content panel for the active tab. Tabs may be controlled via
 * `activeTab` / `onTabChange`, otherwise they're managed internally.
 *
 * The component intentionally mirrors the public API documented in the
 * @olton/ribbon-menu README so existing snippets work unchanged.
 */

import { Children, isValidElement, useState } from "react";
import classNames from "classnames";
import styles from "./ribbon.module.css";

export default function RibbonMenu({
  children,
  brand,
  rightSlot,
  defaultTab,
  activeTab: activeTabProp,
  onTabChange,
}) {
  const tabs = Children.toArray(children).filter(isValidElement);
  const labels = tabs.map((t) => t.props.label);
  const [internal, setInternal] = useState(defaultTab || labels[0]);
  const activeTab = activeTabProp ?? internal;
  const setActive = (label) => {
    if (onTabChange) onTabChange(label);
    if (activeTabProp === undefined) setInternal(label);
  };

  return (
    <div className={styles.ribbon}>
      <div className={styles.tabsBar}>
        {brand ? <div className={styles.brand}>{brand}</div> : null}
        {tabs.map((t) => (
          <button
            key={t.props.label}
            type="button"
            className={classNames(styles.tab, { [styles.active]: t.props.label === activeTab })}
            onClick={() => setActive(t.props.label)}
          >
            {t.props.label}
          </button>
        ))}
        <div className={styles.tabSpacer} />
        {rightSlot ? <div className={styles.userBar}>{rightSlot}</div> : null}
      </div>
      {tabs.map((t) => (
        <div
          key={t.props.label}
          className={classNames(styles.panel, {
            [styles.active]: t.props.label === activeTab,
            [styles.staticMode]: t.props.mode === "static",
          })}
          role="tabpanel"
        >
          {t}
        </div>
      ))}
    </div>
  );
}
