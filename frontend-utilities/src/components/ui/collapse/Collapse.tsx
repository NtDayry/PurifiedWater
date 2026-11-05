import React, { ReactNode, useRef, useEffect, useState } from "react";

// Type definitions
interface CollapseProps {
  header?: ReactNode;
  children: ReactNode;
  isOpen?: boolean;
  className?: string;
}

export const Collapse: React.FC<CollapseProps> = ({
  header,
  children,
  isOpen: controlledIsOpen,
  className = "",
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState("0px");

  const isOpen = controlledIsOpen;

  useEffect(() => {
    if (isOpen && contentRef.current) {
      // set ความสูงใหม่ทุกครั้งที่เปิดหรือ children เปลี่ยน
      setMaxHeight(`${(contentRef.current.scrollHeight) + 50}px`);
    } else {
      setMaxHeight("0px");
    }
  }, [isOpen, children]); // children เปลี่ยนก็ recalculation

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight }}
    >
      <div
        ref={contentRef}
        className={className}
      >
        {header}
        <div className="">{children}</div>
      </div>
    </div>
  );
};
