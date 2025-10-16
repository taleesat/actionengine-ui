import React from "react";
import { message } from "antd";
import CrawlerView from "./crawler/crawler2";
import CrawlerHeader from "../crawlerheader";

interface CrawlerManagerProps {
  onSessionIdChange?: (sessionId: string | null) => void;
}

export const CrawlerManager: React.FC<CrawlerManagerProps> = ({ onSessionIdChange }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("crawlerSidebar");
      return stored !== null ? JSON.parse(stored) : true;
    }
    return true;
  });
  const [showNewWorkspaceForm, setShowNewWorkspaceForm] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("crawlerSidebar", JSON.stringify(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  // Reset the showNewWorkspaceForm flag after it's been processed
  React.useEffect(() => {
    if (showNewWorkspaceForm) {
      // Use a timeout to reset the flag after the CrawlerView has processed it
      const timer = setTimeout(() => {
        setShowNewWorkspaceForm(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showNewWorkspaceForm]);

  return (
    <div className="relative flex flex-col h-full w-full">
      {contextHolder}

      <CrawlerHeader
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onNewSession={() => {
          setShowNewWorkspaceForm(true);
          messageApi.info("Starting new session");
        }}
      />

      <div className="flex flex-1 relative">
        <div className="flex-1 transition-all duration-200">
          <CrawlerView resetToForm={showNewWorkspaceForm} onSessionIdChange={onSessionIdChange} />
        </div>
      </div>
    </div>
  );
};
