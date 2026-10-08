"use client";

import classNames from "classnames";
import styles from "./ribbon.module.css";
import Icon from "./icons";

/** Icon-first square button (small caption beneath). */
export default function RibbonIconButton({ caption, icon, image, title, onClick, active, className }) {
  return (
    <button
      type="button"
      title={title || caption}
      onClick={onClick}
      className={classNames(styles.iconButton, { [styles.active]: active }, className)}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon path resolved at runtime from caller-supplied URL
        <img src={image} alt="" className={styles.icon} style={{ width: 16, height: 16 }} />
      ) : icon ? (
        <Icon name={icon} className={styles.icon} />
      ) : null}
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </button>
  );
}
