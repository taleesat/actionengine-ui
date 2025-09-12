import React, { useState, useRef, lazy, Suspense } from "react";
import {
  VideoIcon,
  VideoOffIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MousePointerClick,
  X,
} from "lucide-react";
import BrowserIframe from "./DetailViewer/browser_iframe";
import BrowserModal from "./DetailViewer/browser_modal";
import FullscreenOverlay from "./DetailViewer/fullscreen_overlay"; // Import our new component
import { IPlan } from "../../types/plan";
// Define VNC component props type
interface VncScreenProps {
  url: string;
  scaleViewport?: boolean;
  background?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<any>;
}
// Lazy load the VNC component
const VncScreen = lazy<React.ComponentType<VncScreenProps>>(() =>
  // @ts-ignore
  import("react-vnc").then((module) => ({ default: module.VncScreen }))
);

interface DetailViewerProps {
  images: string[];
  imageTitles: string[];
  onMinimize: () => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  novncEndpoint?: string;
  onPause?: () => void;
  runStatus: string;
  detailViewerContainerId?: string;
  onToggleRecording?: () => void;
  recordingStatus?: string | null;
}

type TabType = "live";

const DetailViewer: React.FC<DetailViewerProps> = ({
  images,
  imageTitles,
  onMinimize,
  currentIndex,
  onIndexChange,
  novncEndpoint,
  onPause,
  runStatus,
  detailViewerContainerId,
  onToggleRecording,
  recordingStatus,
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>("live");
  const [viewMode, setViewMode] = useState<"iframe" | "novnc">("iframe");
  const vncRef = useRef();

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Add state for fullscreen control mode
  const [isControlMode, setIsControlMode] = useState(false);
  const browserIframeId = "browser-iframe-container";

  // State for tracking if control was handed back from modal
  const [showControlHandoverForm, setShowControlHandoverForm] = useState(false);

  // Handle take control action
  const handleTakeControl = () => {
    setIsControlMode(true);
  };

  // Exit control mode
  const exitControlMode = () => {
    setIsControlMode(false);
  };

  // Modal control handlers
  const handleModalControlHandover = () => {
    // Show the feedback form overlay in DetailViewer
    setIsControlMode(true);
    setShowControlHandoverForm(true);
  };

  // Add keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        handlePrevious();
      } else if (event.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex]);

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
    onIndexChange(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
    onIndexChange(newIndex);
  };

  const handleMaximizeClick = () => {
    setIsModalOpen(true);
  };

  const renderLiveTab = React.useMemo(() => {
    if (!novncEndpoint) {
      return (
        <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center">
          <p>Waiting for browser session to start...</p>
        </div>
      );
    }

    return (
      <div className="flex-1 w-full h-full flex flex-col">
        {viewMode === "iframe" ? (
          <BrowserIframe
            novncEndpoint={novncEndpoint}
            style={{
              height: "100%",
              flex: "1 1 auto",
            }}
            className="w-full flex-1"
            showDimensions={true}
            onPause={onPause}
            runStatus={runStatus}
            quality={7}
            viewOnly={false}
            scaling="local"
            showTakeControlOverlay={!isControlMode}
            onTakeControl={handleTakeControl}
            isControlMode={isControlMode}
          />
        ) : (
          <div
            className="relative w-full h-full flex flex-col"
            onMouseEnter={() => {}} // Moved overlay to BrowserIframe
            onMouseLeave={() => {}} // Moved overlay to BrowserIframe
          >
            <Suspense fallback={<div>Loading VNC viewer...</div>}>
              <VncScreen
                url={`ws://${novncEndpoint}`}
                scaleViewport
                background="#000000"
                style={{
                  width: "100%",
                  height: "100%",
                  flex: "1 1 auto",
                  alignSelf: "flex-start",
                  display: "flex",
                  flexDirection: "column",
                }}
                ref={vncRef}
              />
            </Suspense>
          </div>
        )}
      </div>
    );
  }, [novncEndpoint, viewMode, runStatus, onPause, isControlMode]);

  return (
    <>
      <div
        className="bg-tertiary rounded-lg shadow-lg p-4 h-full flex flex-col relative overflow-hidden"
        id={detailViewerContainerId}
      >
        {/* Tabs and Controls */}
        <div className="flex justify-between items-center mb-4 border-b flex-shrink-0">
          <div className="flex">
              Recording Browser Actions: {recordingStatus === "on" ? "🟢 (actions you performed will be reflected in the workflow after stopping the recording)" : "🔴"}
          </div>

          <div className="flex gap-5">
            <div className="flex">
              <button
                onClick={onToggleRecording}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Toggle recording"
              >
                {(recordingStatus === "on" ? <VideoOffIcon /> : <VideoIcon />)}
              </button>
            </div>
            <div className="flex">
              <button
                onClick={handleMaximizeClick}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                title="Open in full screen"
              >
                <Maximize2 size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {renderLiveTab}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t pt-2 mt-2">
          <p className="text-xs text-gray-200 text-center">
            You are working with the real website.
          </p>
        </div>
      </div>

      <BrowserModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        novncEndpoint={novncEndpoint}
        title="Browser View"
        onPause={onPause}
        runStatus={runStatus}
        onControlHandover={handleModalControlHandover}
        isControlMode={isControlMode}
        onTakeControl={handleTakeControl}
      />
    </>
  );
};

export default DetailViewer;
