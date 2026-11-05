import React, { useState } from "react";

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
}

const Tooltip: React.FC<TooltipProps> = ({
  children,
  text,
  className = "",
  position = "top",
}) => {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-3",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-3",
    left: "right-full top-1/2 -translate-y-1/2 mr-3",
    right: "left-full top-1/2 -translate-y-1/2 ml-3",
  };

const arrowStyles = {
  top: "bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-l-6 border-r-6 border-t-6 border-transparent border-t-gray-600",
  bottom: "top-0 left-1/2 -translate-x-1/2 -translate-y-full border-l-6 border-r-6 border-b-6 border-transparent border-b-gray-600",
  left: "top-1/2 right-0 -translate-y-1/2 translate-x-full border-t-6 border-b-6 border-l-6 border-transparent border-l-gray-600",
  right: "top-1/2 left-0 -translate-y-1/2 -translate-x-full border-t-6 border-b-6 border-r-6 border-transparent border-r-gray-600",
};

  return (
    <div
      className={`inline-flex relative ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-gray-800 dark:bg-gray-600 px-2 py-1 text-xs text-white shadow animate-fadeIn ${positionClasses[position]}`}
        >
          {text}
          <div className={`absolute w-0 h-0 ${arrowStyles[position]}`} />
        </div>
      )}
    </div>
  );
};

export default Tooltip;