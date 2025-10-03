import * as React from "react";
import { message, Button, Input, Table, Typography } from "antd";
import { PlayCircleOutlined, StopOutlined, ExportOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { Session } from "../../types/datamodel";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CrawlerViewProps {
  session: Session | null;
  onSessionNameChange: (sessionData: Partial<Session>) => void;
  getSessionSocket: (
    sessionId: number,
    runId: string,
    fresh_socket: boolean,
    only_retrieve_existing_socket: boolean
  ) => WebSocket | null;
  visible?: boolean;
  onRunStatusChange: (sessionId: number, status: any) => void;
}

interface CrawlResult {
  key: string;
  url: string;
  actions: string;
  status: string;
}

export default function CrawlerView({
  session,
  onSessionNameChange,
  getSessionSocket,
  visible = true,
  onRunStatusChange,
}: CrawlerViewProps) {
  const [urlInput, setUrlInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [logMessages, setLogMessages] = React.useState<string[]>([
    "[INFO] Ready to start crawling...",
    "[INFO] Waiting for URL input...",
  ]);
  const [crawlResults, setCrawlResults] = React.useState<CrawlResult[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  const logContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll log to bottom when new messages are added
  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  const addLogMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleStartCrawl = () => {
    if (!urlInput.trim()) {
      messageApi.error("Please enter a valid URL");
      return;
    }

    setIsRunning(true);
    addLogMessage(`[INFO] ${urlInput} crawl started...`);
    
    // Update session name with URL
    if (session?.id) {
      onSessionNameChange({
        id: session.id,
        name: `Crawling: ${urlInput.slice(0, 30)}${urlInput.length > 30 ? '...' : ''}`,
      });
    }

    // Simulate crawling process
    setTimeout(() => {
      addLogMessage(`[SUCCESS] Fetched: ${urlInput}`);
      setCrawlResults(prev => [...prev, {
        key: Date.now().toString(),
        url: urlInput,
        actions: "GET, Parse Links",
        status: "Success"
      }]);
      
      // Simulate additional pages being crawled
      const subPages = ["/about", "/contact", "/products"];
      subPages.forEach((page, index) => {
        setTimeout(() => {
          const fullUrl = `${urlInput}${page}`;
          if (Math.random() > 0.2) { // 80% success rate
            addLogMessage(`[SUCCESS] Fetched: ${fullUrl}`);
            setCrawlResults(prev => [...prev, {
              key: (Date.now() + index).toString(),
              url: fullUrl,
              actions: "GET, Extract Data",
              status: "Success"
            }]);
          } else {
            addLogMessage(`[ERROR] Failed: ${fullUrl}`);
            setCrawlResults(prev => [...prev, {
              key: (Date.now() + index).toString(),
              url: fullUrl,
              actions: "GET",
              status: "Failed"
            }]);
          }
        }, (index + 1) * 1000);
      });

      // Complete crawling after all pages
      setTimeout(() => {
        setIsRunning(false);
        addLogMessage("[INFO] Crawling completed");
        if (session?.id) {
          onRunStatusChange(session.id, "complete");
        }
      }, 5000);
    }, 1000);

    if (session?.id) {
      onRunStatusChange(session.id, "active");
    }
  };

  const handleStopCrawl = () => {
    setIsRunning(false);
    addLogMessage("[INFO] Crawling stopped by user");
    if (session?.id) {
      onRunStatusChange(session.id, "stopped");
    }
  };

  const handleExportResults = () => {
    if (crawlResults.length === 0) {
      messageApi.warning("No results to export");
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8," + 
      "URL,Actions,Status\n" +
      crawlResults.map(result => `${result.url},${result.actions},${result.status}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `crawl_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    messageApi.success("Results exported successfully");
    addLogMessage("[INFO] Results exported to CSV");
  };

  const columns = [
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      width: "50%",
      render: (text: string) => (
        <Text style={{ fontSize: "12px", wordBreak: "break-all" }}>{text}</Text>
      ),
    },
    {
      title: "Actions",
      dataIndex: "actions",
      key: "actions",
      width: "30%",
      render: (text: string) => (
        <Text style={{ fontSize: "12px" }}>{text}</Text>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: "20%",
      render: (status: string) => (
        <Text 
          style={{ 
            fontSize: "12px",
            color: status === "Success" ? "#52c41a" : "#ff4d4f"
          }}
        >
          {status}
        </Text>
      ),
    },
  ];

  if (!visible) {
    return null;
  }

  return (
    <div className="text-primary h-[calc(100vh-100px)] bg-primary relative rounded flex-1 w-full">
      {contextHolder}
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <Title level={2} style={{ margin: 0, color: "#1f2937" }}>
            Web Crawler Dashboard
          </Title>
        </div>

        {/* Controls Section */}
        <div className="p-6 border-b border-gray-200">
          <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
            Controls
          </Title>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                type="url"
                placeholder="Enter website URL"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onPressEnter={handleStartCrawl}
                disabled={isRunning}
                size="large"
              />
            </div>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartCrawl}
              disabled={isRunning || !urlInput.trim()}
              size="large"
            >
              Start Crawl
            </Button>
            <Button
              icon={<StopOutlined />}
              onClick={handleStopCrawl}
              disabled={!isRunning}
              size="large"
            >
              Stop
            </Button>
            <Button
              icon={<ExportOutlined />}
              onClick={handleExportResults}
              disabled={crawlResults.length === 0}
              size="large"
            >
              Export Results
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Results Table */}
          <div className="flex-1 p-6 overflow-hidden">
            <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
              Live Results
            </Title>
            <Table
              columns={columns}
              dataSource={crawlResults}
              pagination={false}
              scroll={{ y: "calc(50vh - 120px)" }}
              size="small"
              style={{ height: "100%" }}
            />
          </div>

          {/* Live Log */}
          <div className="flex-1 p-6 border-l border-gray-200 overflow-hidden">
            <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
              Live Log
            </Title>
            <div
              ref={logContainerRef}
              className="bg-black text-green-400 p-4 rounded font-mono text-sm overflow-y-auto h-full"
              style={{ 
                height: "calc(100vh - 300px)",
                fontFamily: "Consolas, 'Courier New', monospace"
              }}
            >
              {logMessages.map((log, index) => (
                <div key={index} className="whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {isRunning && (
                <div className="animate-pulse">
                  <span className="text-yellow-400">[INFO] Crawling in progress...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
