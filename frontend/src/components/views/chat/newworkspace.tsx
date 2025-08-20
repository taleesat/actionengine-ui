import React, { useState } from "react";

const NewWorkspaceForm: React.FC = () => {
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName || !websiteUrl) {
      alert("Please fill in both fields.");
      return;
    }
    console.log("Workspace Name:", workspaceName);
    console.log("Website URL:", websiteUrl);
    // You can add API call or navigation logic here
  };

  return (
    <div style={styles.container}>
        <div className="text-secondary text-lg mb-6">
        Please enter your workspace name and the website URL to get started.
        </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          placeholder="Workspace Name"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          style={styles.input}
        />
        <input
          type="url"
          placeholder="Website URL"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Start Working</button>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "400px",
    margin: "50px auto",
    textAlign: "center",
    fontFamily: "Arial, sans-serif",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "20px",
  },
  input: {
    padding: "10px",
    fontSize: "16px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  },
  button: {
    padding: "10px",
    fontSize: "16px",
    backgroundColor: "#0078d4",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
};

export default NewWorkspaceForm;