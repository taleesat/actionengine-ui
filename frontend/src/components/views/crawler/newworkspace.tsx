import React from "react";
import { Card, Input, Button, Typography, Divider } from "antd";
const { Title, Text } = Typography;

import { 
  PlayCircleOutlined, 
  GlobalOutlined,
  SearchOutlined,
} from "@ant-design/icons";

type Props = {
  onStartNewSession: (url: string) => void;
  onLoadPreviousSession: (session: string) => void;
};

const NewWorkspaceForm: React.FC<Props> = ({ onStartNewSession, onLoadPreviousSession }) => {

  const [urlInput, setUrlInput] = React.useState("");
  const [sessionIdInput, setSessionIdInput] = React.useState("");

  const handleStartCrawl = () => {
    if (!urlInput) return;
    onStartNewSession(urlInput);
  };

  const handleRetrieveSession = () => {
    if (!sessionIdInput.trim()) return;
    onLoadPreviousSession(sessionIdInput.trim());
  };

  return (
    <div className="mt-4">
      <Title level={3} style={{ color: "#cbd5e1", marginBottom: 24 }}>
        Start a new crawl session.
      </Title>
      <Card
        style={{
          background: "#1b1f26",
          border: "1px solid #2a2f37",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
              Enter a website URL to start crawling
            </Text>
            <Input
              type="url"
              placeholder="Enter website URL (e.g., https://example.com)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onPressEnter={handleStartCrawl}
              size="large"
              prefix={<GlobalOutlined style={{ color: '#bfbfbf' }} />}
            />
          </div>
          <div>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartCrawl}
              disabled={!urlInput.trim()}
              size="large"
              style={{ width: '100%' }}
            >
              Start Crawl
            </Button>
          </div>
        </div>
      </Card>

      <Divider style={{ borderColor: "#334155" }}>OR</Divider>

      <Title level={3} style={{ color: "#cbd5e1", marginBottom: 24 }}>
        Retrieve a previous crawl session.
      </Title>
      <Card
        style={{
          background: "#1b1f26",
          border: "1px solid #2a2f37",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
              Enter a session ID to retrieve previous crawl results
            </Text>
            <Input
              placeholder="Enter session ID (e.g., session_12345)"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              onPressEnter={handleRetrieveSession}
              size="large"
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            />
          </div>
          <div>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleRetrieveSession}
              disabled={!sessionIdInput.trim()}
              size="large"
              style={{ width: '100%', backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Retrieve Session
            </Button>
          </div>
        </div>
      </Card>
      {/* Footer - Data Privacy Notice */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-gray-200 py-2 z-10">
        <div className="text-center">
          <p className="text-xs text-gray-400">
            <u><a href="https://www.microsoft.com/en-us/privacy/data-privacy-notice" className="hover:text-gray-600">Data Privacy Notice</a></u>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default NewWorkspaceForm;