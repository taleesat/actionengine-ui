import React, { useState, useEffect } from "react";
import SecurityBanner from "./SecurityBanner";

interface BrowserIframeProps {
  novncEndpoint?: string;
  novncProtocol?: string;
  style?: React.CSSProperties;
  className?: string;
  showDimensions?: boolean;
  onPause?: () => void;
  runStatus?: string;
  quality?: number; // 0-9
  viewOnly?: boolean;
  scaling?: "local" | "remote" | "none";
  showTakeControlOverlay?: boolean;
  onTakeControl?: () => void;
  isControlMode?: boolean;
}

const BrowserIframe: React.FC<BrowserIframeProps> = ({
  novncEndpoint,
  novncProtocol = "http",
  style = {},
  className = "",
  showDimensions = true,
  onPause,
  runStatus,
  quality = 9,
  viewOnly = false,
  scaling = "local",
  showTakeControlOverlay = true,
  onTakeControl,
  isControlMode = false,
}) => {
  const [iframeDimensions, setIframeDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [isHovering, setIsHovering] = useState(false);

  // Reset hover state when status changes back to active
  useEffect(() => {
    if (runStatus === "active") {
      setIsHovering(false);
    }
  }, [runStatus]);

  const handleOverlayClick = () => {
    if (runStatus === "active") {
      // Call both onPause and onTakeControl
      if (onPause) {
        onPause();
      }

      // Signal that take control was clicked
      if (onTakeControl) {
        onTakeControl();
      }
    }
  };

  if (!novncEndpoint) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Waiting for browser session to start...</p>
      </div>
    );
  }

  // Build VNC URL with parameters
  const vncUrl = `${novncProtocol}://${novncEndpoint}/vnc.html?autoconnect=true&resize=${
    scaling === "remote" ? "remote" : "scale"
  }&show_dot=true&scaling=${scaling}&quality=${quality}&compression=0&view_only=${
    viewOnly ? 1 : 0
  }`;

  return (
    <div
      className={`relative w-full h-full ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {showDimensions && (
        <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-10">
          {iframeDimensions.width} × {iframeDimensions.height}
        </div>
      )}

      <iframe
        src={vncUrl}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          ...style,
        }}
        title="Browser View"
        className="rounded"
        onLoad={(e) => {
          const iframe = e.target as HTMLIFrameElement;
          setIframeDimensions({
            width: iframe.offsetWidth,
            height: iframe.offsetHeight,
          });
        }}
      />

    </div>
  );
};

export default BrowserIframe;
