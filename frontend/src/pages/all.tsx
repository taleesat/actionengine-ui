import * as React from "react";
import { graphql } from "gatsby";
import { appContext } from "../hooks/provider";
import "antd/dist/reset.css";
import { ConfigProvider, theme, Tabs } from "antd";
import { SessionManager } from "../components/views/manager";
import { CrawlerManager } from "../components/views/crawler_manager";

const classNames = (...classes: (string | undefined | boolean)[]) => {
  return classes.filter(Boolean).join(" ");
};

type Props = {
  data: any;
};

const Page = ({ data }: Props) => {
  const { darkMode, user, setUser } = React.useContext(appContext);
  const [activeTab, setActiveTab] = React.useState<string>("agent");
  const [crawlerSessionId, setCrawlerSessionId] = React.useState<string | null>(null);
  const [crawlerUrl, setCrawlerUrl] = React.useState<string | null>(null);

  // Mimic sign-in: if no user or user.email, set default user and localStorage
  React.useEffect(() => {
    if (!user?.email) {
      const defaultEmail = "default";
      setUser({ ...user, email: defaultEmail, name: defaultEmail });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("user_email", defaultEmail);
      }
    }
  }, [user, setUser]);

  React.useEffect(() => {
    document.getElementsByTagName("html")[0].className = `${
      darkMode === "dark" ? "dark bg-primary" : "light bg-primary"
    }`;
  }, [darkMode]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
  };

  const handleCrawlerSessionId = (sessionId: string | null) => {
    setCrawlerSessionId(sessionId);
  };

  const handleCrawlerUrl = (url: string | null) => {
    setCrawlerUrl(url);
  };

  return (
    <div className="h-screen flex">
      {/* Content area */}
      <div
        className={classNames(
          "flex-1 flex flex-col min-h-screen",
          "transition-all duration-300 ease-in-out",
          "md:pl-1"
        )}
      >
        <ConfigProvider
          theme={{
            token: {
              borderRadius: 4,
              colorBgBase: darkMode === "dark" ? "#2a2a2a" : "#ffffff",
            },
            algorithm:
              darkMode === "dark"
                ? theme.darkAlgorithm
                : theme.defaultAlgorithm,
          }}
        >
          <main className="flex-1 p-1 text-primary" style={{ height: "100%" }}>
            <div className="mb-4 px-4 pt-4">
              <h1 className="text-2xl font-bold text-center">
                Action Engine Agent (Index-Enhanced Web Agent) & Action Index Crawler (Crawling for Actions on Web Pages)
              </h1>
            </div>
            <Tabs
              activeKey={activeTab}
              onChange={handleTabChange}
              type="card"
              size="large"
              className="h-full"
              tabBarStyle={{
                margin: 0,
                padding: "0 16px",
                backgroundColor: darkMode === "dark" ? "#1f1f1f" : "#fafafa",
                borderBottom: `1px solid ${darkMode === "dark" ? "#333" : "#d9d9d9"}`,
              }}
              items={[
                {
                  key: "agent",
                  label: "Action Engine Agent",
                  children: (
                    <div className="h-full">
                      <SessionManager crawlerSessionId={crawlerSessionId} crawlerUrl={crawlerUrl} />
                    </div>
                  ),
                },
                {
                  key: "crawler",
                  label: "Index Crawler",
                  children: (
                    <div className="h-full">
                      <CrawlerManager onSessionIdChange={handleCrawlerSessionId} onUrlChange={handleCrawlerUrl} />
                    </div>
                  ),
                },
              ]}
            />
          </main>
        </ConfigProvider>
      </div>
    </div>
  );
};

export const query = graphql`
  query TabbedPageQuery {
    site {
      siteMetadata {
        description
        title
      }
    }
  }
`;

export default Page;
