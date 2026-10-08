"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import styles from "./ribbon.module.css";

/**
 * <RibbonDropdown>
 *   <RibbonIconButton caption="..."/>
 *   <RibbonDropdownMenu>...</RibbonDropdownMenu>
 * </RibbonDropdown>
 *
 * The first child is treated as the trigger; the second as the menu.
 */
export default function RibbonDropdown({ children }) {
  const arr = Children.toArray(children).filter(isValidElement);
  const [trigger, menu] = arr;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerNode = cloneElement(trigger, {
    onClick: () => setOpen((v) => !v),
    active: open || trigger.props.active,
  });

  return (
    <div className={classNames(styles.dropdownWrap)} ref={ref}>
      {triggerNode}
      {open && menu ? cloneElement(menu, { onClose: () => setOpen(false) }) : null}
    </div>
  );
}

/** Mirrors RibbonSplitButton from the README — same idea as RibbonDropdown,
 *  but with a separate caret. */
export function RibbonSplitButton({ caption, icon, onClick, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const arr = Children.toArray(children).filter(isValidElement);
  const menu = arr[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Lazy import to avoid cycles.
  const RibbonButton = require("./RibbonButton").default;

  return (
    <div className={classNames(styles.dropdownWrap, styles.splitButton)} ref={ref}>
      <RibbonButton caption={caption} icon={icon} onClick={onClick} />
      <button
        type="button"
        className={styles.dropdownToggle}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
      >
        ▾
      </button>
      {open && menu ? cloneElement(menu, { onClose: () => setOpen(false) }) : null}
    </div>
  );
}
