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
  CompressOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { getServerUrl } from "../../utils";
import NewWorkspaceForm from "./newworkspace";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface CrawlResult {
  key: string;
  functionId: string;
  description: string;
}

interface TrajectoryResult {
  key: string;
  id: string;
  description: string;
  actions: string[];
}

// New message schema interface
interface UpdateResultMessage {
  type: "update_result";
  atoms: Array<{
    state: string;
    atoms: Array<{
      id: string;
      description: string;
    }>;
  }>;
  trajectories: Array<{
    description: string;
    actions: string[];
  }>;
}

interface CrawlStats {
  totalStates: number;
  totalAtoms: number;
  totalTrajectories: number;
  visitedUrls: number;
  crawledUrls: number;
  crawledUiElements: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

interface ScreenshotData {
  imageUrl: string;
  timestamp: string;
}

export default function CrawlerView(): JSX.Element {
  const [urlInput, setUrlInput] = React.useState("");
  const [sessionIdInput, setSessionIdInput] = React.useState("");
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isStarted, setIsStarted] = React.useState(false);
  const [logEntries, setLogEntries] = React.useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Ready to start crawling...'
    }
  ]);
  const [crawlResults, setCrawlResults] = React.useState<CrawlResult[]>([]);
  const [trajectoryResults, setTrajectoryResults] = React.useState<TrajectoryResult[]>([]);
  const [crawlStats, setCrawlStats] = React.useState<CrawlStats>({
    totalStates: 0,
    totalAtoms: 0,
    totalTrajectories: 0,
    visitedUrls: 0,
    crawledUrls: 0,
    crawledUiElements: 0
  });
  const [messageApi, contextHolder] = message.useMessage();
  const [socket, setSocket] = React.useState<WebSocket | null>(null);
  const [currentScreenshot, setCurrentScreenshot] = React.useState<ScreenshotData | null>(null);

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
    console.log("Received WebSocket message:", data);
    switch (data.type) {
      case "status":
        // Handle new schema with session field
        if (data.session) {
          setCurrentSessionId(data.session);
          addLogEntry("info", `Session ID: ${data.session}`);
        }
        
        if (data.status === "running") {
          setIsRunning(true);
          const message = data.session 
            ? `Crawling started successfully (Session: ${data.session})`
            : "Crawling started successfully";
          addLogEntry("info", message);
        } else if (data.status === "stopped") {
          setIsRunning(false);
          addLogEntry("warning", "Crawling stopped");
        } else if (data.status === "done") {
          setIsRunning(false);
          addLogEntry("success", "Crawling completed successfully");
        } else if (data.status === "error") {
          setIsRunning(false);
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
        }
        break;
      case "update_result":
        // Handle new schema: { type: "update_result", atoms: [...], trajectories: [...] }
        if (data.atoms && Array.isArray(data.atoms)) {
          // Flatten atoms into individual rows
          const newResults: CrawlResult[] = [];
          let totalAtoms = 0;
          
          data.atoms.forEach((atomGroup: any) => {
            if (atomGroup.atoms && Array.isArray(atomGroup.atoms)) {
              atomGroup.atoms.forEach((atom: any) => {
                newResults.push({
                  key: `${Date.now()}-${totalAtoms}`,
                  functionId: atom.id || `function_${totalAtoms}`,
                  description: atom.description || "No description available"
                });
                totalAtoms++;
              });
            }
          });
          
          setCrawlResults(prev => [...prev, ...newResults]);
          
          // Handle trajectories from the new schema
          let trajectoryCount = 0;
          if (data.trajectories && Array.isArray(data.trajectories)) {
            trajectoryCount = data.trajectories.length;
            
            // Process and add trajectory results with simplified actions (now just strings)
            const newTrajectories = data.trajectories.map((trajectory: any, index: number) => ({
              key: `traj-${Date.now()}-${index}`,
              id: `trajectory_${index}`,
              description: trajectory.description || "No description available",
              actions: trajectory.actions || []
            }));
            setTrajectoryResults(prev => [...prev, ...newTrajectories]);
          }
          
          setCrawlStats(prev => ({
            ...prev,
            totalStates: prev.totalStates + data.atoms.length,
            totalAtoms: prev.totalAtoms + totalAtoms,
            totalTrajectories: prev.totalTrajectories + trajectoryCount
          }));
          
          const statusMessage = trajectoryCount > 0 
            ? `Discovered ${data.atoms.length} new state(s) with ${totalAtoms} atoms and ${trajectoryCount} trajectories`
            : `Discovered ${data.atoms.length} new state(s) with ${totalAtoms} atoms`;
          addLogEntry("success", statusMessage);
        }
        break;
      case "save":
        if (data.content) {
          const yamlContent = data.content;
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
      case "screenshot":
        if (data.image_url) {
          const screenshotData: ScreenshotData = {
            imageUrl: data.image_url,
            timestamp: new Date().toLocaleTimeString()
          };
          setCurrentScreenshot(screenshotData);
          addLogEntry("info", `Screenshot received: ${screenshotData.timestamp}`);
        }
        break;
      case "statistic":
        if (data.session && typeof data.num_visited_urls === 'number' && 
            typeof data.num_crawled_urls === 'number' && 
            typeof data.num_crawled_ui_elements === 'number') {
          setCrawlStats(prev => ({
            ...prev,
            visitedUrls: data.num_visited_urls,
            crawledUrls: data.num_crawled_urls,
            crawledUiElements: data.num_crawled_ui_elements
          }));
          //addLogEntry("info", `Statistics: ${data.num_visited_urls} visited, ${data.num_crawled_urls} crawled, ${data.num_crawled_ui_elements} UI elements`);
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

  const handleStopCrawl = () => {
    if (socket && socket.readyState === WebSocket.OPEN && currentSessionId) {
      console.log("Sending stop command for session:", currentSessionId);
      socket.send(JSON.stringify({
        type: "stop",
        session: currentSessionId
      }));
    }
    setIsRunning(false);
    addLogEntry("warning", "Crawling stopped by user");
  };

  const handleExportResults = () => {
    if (socket && socket.readyState === WebSocket.OPEN && currentSessionId) {
      socket.send(JSON.stringify({
        type: "download",
        session: currentSessionId
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

  // Callback functions for NewWorkspaceForm
  const handleNewSessionFromForm = (url: string) => {
    setUrlInput(url);
    
    // Setup WebSocket if not connected
    let currentSocket = socket;
    if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
      currentSocket = setupWebSocket();
      if (!currentSocket) {
        messageApi.error("Failed to establish WebSocket connection");
        return;
      }
    }

    setIsStarted(true);
    setCrawlResults([]); // Clear previous results
    setTrajectoryResults([]); // Clear previous trajectory results
    setCrawlStats({ totalStates: 0, totalAtoms: 0, totalTrajectories: 0, visitedUrls: 0, crawledUrls: 0, crawledUiElements: 0 });
    setCurrentScreenshot(null); // Clear previous screenshot
    setCurrentSessionId(null); // Clear previous session ID
    
    // Wait for socket to be ready, then send crawl command
    const sendCrawlCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "start",
          url: url.trim()
        }));
        addLogEntry("info", `Starting crawl for: ${url}`);
      } else {
        setTimeout(sendCrawlCommand, 100); // Retry after 100ms
      }
    };

    sendCrawlCommand();
  };

  const handleLoadSessionFromForm = (sessionId: string) => {
    setSessionIdInput(sessionId);
    
    // Setup WebSocket if not connected
    let currentSocket = socket;
    if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
      currentSocket = setupWebSocket();
      if (!currentSocket) {
        messageApi.error("Failed to establish WebSocket connection");
        return;
      }
    }

    // Clear previous results
    setIsStarted(true);
    setCrawlResults([]);
    setTrajectoryResults([]);
    setCrawlStats({ totalStates: 0, totalAtoms: 0, totalTrajectories: 0, visitedUrls: 0, crawledUrls: 0, crawledUiElements: 0 });
    setCurrentScreenshot(null);
    
    // Wait for socket to be ready, then send retrieve command
    const sendRetrieveCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "load",
          session: sessionId.trim()
        }));
        addLogEntry("info", `Retrieving session: ${sessionId}`);
        setIsRunning(true); // Set running state to show main UI
      } else {
        setTimeout(sendRetrieveCommand, 100); // Retry after 100ms
      }
    };

    sendRetrieveCommand();
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
      title: "Function",
      dataIndex: "functionId",
      key: "functionId",
      width: "30%",
      render: (text: string) => (
        <Text style={{ fontSize: "12px", wordBreak: "break-word" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      width: "70%",
      render: (text: string) => (
        <Text style={{ fontSize: "12px", wordBreak: "break-word" }}>
          {text}
        </Text>
      ),
    },
  ];

  const trajectoryColumns = [
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
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
      title: "Actions",
      dataIndex: "actions",
      key: "actions",
      width: "70%",
      render: (actions: string[]) => (
        <div>
          {actions.length > 0 ? (
            <Collapse size="small" ghost>
              <Panel 
                header={
                  <Text style={{ fontSize: "12px" }}>
                    {actions.length} action{actions.length !== 1 ? 's' : ''} in sequence
                  </Text>
                } 
                key="1"
              >
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {actions.map((action, index) => (
                    <div key={index} style={{ marginBottom: '4px', padding: '8px', border: '1px solid #f0f0f0', borderRadius: '4px' }}>
                      <Tag color="orange" style={{ fontSize: '10px', marginBottom: '4px' }}>
                        Action {index + 1}
                      </Tag>
                      <Text style={{ fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                        {action}
                      </Text>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          ) : (
            <Text type="secondary" style={{ fontSize: "12px" }}>
              No actions found
            </Text>
          )}
        </div>
      ),
    },
  ];

  // Conditional rendering: Show NewWorkspaceForm when not running, otherwise show main UI
  if (!isStarted) {
    return (
      <div className="text-primary h-[calc(100vh-100px)] bg-primary relative rounded flex-1 w-full">
        {contextHolder}
        <div className="flex flex-col h-full w-full justify-center items-center">
          <div className="w-full max-w-2xl mx-auto p-8">
            <NewWorkspaceForm
              onStartNewSession={handleNewSessionFromForm}
              onLoadPreviousSession={handleLoadSessionFromForm}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-primary h-[calc(100vh-100px)] bg-primary relative rounded flex-1 w-full">
      {contextHolder}
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <Title level={2} style={{ margin: 0, color: "#1f2937" }}>
                Index Crawler {(currentSessionId && `- Session: ${currentSessionId}`) || ''}
              </Title>
              <Text style={{ fontSize: '12px', color: 'black' }}>
                Please save your session ID for future reference.
              </Text>
            </div>
            <div className="flex items-center gap-4">
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleStopCrawl}
                disabled={!isRunning}
                size="large"
                style={{ width: '100%' }}
              >
                Stop Session
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportResults}
                disabled={crawlResults.length === 0}
                size="large"
                style={{ width: '100%' }}
              >
                Export Results
              </Button>
            </div>
          </div>
        </div>

        {/* Statistics Section */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
            Statistic
          </Title>
          <Row gutter={16}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Page Discovered"
                  value={crawlStats.visitedUrls}
                  valueStyle={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Pages Crawled"
                  value={crawlStats.crawledUrls}
                  valueStyle={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Functions Discovered"
                  value={crawlStats.totalAtoms}
                  valueStyle={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Tasks Identified"
                  value={crawlStats.totalTrajectories}
                  valueStyle={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
          </Row>
        </div>

        <div className="flex-1 flex">
          {/* Results Table */}
          <div className="flex-1 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <Title level={4} style={{ margin: 0, color: "#374151" }}>
                UI Functions
              </Title>
            </div>
            
            
            <Table
              columns={columns}
              dataSource={crawlResults}
              pagination={crawlResults.length > 10 ? { 
                pageSize: 10, 
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} functions`
              } : false}
              scroll={{ y: "calc(25vh - 60px)" }}
              size="small"
            />
            
            {/* Trajectory Results Table */}
            <div style={{ marginTop: '24px' }}>
              <Title level={4} style={{ margin: '0 0 16px 0', color: "#374151" }}>
                Trajectories
              </Title>
              
              <Table
                columns={trajectoryColumns}
                dataSource={trajectoryResults}
                pagination={trajectoryResults.length > 5 ? { 
                  pageSize: 5, 
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} trajectories`
                } : false}
                scroll={{ y: "calc(25vh - 60px)" }}
                size="small"
              />
            </div>
          </div>

          <div className="flex-1 p-6 border-l border-gray-200 overflow-hidden">
            {/* Screenshot Display Section */}
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <Title level={4} style={{ margin: 0, color: "#374151" }}>
                  <EyeOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                  Live Screenshot
                </Title>
                {currentScreenshot && (
                  <Badge 
                    status="success" 
                    text={`Updated at ${currentScreenshot.timestamp}`}
                  />
                )}
              </div>
              
              {currentScreenshot ? (
                <Card className="flex-1 flex flex-col" bodyStyle={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div className="flex-1 flex items-center justify-center" style={{ minHeight: '400px' }}>
                    <img
                      src={currentScreenshot.imageUrl}
                      alt={"Screenshot"}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        border: '1px solid #d9d9d9',
                        borderRadius: '6px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}
                      onError={(e) => {
                        console.error('Error loading screenshot:', e);
                        addLogEntry('error', 'Failed to load screenshot image');
                      }}
                      onLoad={() => {
                        addLogEntry('success', 'Screenshot image loaded successfully');
                      }}
                    />
                  </div>
                </Card>
              ) : (
                <Card className="flex-1 flex items-center justify-center" bodyStyle={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="text-center">
                    <EyeOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
                    <Title level={5} type="secondary">
                      No Screenshot Available
                    </Title>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Screenshots will appear here when received from the crawler
                    </Text>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
