import React from "react";
import { message } from "antd";
import CrawlerView from "./crawler/crawler";
import ContentHeader from "../contentheader";

export const CrawlerManager: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("crawlerSidebar");
      return stored !== null ? JSON.parse(stored) : true;
    }
    return true;
  });

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("crawlerSidebar", JSON.stringify(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  return (
    <div className="relative flex flex-col h-full w-full">
      {contextHolder}

      <ContentHeader
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onNewSession={() => {
          // No session management needed for crawler
          messageApi.info("Crawler is ready to use");
        }}
      />

      <div className="flex flex-1 relative">
        <div className="flex-1 transition-all duration-200">
          <CrawlerView />
        </div>
      </div>
    </div>
  );
};
