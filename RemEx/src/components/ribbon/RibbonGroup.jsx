"use client";

import styles from "./ribbon.module.css";

/**
 * <RibbonGroup title="..."> — a vertical column inside a tab panel,
 * housing a row of buttons with a small caption underneath.
 *
 * The original library exposes this as visually-implicit grouping inside
 * `<RibbonTab>`; we surface it as a real component so service pages can
 * compose richer layouts.
 */
export default function RibbonGroup({ title, children, style }) {
  return (
    <div className={styles.group} style={style}>
      <div className={styles.groupBody}>{children}</div>
      {title ? <div className={styles.groupTitle}>{title}</div> : null}
    </div>
  );
}
