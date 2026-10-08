"use client";

import classNames from "classnames";
import styles from "./ribbon.module.css";
import Icon from "./icons";

/** Compact horizontal button (icon + caption on one line). */
export default function RibbonToolButton({ caption, icon, image, title, onClick, active, className }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={classNames(styles.toolButton, { [styles.active]: active }, className)}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon path resolved at runtime from caller-supplied URL
        <img src={image} alt="" className={styles.icon} style={{ width: 14, height: 14 }} />
      ) : icon ? (
        <Icon name={icon} className={styles.icon} />
      ) : null}
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </button>
  );
}
