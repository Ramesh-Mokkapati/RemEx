"use client";

import { Children, cloneElement, isValidElement } from "react";
import styles from "./ribbon.module.css";

/** Container for dropdown items. Receives onClose from <RibbonDropdown>. */
export default function RibbonDropdownMenu({ children, onClose, style }) {
  return (
    <div className={styles.dropdownMenu} style={style} role="menu">
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(child, {
              onClickWrapped: child.props.onClick
                ? (e) => {
                    child.props.onClick(e);
                    onClose && onClose();
                  }
                : () => onClose && onClose(),
            })
          : child
      )}
    </div>
  );
}

export function RibbonDropdownItem({ caption, icon, onClick, onClickWrapped }) {
  return (
    <div
      className={styles.dropdownItem}
      role="menuitem"
      onClick={onClickWrapped || onClick}
    >
      {icon ? <span className={styles.mif}>{icon}</span> : null}
      <span>{caption}</span>
    </div>
  );
}

export function RibbonDropdownDivider() {
  return <div className={styles.dropdownDivider} role="separator" />;
}

export function RibbonDropdownCheckItem({ caption, checked, onClick, onClickWrapped }) {
  return (
    <div
      className={`${styles.dropdownItem} ${checked ? styles.checked : styles.unchecked}`}
      role="menuitemcheckbox"
      aria-checked={!!checked}
      onClick={onClickWrapped || onClick}
    >
      <span>{caption}</span>
    </div>
  );
}
