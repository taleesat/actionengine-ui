import * as React from "react";
import { 
  message, 
  Button, 
  Table, 
  Typography, 
  Card, 
  Badge, 
  Tooltip, 
  Space, 
  Collapse,
  Tag,
  Statistic,
  Row,
  Col,
  Tabs
} from "antd";
import { 
  StopOutlined, 
  GlobalOutlined,
  DownloadOutlined,
  EyeOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { getServerUrl } from "../../utils";
import NewWorkspaceForm from "./newworkspace";

const { Title, Text } = Typography;
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

interface CrawlStats {
  totalStates: number;
  totalAtoms: number;
  totalTrajectories: number;
  visitedUrls: number;
  crawledUrls: number;
  crawledUiElements: number;
}

interface ScreenshotData {
  imageUrl: string;
  timestamp: string;
}

interface CrawlerViewProps {
  resetToForm?: boolean;
  onSessionIdChange?: (sessionId: string | null) => void;
  onUrlChange?: (url: string | null) => void;
}

export default function CrawlerView({ resetToForm, onSessionIdChange, onUrlChange }: CrawlerViewProps): JSX.Element {
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isStarted, setIsStarted] = React.useState(false);
  const [actionStatus, setActionStatus] = React.useState<string>("unknown");
  const [trajectoryStatus, setTrajectoryStatus] = React.useState<string>("unknown");
  const [currentUrl, setCurrentUrl] = React.useState<string>("");
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
  const [actionScreenshot, setActionScreenshot] = React.useState<ScreenshotData | null>(null);
  const [trajectoryScreenshot, setTrajectoryScreenshot] = React.useState<ScreenshotData | null>(null);

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
        setSocket(null);
      };

      newSocket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      setSocket(newSocket);
      return newSocket;
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
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
          // Notify parent component about session ID change
          if (onSessionIdChange) {
            onSessionIdChange(data.session);
          }
        }
        
        // Update current URL if provided
        if (data.url) {
          setCurrentUrl(data.url);
          // Notify parent component about URL change
          if (onUrlChange) {
            onUrlChange(data.url);
          }
        }
        
        // Update individual crawler statuses
        if (data.action_status) {
          setActionStatus(data.action_status);
        }
        if (data.trajectory_status) {
          setTrajectoryStatus(data.trajectory_status);
        }
        
        // Determine overall running state based on individual statuses
        const actionRunning = data.action_status === "running";
        const trajectoryRunning = data.trajectory_status === "running";
        const anyRunning = actionRunning || trajectoryRunning;
        
        if (anyRunning) {
          setIsRunning(true);
          const urlMessage = data.url ? ` for ${data.url}` : "";
          const message = data.session 
            ? `Crawling started successfully (Session: ${data.session})${urlMessage}`
            : `Crawling started successfully${urlMessage}`;
        } else if (data.action_status === "stopped" && data.trajectory_status === "stopped") {
          setIsRunning(false);
        } else if (data.action_status === "done" && data.trajectory_status === "done") {
          setIsRunning(false);
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
        }
        break;
      case "screenshot":
        const timestamp = new Date().toLocaleTimeString();
        
        // Handle action screenshot
        if (data.action_image_url) {
          const actionScreenshotData: ScreenshotData = {
            imageUrl: data.action_image_url,
            timestamp: timestamp
          };
          setActionScreenshot(actionScreenshotData);
        }
        
        // Handle trajectory screenshot
        if (data.trajectory_image_url) {
          const trajectoryScreenshotData: ScreenshotData = {
            imageUrl: data.trajectory_image_url,
            timestamp: timestamp
          };
          setTrajectoryScreenshot(trajectoryScreenshotData);
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
        }
        break;
      default:
        console.log("Unknown message type:", data.type);
    }
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
  };

  const handleExportResults = () => {
    if (socket && socket.readyState === WebSocket.OPEN && currentSessionId) {
      socket.send(JSON.stringify({
        type: "download",
        session: currentSessionId
      }));
    }
  };

  // Callback functions for NewWorkspaceForm
  const handleNewSessionFromForm = (url: string) => {
    setCurrentUrl(url); // Set the current URL immediately
    
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
    setActionScreenshot(null); // Clear previous screenshots
    setTrajectoryScreenshot(null);
    setCurrentSessionId(null); // Clear previous session ID
    setActionStatus("unknown"); // Reset statuses
    setTrajectoryStatus("unknown");
    
    // Wait for socket to be ready, then send crawl command
    const sendCrawlCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "start",
          url: url.trim()
        }));
      } else {
        setTimeout(sendCrawlCommand, 100); // Retry after 100ms
      }
    };

    sendCrawlCommand();
  };

  const handleLoadSessionFromForm = (sessionId: string) => {
    
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
    setActionScreenshot(null);
    setTrajectoryScreenshot(null);
    
    // Wait for socket to be ready, then send retrieve command
    const sendRetrieveCommand = () => {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(JSON.stringify({
          type: "load",
          session: sessionId.trim()
        }));
        setIsRunning(true); // Set running state to show main UI
      } else {
        setTimeout(sendRetrieveCommand, 100); // Retry after 100ms
      }
    };

    sendRetrieveCommand();
  };

  // Handle reset to form when prop changes
  React.useEffect(() => {
    if (resetToForm) {
      setIsStarted(false);
      setIsRunning(false);
      setCurrentSessionId(null);
      setCurrentUrl("");
      setCrawlResults([]);
      setTrajectoryResults([]);
      setCrawlStats({
        totalStates: 0,
        totalAtoms: 0,
        totalTrajectories: 0,
        visitedUrls: 0,
        crawledUrls: 0,
        crawledUiElements: 0
      });
      setActionScreenshot(null);
      setTrajectoryScreenshot(null);
      setActionStatus("unknown");
      setTrajectoryStatus("unknown");
      
      // Close existing socket connection
      if (socket) {
        socket.close();
        setSocket(null);
      }
    }
  }, [resetToForm, socket]);

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
                      <Text style={{ fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                        {index + 1}: {action}
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
          <div className="w-350 mx-auto p-8">
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

        {/* Status Section - All cards in a single row */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <Title level={4} style={{ marginBottom: "16px", color: "#374151" }}>
            Status
          </Title>
          <Row gutter={16}>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GlobalOutlined style={{ color: '#1890ff', fontSize: '16px' }} />
                    <Text strong style={{ fontSize: '16px' }}>
                      Target URL
                    </Text>
                  </div>
                  {currentUrl ? (
                    <Text 
                      style={{ 
                        fontSize: '14px', 
                        color: '#1890ff', 
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        wordBreak: 'break-all'
                      }}
                      onClick={() => window.open(currentUrl, '_blank')}
                      ellipsis
                    >
                      {currentUrl}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: '14px', color: '#999', fontStyle: 'italic' }}>
                      No URL available
                    </Text>
                  )}
                </Space>
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CodeOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
                    <Text strong style={{ fontSize: '10px' }}>
                      Function Crawler:
                    </Text>
                    {actionStatus === "running" && <Badge status="processing" />}
                    {actionStatus === "done" && <Badge status="success" />}
                    {actionStatus === "stopped" && <Badge status="warning" />}
                    {actionStatus === "unknown" && <Badge status="warning" />}
                    <Text style={{ fontSize: '10px', textTransform: 'capitalize' }}>
                      {actionStatus}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CodeOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
                    <Text strong style={{ fontSize: '10px' }}>
                      Task Crawler:
                    </Text>
                    {trajectoryStatus === "running" && <Badge status="processing" />}
                    {trajectoryStatus === "done" && <Badge status="success" />}
                    {trajectoryStatus === "stopped" && <Badge status="warning" />}
                    {trajectoryStatus === "unknown" && <Badge status="warning" />}
                    <Text style={{ fontSize: '10px', textTransform: 'capitalize' }}>
                      {trajectoryStatus}
                    </Text>
                  </div>
                </Space>
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Statistic
                  title="Page Discovered"
                  value={crawlStats.visitedUrls}
                  valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Statistic
                  title="Pages Crawled"
                  value={crawlStats.crawledUrls}
                  valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Statistic
                  title="Functions Discovered"
                  value={crawlStats.totalAtoms}
                  valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: '100px' }}>
                <Statistic
                  title="Tasks Identified"
                  value={crawlStats.totalTrajectories}
                  valueStyle={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff' }}
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
            {/* Screenshot Display Section with Tabs */}
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <Title level={4} style={{ margin: 0, color: "#374151" }}>
                  <EyeOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                  Live Screenshots
                </Title>
              </div>
              
              <Tabs
                defaultActiveKey="action"
                className="flex-1"
                style={{ height: '100%' }}
                items={[
                  {
                    key: 'action',
                    label: (
                      <span>
                        <CodeOutlined /> Function Crawler
                      </span>
                    ),
                    children: (
                      <div className="h-full flex flex-col" style={{ height: 'calc(100% - 40px)' }}>
                        {actionScreenshot ? (
                          <>
                            <div className="mb-2">
                              <Badge 
                                status="success" 
                                text={`Updated at ${actionScreenshot.timestamp}`}
                              />
                            </div>
                            <Card className="flex-1" bodyStyle={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img
                                src={actionScreenshot.imageUrl}
                                alt="Action Crawler Screenshot"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain',
                                  border: '1px solid #d9d9d9',
                                  borderRadius: '6px',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                }}
                                onError={(e) => {
                                  console.error('Error loading action screenshot:', e);
                                }}
                              />
                            </Card>
                          </>
                        ) : (
                          <Card className="flex-1" bodyStyle={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="text-center">
                              <Title level={5} type="secondary">
                                Function crawler is starting, this may take a few seconds...
                              </Title>
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                Function crawler screenshots will appear here
                              </Text>
                            </div>
                          </Card>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'trajectory',
                    label: (
                      <span>
                        <CodeOutlined /> Task Crawler
                      </span>
                    ),
                    children: (
                      <div className="h-full flex flex-col" style={{ height: 'calc(100% - 40px)' }}>
                        {trajectoryScreenshot ? (
                          <>
                            <div className="mb-2">
                              <Badge 
                                status="success" 
                                text={`Updated at ${trajectoryScreenshot.timestamp}`}
                              />
                            </div>
                            <Card className="flex-1" bodyStyle={{ padding: '16px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img
                                src={trajectoryScreenshot.imageUrl}
                                alt="Trajectory Crawler Screenshot"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '100%',
                                  objectFit: 'contain',
                                  border: '1px solid #d9d9d9',
                                  borderRadius: '6px',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                }}
                                onError={(e) => {
                                  console.error('Error loading trajectory screenshot:', e);
                                }}
                              />
                            </Card>
                          </>
                        ) : (
                          <Card className="flex-1" bodyStyle={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="text-center">
                              <Title level={5} type="secondary">
                                Task crawler is starting, this may take a few seconds...
                              </Title>
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                Task crawler screenshots will appear here
                              </Text>
                            </div>
                          </Card>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
