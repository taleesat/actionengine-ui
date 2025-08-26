import React from "react";
import { Card, Form, Input, Button, Typography, Divider } from "antd";
const { Title } = Typography;

type Props = {
  onNewWorkspace: (workspaceName: string, websiteUrl: string) => void;
  onLoadWorkspace: (file: File) => void;
};

const NewWorkspaceForm: React.FC<Props> = ({ onNewWorkspace, onLoadWorkspace }) => {
  const [form] = Form.useForm();

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
              value: "https://microsoft.com",
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
    </div>
  );
};

export default NewWorkspaceForm;