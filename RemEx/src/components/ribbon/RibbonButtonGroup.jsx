"use client";

import { Children, cloneElement, isValidElement, useState } from "react";
import classNames from "classnames";
import styles from "./ribbon.module.css";

/**
 * <RibbonButtonGroup> — toggleable / radio group of buttons.
 * Props:
 *   - radio: only one child active at once
 *   - active: number | number[] of indices that are pre-selected
 */
export default function RibbonButtonGroup({ children, radio = false, active, style, row = false }) {
  const childArr = Children.toArray(children).filter(isValidElement);
  const initial = Array.isArray(active) ? active : active != null ? [active] : [];
  const [activeIdx, setActiveIdx] = useState(initial);

  const isActive = (i) => activeIdx.includes(i);

  const onChildClick = (i, originalOnClick) => (e) => {
    setActiveIdx((cur) => {
      if (radio) return [i];
      return cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
    });
    if (typeof originalOnClick === "function") originalOnClick(e);
  };

  return (
    <div className={classNames(styles.buttonGroup, { [styles.row]: row })} style={style}>
      {childArr.map((child, i) =>
        cloneElement(child, {
          active: isActive(i),
          onClick: onChildClick(i, child.props.onClick),
          key: i,
        })
      )}
    </div>
  );
}
