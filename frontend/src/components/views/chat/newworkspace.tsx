import React, { useEffect, useState } from "react";
import { Card, Form, Input, Button, Typography, Divider, Alert } from "antd";
const { Title } = Typography;

type Props = {
  onNewWorkspace: (workspaceName: string, websiteUrl: string) => void;
  onLoadWorkspace: (file: File) => void;
};

const NewWorkspaceForm: React.FC<Props> = ({ onNewWorkspace, onLoadWorkspace }) => {
  const [form] = Form.useForm();
  const [initialWebsiteUrl, setInitialWebsiteUrl] = useState("https://microsoft.com");

  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const siteParam = urlParams.get('site');
    
    if (siteParam) {
      // Ensure the URL has a protocol
      const websiteUrl = siteParam.startsWith('http://') || siteParam.startsWith('https://') 
        ? siteParam 
        : `https://${siteParam}`;
      setInitialWebsiteUrl(websiteUrl);
    }
  }, []);

  const handleFinish = (workspaceName: string, websiteUrl: string) => {
    onNewWorkspace(workspaceName, websiteUrl);
  };

  const handleLoadFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json"; // Adjust allowed file types if needed
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        onLoadWorkspace(file);
      }
    };
    input.click();
  };

  return (
    <div className="mt-4">
      <Title level={3} style={{ color: "#cbd5e1", marginBottom: 24 }}>
        Please provide your workspace name and the website URL to get started.
      </Title>
      <Card
        style={{
          background: "#1b1f26",
          border: "1px solid #2a2f37",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <Form
          form={form}
          layout="vertical"
          fields={[
            {
              name: "workspaceName",
              value: "MyWorkspace",
            },
            {
              name: "websiteUrl",
              value: initialWebsiteUrl,
            }
          ]}
          onFinish={() => {
            var workspaceName: string = form.getFieldValue("workspaceName");
            var websiteUrl = form.getFieldValue("websiteUrl");
            handleFinish(workspaceName, websiteUrl);
          }}
          requiredMark={false}
        >
          <Form.Item
            label={<span style={{ color: "#c7ccd6" }}>Workspace Name</span>}
            name="workspaceName"
            rules={[{ required: true, message: "Please enter your workspace name" }]}
          >
            <Input placeholder="Workspace Name (e.g., MyWorkspace)" style={{ background: "#222730", color: "#fff" }} />
          </Form.Item>

          <Form.Item
            label={<span style={{ color: "#c7ccd6" }}>Website URL</span>}
            name="websiteUrl"
            rules={[
              { required: true, message: "Please enter your website URL" },
            ]}
          >
            <Input placeholder="Website URL (e.g., https://microsoft.com)" style={{ background: "#222730", color: "#fff" }} />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              style={{
                height: 46,
                fontWeight: 600,
                background: "linear-gradient(180deg, #4f7cf3, #2f5ae7)",
                border: "none",
              }}
            >
              Start Working
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Divider style={{ borderColor: "#334155" }}>OR</Divider>
      <Title level={3} style={{ color: "#cbd5e1", marginBottom: 24 }}>
        Load your existing workspace.
      </Title>
      <Button
        type="default"
        onClick={handleLoadFromFile}
        block
        style={{
          height: 46,
          fontWeight: 600,
          background: "linear-gradient(180deg, #4f7cf3, #2f5ae7)",
          border: "none",
        }} >
        Load from File
      </Button>
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