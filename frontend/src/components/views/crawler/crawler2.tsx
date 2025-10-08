import * as React from "react";
import { 
  message, 
  Button, 
  Input, 
  Table, 
  Typography, 
  Progress, 
  Card, 
  Divider, 
  Badge, 
  Tooltip, 
  Space, 
  Alert,
  Collapse,
  Tag,
  Statistic,
  Row,
  Col
} from "antd";
import { 
  PlayCircleOutlined, 
  StopOutlined, 
  ExportOutlined, 
  ReloadOutlined,
  GlobalOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  ExpandOutlined,
  CompressOutlined
} from "@ant-design/icons";
import { getServerUrl } from "../../utils";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

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

interface CrawlStats {
  totalStates: number;
  totalAtoms: number;
  pagesVisited: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

export default function CrawlerView(): JSX.Element {
  const [urlInput, setUrlInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [crawlProgress, setCrawlProgress] = React.useState(0);
  const [logEntries, setLogEntries] = React.useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Ready to start crawling...'
    }
  ]);
  const [crawlResults, setCrawlResults] = React.useState<CrawlResult[]>([]);
  const [crawlStats, setCrawlStats] = React.useState<CrawlStats>({
    totalStates: 0,
    totalAtoms: 0,
    pagesVisited: 0
  });
  const [messageApi, contextHolder] = message.useMessage();
  const [socket, setSocket] = React.useState<WebSocket | null>(null);
  const [expandedResults, setExpandedResults] = React.useState(false);

  const logContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll log to bottom when new messages are added
  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logEntries]);


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
        addLogEntry("success", "WebSocket connection established");
      };

      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          addLogEntry("error", "Error parsing WebSocket message");
        }
      };

      newSocket.onclose = () => {
        addLogEntry("warning", "WebSocket connection closed");
        setSocket(null);
      };

      newSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addLogEntry("error", "WebSocket connection error");
      };

      setSocket(newSocket);
      return newSocket;
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
      addLogEntry("error", "Failed to setup WebSocket connection");
      return null;
    }
  };

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case "status":
        if (data.status === "running") {
          setIsRunning(true);
          setCrawlProgress(10);
          addLogEntry("info", "Crawling started successfully");
        } else if (data.status === "stopped") {
          setIsRunning(false);
          setCrawlProgress(0);
          addLogEntry("warning", "Crawling stopped");
        } else if (data.status === "done") {
          setIsRunning(false);
          setCrawlProgress(100);
          addLogEntry("success", "Crawling completed successfully");
        } else if (data.status === "error") {
          setIsRunning(false);
          setCrawlProgress(0);
          addLogEntry("error", `Crawling failed: ${data.message || 'Unknown error'}`);
        }
        break;
      case "update_log":
        if (data.messages && Array.isArray(data.messages)) {
          data.messages.forEach((message: string) => {
            // Determine log level based on message content
            let level: LogEntry['level'] = 'info';
            if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
              level = 'error';
            } else if (message.toLowerCase().includes('warning') || message.toLowerCase().includes('warn')) {
              level = 'warning';
            } else if (message.toLowerCase().includes('success') || message.toLowerCase().includes('completed')) {
              level = 'success';
            }
            addLogEntry(level, message);
          });
          
          // Update progress based on log messages
          if (isRunning && crawlProgress < 90) {
            setCrawlProgress(prev => Math.min(prev + 2, 90));
          }
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
          
          // Update stats
          const totalAtoms = newResults.reduce((sum: number, result: CrawlResult) => sum + result.atoms.length, 0);
          setCrawlStats(prev => ({
            ...prev,
            totalStates: prev.totalStates + newResults.length,
            totalAtoms: prev.totalAtoms + totalAtoms,
            pagesVisited: prev.pagesVisited + 1
          }));
          
          addLogEntry("success", `Discovered ${newResults.length} new state(s) with ${totalAtoms} atoms`);
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
          addLogEntry("success", "Results exported to YAML file");
        }
        break;
      default:
        console.log("Unknown message type:", data.type);
    }
  };

  const addLogEntry = (level: LogEntry['level'], message: string) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    };
    setLogEntries(prev => [...prev, newEntry]);
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
    setCrawlStats({ totalStates: 0, totalAtoms: 0, pagesVisited: 0 });
    setCrawlProgress(0);
    
    // Wait for socket to be ready, then send crawl command
    const sendCrawlCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "start",
          url: urlInput.trim()
        }));
        addLogEntry("info", `Starting crawl for: ${urlInput}`);
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
    setCrawlProgress(0);
    addLogEntry("warning", "Crawling stopped by user");
  };

  const handleExportResults = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "download"
      }));
    }
    addLogEntry("info", "Export request sent");
  };

  const handleClearLogs = () => {
    setLogEntries([{
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Logs cleared'
    }]);
  };

  // Cleanup WebSocket on component unmount
  React.useEffect(() => {
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return <BugOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#ff4d4f';
      case 'warning': return '#faad14';
      case 'success': return '#52c41a';
      default: return '#1890ff';
    }
  };


  const columns = [
    {
      title: "State",
      dataIndex: "state",
      key: "state",
      width: "30%",
      render: (text: string) => (
        <Tooltip title={text}>
          <Text style={{ fontSize: "12px", wordBreak: "break-all" }} ellipsis>
            {text}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "Atoms",
      dataIndex: "atoms",
      key: "atoms",
      width: "60%",
      render: (atoms: Array<{id: string, description: string}>) => (
        <div>
          {atoms.length > 0 ? (
            <Collapse size="small" ghost>
              <Panel 
                header={
                  <Badge 
                    count={atoms.length} 
                    style={{ backgroundColor: '#52c41a' }}
                    showZero
                  >
                    <Text style={{ fontSize: "12px" }}>
                      {atoms.length} atom{atoms.length !== 1 ? 's' : ''} discovered
                    </Text>
                  </Badge>
                } 
                key="1"
              >
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {atoms.map((atom, index) => (
                    <div key={atom.id} style={{ marginBottom: '4px' }}>
                      <Tag color="blue" style={{ fontSize: '10px' }}>
                        {atom.id}
                      </Tag>
                      <Text style={{ fontSize: '11px' }}>
                        {atom.description}
                      </Text>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          ) : (
            <Text type="secondary" style={{ fontSize: "12px" }}>
              No atoms found
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: "10%",
      render: (_: any, record: CrawlResult) => (
        <Tooltip title="View state details">
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            size="small"
            onClick={() => {
              // Could open a modal with detailed state information
              console.log('View state:', record);
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="text-primary h-[calc(100vh-100px)] bg-primary relative rounded flex-1 w-full">
      {contextHolder}
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <Title level={2} style={{ margin: 0, color: "#1f2937" }}>
                <GlobalOutlined style={{ marginRight: '12px', color: '#1890ff' }} />
                Advanced Web Crawler
              </Title>
              <Paragraph style={{ margin: 0, color: "#6b7280" }}>
                Intelligent website analysis and action index generation
              </Paragraph>
            </div>
            <div className="flex items-center gap-4">
              <Badge 
                status={isRunning ? "processing" : socket ? "success" : "error"} 
                text={isRunning ? "Crawling" : socket ? "Connected" : "Disconnected"}
              />
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
            Crawler Controls
          </Title>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                type="url"
                placeholder="Enter website URL (e.g., https://example.com)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onPressEnter={handleStartCrawl}
                disabled={isRunning}
                size="large"
                prefix={<GlobalOutlined style={{ color: '#bfbfbf' }} />}
              />
            </div>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartCrawl}
              disabled={isRunning || !urlInput.trim()}
              size="large"
              loading={isRunning}
            >
              Start Crawl
            </Button>
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStopCrawl}
              disabled={!isRunning}
              size="large"
            >
              Stop
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportResults}
              disabled={crawlResults.length === 0}
              size="large"
            >
              Export Results
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
              size="large"
              title="Refresh Dashboard"
            />
          </div>
          
          {/* Progress Bar */}
          {isRunning && (
            <div style={{ marginTop: '16px' }}>
              <Progress 
                percent={crawlProgress} 
                status={crawlProgress === 100 ? "success" : "active"}
                showInfo={true}
                format={(percent) => `${percent}% Complete`}
              />
            </div>
          )}
        </div>

        {/* Statistics Section */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <Row gutter={16}>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="States Discovered"
                  value={crawlStats.totalStates}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Atoms Found"
                  value={crawlStats.totalAtoms}
                  prefix={<BugOutlined style={{ color: '#1890ff' }} />}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic
                  title="Pages Visited"
                  value={crawlStats.pagesVisited}
                  prefix={<GlobalOutlined style={{ color: '#722ed1' }} />}
                />
              </Card>
            </Col>
          </Row>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Results Table */}
          <div className="flex-1 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <Title level={4} style={{ margin: 0, color: "#374151" }}>
                Discovery Results
              </Title>
              <Space>
                <Button 
                  type="text" 
                  icon={expandedResults ? <CompressOutlined /> : <ExpandOutlined />}
                  onClick={() => setExpandedResults(!expandedResults)}
                  title={expandedResults ? "Collapse results" : "Expand results"}
                />
              </Space>
            </div>
            
            {crawlResults.length === 0 && !isRunning ? (
              <Alert
                message="No Results Yet"
                description="Start a crawl to see discovered states and atoms appear here in real-time."
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            ) : null}
            
            <Table
              columns={columns}
              dataSource={crawlResults}
              pagination={crawlResults.length > 10 ? { 
                pageSize: 10, 
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} states`
              } : false}
              scroll={{ y: expandedResults ? "calc(70vh - 200px)" : "calc(50vh - 120px)" }}
              size="small"
              style={{ height: "100%" }}
              loading={isRunning && crawlResults.length === 0}
            />
          </div>

          {/* Live Log */}
          <div className="flex-1 p-6 border-l border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <Title level={4} style={{ margin: 0, color: "#374151" }}>
                Live Activity Log
              </Title>
              <Space>
                <Badge count={logEntries.length} style={{ backgroundColor: '#1890ff' }} />
                <Button 
                  type="text" 
                  icon={<ReloadOutlined />} 
                  onClick={handleClearLogs}
                  title="Clear logs"
                  size="small"
                />
              </Space>
            </div>
            
            <div
              ref={logContainerRef}
              className="bg-gray-900 text-white p-4 rounded-lg font-mono text-sm overflow-y-auto h-full border border-gray-700"
              style={{ 
                height: expandedResults ? "calc(70vh - 200px)" : "calc(100vh - 400px)",
                fontFamily: "Consolas, 'Courier New', monospace"
              }}
            >
              {logEntries.map((entry) => (
                <div key={entry.id} className="mb-2 flex items-start gap-2">
                  <span className="text-gray-400 text-xs mt-1 min-w-[80px]">
                    {entry.timestamp}
                  </span>
                  <span className="mt-1">
                    {getLogIcon(entry.level)}
                  </span>
                  <span 
                    className="flex-1"
                    style={{ color: getLogColor(entry.level) }}
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2 animate-pulse mt-2">
                  <span className="text-gray-400 text-xs">
                    {new Date().toLocaleTimeString()}
                  </span>
                  <ClockCircleOutlined className="text-yellow-400" />
                  <span className="text-yellow-400">
                    Crawling in progress...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
