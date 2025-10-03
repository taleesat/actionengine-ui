import * as React from "react";
import { appContext } from "../hooks/provider";
import "antd/dist/reset.css";
import { ConfigProvider, theme } from "antd";
import { CrawlerManager } from "./views/crawler_manager";

const classNames = (...classes: (string | undefined | boolean)[]) => {
  return classes.filter(Boolean).join(" ");
};

type Props = {
  children?: React.ReactNode;
};

const CrawlerUILayout = ({}: Props) => {
  const { darkMode, user, setUser } = React.useContext(appContext);

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

  const layoutContent = (
    <div className="h-screen flex">
      {/* Content area */}
      <div
        className={classNames(
          "flex-1 flex flex-col min-h-screen",
          "transition-all duration-300 ease-in-out",
          "md:pl-1",
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
            <CrawlerManager />
          </main>
        </ConfigProvider>
      </div>
    </div>
  );


  return layoutContent;
};

export default CrawlerUILayout;