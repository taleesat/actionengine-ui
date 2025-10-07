import * as React from "react";
import { message, Button, Input, Table, Typography } from "antd";
import { PlayCircleOutlined, StopOutlined, ExportOutlined } from "@ant-design/icons";
import { getServerUrl } from "../../utils";

const { Title, Text } = Typography;

interface CrawlerViewProps {
  // No props needed - self-contained component
}

interface CrawlResult {
  key: string;
  state: string;
  atoms: Array<{
    id: string;
    description: string;
  }>;
}

export default function CrawlerView(): JSX.Element {
  const [urlInput, setUrlInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [logMessages, setLogMessages] = React.useState<string[]>([
    "[INFO] Ready to start crawling...",
    "[INFO] Waiting for URL input...",
  ]);
  const [crawlResults, setCrawlResults] = React.useState<CrawlResult[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [socket, setSocket] = React.useState<WebSocket | null>(null);

  const logContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll log to bottom when new messages are added
  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  const getBaseUrl = (url: string): string => {
    try {
      let baseUrl = url.replace(/(^\w+:|^)\/\//, "");
      if (baseUrl.startsWith("localhost")) {
        baseUrl = baseUrl.replace("/api", "");
      } else if (baseUrl === "/api") {
        baseUrl = window.location.host;
      } else {
        baseUrl = baseUrl.replace("/api", "").replace(/\/$/, "");
      }
      return baseUrl;
    } catch (error) {
      console.error("Error processing server URL:", error);
      throw new Error("Invalid server URL configuration");
    }
  };

  // Setup WebSocket connection
  const setupWebSocket = (): WebSocket | null => {
    try {
      const serverUrl = getServerUrl();
      const baseUrl = getBaseUrl(serverUrl);
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${baseUrl}/api/ws/crawler`;

      console.log("Connecting to WebSocket at:", wsUrl);

      const newSocket = new WebSocket(wsUrl);

      newSocket.onopen = () => {
        addLogMessage("[INFO] WebSocket connected");
      };

      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      newSocket.onclose = () => {
        addLogMessage("[INFO] WebSocket disconnected");
        setSocket(null);
      };

      newSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addLogMessage("[ERROR] WebSocket connection error");
      };

      setSocket(newSocket);
      return newSocket;
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
      addLogMessage("[ERROR] Failed to setup WebSocket connection");
      return null;
    }
  };

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case "status":
        if (data.status === "running") {
          setIsRunning(true);
          addLogMessage("[INFO] Crawling started");
        } else if (data.status === "stopped") {
          setIsRunning(false);
          addLogMessage("[INFO] Crawling stopped");
        } else if (data.status === "done") {
          setIsRunning(false);
          addLogMessage("[INFO] Crawling completed");
        }
        break;
      case "update_log":
        if (data.messages && Array.isArray(data.messages)) {
          data.messages.forEach((message: string) => {
            addLogMessage(`[INFO] ${message}`);
          });
        }
        break;
      case "update_result":
        if (data.result && Array.isArray(data.result)) {
          const newResults = data.result.map((item: any, index: number) => ({
            key: `${Date.now()}-${index}`,
            state: item.state || "",
            atoms: item.atoms || []
          }));
          setCrawlResults(prev => [...prev, ...newResults]);
          addLogMessage(`[SUCCESS] Received ${data.result.length} result(s)`);
        }
        break;
      case "save":
        if (data.data) {
          const yamlContent = data.data;
          const blob = new Blob([yamlContent], { type: 'text/yaml' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `crawl_results_${Date.now()}.yaml`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          messageApi.success("Results saved successfully");
          addLogMessage("[INFO] Results saved to YAML file");
        }
        break;
      default:
        console.log("Unknown message type:", data.type);
    }
  };

  const addLogMessage = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleStartCrawl = () => {
    if (!urlInput.trim()) {
      messageApi.error("Please enter a valid URL");
      return;
    }

    // Setup WebSocket if not connected
    let currentSocket = socket;
    if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
      currentSocket = setupWebSocket();
      if (!currentSocket) {
        messageApi.error("Failed to establish WebSocket connection");
        return;
      }
    }

    setIsRunning(true);
    setCrawlResults([]); // Clear previous results
    
    // Wait for socket to be ready, then send crawl command
    const sendCrawlCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "start",
          url: urlInput.trim()
        }));
        addLogMessage(`[INFO] ${urlInput} crawl started...`);
      } else {
        setTimeout(sendCrawlCommand, 100); // Retry after 100ms
      }
    };

    sendCrawlCommand();
  };

  const handleStopCrawl = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "stop"
      }));
    }
    setIsRunning(false);
    addLogMessage("[INFO] Crawling stopped by user");
  };

  const handleExportResults = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "download"
      }));
    }
    addLogMessage("[INFO] Export request sent");
  };

  // Cleanup WebSocket on component unmount
  React.useEffect(() => {
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  const columns = [
    {
      title: "State",
      dataIndex: "state",
      key: "state",
      width: "30%",
      render: (text: string) => (
        <Text style={{ fontSize: "12px", wordBreak: "break-all" }}>{text}</Text>
      ),
    },
    {
      title: "Atoms",
      dataIndex: "atoms",
      key: "atoms",
      width: "70%",
      render: (atoms: Array<{id: string, description: string}>) => (
        <ul style={{ fontSize: "12px", margin: 0, paddingLeft: "16px" }}>
          {atoms.map((atom) => (
            <li key={atom.id}>{atom.description}</li>
          ))}
        </ul>
      ),
    },
  ];

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
