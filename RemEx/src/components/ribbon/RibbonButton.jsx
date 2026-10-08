"use client";

import classNames from "classnames";
import styles from "./ribbon.module.css";
import Icon from "./icons";

/**
 * Large button with stacked icon over caption — the default ribbon button.
 *
 *   <RibbonButton caption="Mail" icon="mif-envelop" onClick={...}/>
 */
export default function RibbonButton({ caption, icon, image, title, onClick, active, disabled, className }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={classNames(styles.button, { [styles.active]: active }, className)}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon path resolved at runtime from caller-supplied URL
        <img src={image} alt="" className={styles.icon} style={{ width: 24, height: 24 }} />
      ) : icon ? (
        <Icon name={icon} className={styles.icon} />
      ) : null}
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </button>
  );
}
