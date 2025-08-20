import React from "react";
import { Card, Form, Input, Button } from "antd";

type Props = {
  onSubmit: (workspaceName: string, websiteUrl: string) => void;
};

const NewWorkspaceForm: React.FC<Props> = ({ onSubmit }) => {
  const [form] = Form.useForm();

  const handleFinish = (workspaceName: string, websiteUrl: string) => {
    onSubmit(workspaceName, websiteUrl);
  };

  return (
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
            { type: "url", message: "Please enter a valid URL (include http/https)" },
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
  );
};

export default NewWorkspaceForm;